// 상세 결과 + 사용자 입력으로 신청 준비 패킷을 만든다.
// LLM을 쓸 수 있으면 자연어 문장을 생성하고, 실패하면 템플릿 fallback을 사용한다.
//
// 생성 원칙:
// - 사용자가 말한 사실만 사용한다.
// - 모르는 값은 〔본인 확인 필요〕로 둔다.
// - 과장·허위·자격 확정 표현을 만들지 않는다.
// - 기관 확인 필요성을 항상 포함한다.

import type { WelfareItem } from "./normalize";
import type { UserProfile } from "./analyzer";
import type { Eligibility } from "./matcher";
import { chatJson, llmEnabled } from "./llm";
import { resolveOfficialForm, officialSearchUrl } from "./officialForms";

export type Packet = {
  servId: string;
  name: string;
  agency?: string;
  eligibility: Eligibility;
  reason: string;
  eligibilityNote: string;
  applicationMethod: string;
  contacts: Array<{ label: string; value: string }>;
  links: Array<{ label: string; url?: string }>;
  forms: Array<{ name: string; url?: string }>;
  applicationDraft: string;
  inquiryDraft: string;
  sources: Array<{ label: string; url?: string }>;
  disclaimer: string;
  // 실제 공식 신청 서식 (있을 때만). 다운로드 버튼이 이 서식을 우선 내려준다.
  officialForm?: {
    title: string;
    sourceName: string;
    sourcePageUrl: string;
  } | null;
  // 공식 서식 레지스트리 키 (있으면 /api/document/form?formId= 로 실제 서식 다운로드)
  formId?: string | null;
  // 다운로드용 서식이 없을 때 안내할 공식 신청 바로가기 URL (항상 채움)
  applyUrl: string;
};

export const DISCLAIMER =
  "정확한 자격 여부는 소득·재산 기준 등 기관 확인 후 결정됩니다. 받을지도는 신청 준비를 돕는 보조 도구이며, 자격을 확정하거나 신청을 대행하지 않습니다.";

const UNKNOWN = "〔본인 확인 필요〕";

// 사용자가 말한 사실만 모아 한 문장 형태로 정리한다.
function describeUser(profile: UserProfile): string {
  const facts: string[] = [];
  if (profile.region) facts.push(`${profile.region} 거주`);
  if (profile.age !== undefined) facts.push(`${profile.age}세`);
  if (profile.occupation) facts.push(profile.occupation);
  if (profile.incomeMonthlyKrw !== undefined) {
    facts.push(`월소득 약 ${Math.round(profile.incomeMonthlyKrw / 10000)}만원`);
  }
  return facts.join(", ");
}

function buildReason(item: WelfareItem, profile: UserProfile): string {
  const userLine = describeUser(profile);
  const concerns: string[] = [];
  if (profile.keywords.includes("구직")) concerns.push("구직");
  if (profile.keywords.includes("생계") || profile.keywords.includes("소득감소"))
    concerns.push("소득 감소·생계");
  if (profile.keywords.includes("건강보험료")) concerns.push("건강보험료 부담");
  const concernLine = concerns.length ? `${concerns.join(", ")} 어려움` : "현재 상황";

  return (
    `${userLine ? userLine + " 상황에서 " : ""}말씀하신 ${concernLine}과(와) ` +
    `${item.name}의 지원 취지가 맞닿아 추천드립니다. ` +
    (item.summary ? `이 제도는 ${item.summary}` : "")
  ).trim();
}

function buildEligibilityNote(item: WelfareItem): string {
  const checks: string[] = [];
  if (item.target) checks.push(`지원대상: ${item.target}`);
  if (item.selectionCriteria) checks.push(`선정기준: ${item.selectionCriteria}`);
  const base = checks.length
    ? checks.join("\n")
    : "구체적인 소득·재산·연령 요건은 기관 안내를 확인해야 합니다.";
  return (
    `${base}\n\n` +
    `확인할 점: 가구 소득·재산 기준 충족 여부, 신청 시점의 자격 요건은 신청 후 기관 심사로 확정됩니다.`
  );
}

function buildApplicationDraft(item: WelfareItem, profile: UserProfile): string {
  const region = profile.region ?? UNKNOWN;
  const age = profile.age !== undefined ? `${profile.age}세` : UNKNOWN;
  const occ = profile.occupation ?? UNKNOWN;
  const income =
    profile.incomeMonthlyKrw !== undefined
      ? `약 ${Math.round(profile.incomeMonthlyKrw / 10000)}만원`
      : UNKNOWN;

  const situation: string[] = [];
  if (profile.keywords.includes("소득감소") || profile.keywords.includes("생계"))
    situation.push("최근 일감이 줄어 소득이 감소했고 생계가 어렵습니다");
  if (profile.keywords.includes("구직"))
    situation.push("안정적인 일자리를 찾기 위해 구직활동을 이어가고 있습니다");
  if (profile.keywords.includes("건강보험료"))
    situation.push("건강보험료 부담도 큰 상황입니다");
  const situationLine = situation.length
    ? situation.join(". ") + "."
    : "현재 경제적으로 어려운 상황입니다.";

  return (
    `안녕하세요. ${region}에 거주하는 ${age} ${occ}입니다.\n` +
    `현재 월소득은 ${income} 수준입니다. ${situationLine}\n` +
    `${item.name} 지원이 필요하여 신청 준비를 하고 있습니다. ` +
    `필요한 서류와 신청 절차, 제 상황에서 지원 가능 여부를 안내받고 싶습니다.\n\n` +
    `※ 주민등록번호, 상세 주소, 계좌번호 등은 ${UNKNOWN}로 두었으니 신청서 작성 시 본인이 직접 기재하세요.`
  );
}

function buildInquiryDraft(item: WelfareItem, profile: UserProfile): string {
  const contact = item.contacts[0]?.value ?? item.agency ?? "담당 기관";
  const region = profile.region ?? "";
  return (
    `[${item.name} 문의]\n` +
    `${region ? region + "에 거주하는 " : ""}구직·생계 지원이 필요한 시민입니다.\n` +
    `1) 제 상황(소득 감소, 구직 중)에서 ${item.name} 신청이 가능한지\n` +
    `2) 신청에 필요한 서류와 절차\n` +
    `3) 처리 기간\n` +
    `위 내용을 안내받고 싶습니다. 문의처: ${contact}. ` +
    `정확한 자격은 기관 확인이 필요하다는 점 이해하고 있으며, 확인을 요청드립니다.`
  );
}

// 템플릿 fallback 패킷 생성
export function buildTemplatePacket(
  item: WelfareItem,
  profile: UserProfile,
  eligibility: Eligibility,
): Packet {
  const links: Array<{ label: string; url?: string }> = [...item.applicationLinks];
  if (item.detailLink && !links.some((l) => l.url === item.detailLink)) {
    links.push({ label: "복지로 상세 보기", url: item.detailLink });
  }

  const sources: Array<{ label: string; url?: string }> = [
    {
      label:
        item.source === "central"
          ? "복지로 중앙부처 복지서비스"
          : "복지로 지자체 복지서비스",
      url: item.detailLink,
    },
  ];

  // 실제 공식 서식을 "제도명"으로 해소한다(공통서식이 여러 제도를 커버).
  const official = resolveOfficialForm(item.name, item.id);
  if (official) {
    sources.push({
      label: `${official.sourceName} — ${official.title}`,
      url: official.sourcePageUrl,
    });
  }

  return {
    servId: item.id,
    name: item.name,
    agency: item.agency,
    eligibility,
    reason: buildReason(item, profile),
    eligibilityNote: buildEligibilityNote(item),
    applicationMethod:
      item.applicationMethod ??
      "온라인 또는 관할 기관 방문 신청. 자세한 절차는 공식 링크와 문의처를 확인하세요.",
    contacts: item.contacts.length
      ? item.contacts
      : [{ label: "안내", value: "복지로(129) 또는 소관 기관 문의" }],
    links,
    forms: item.forms,
    applicationDraft: buildApplicationDraft(item, profile),
    inquiryDraft: buildInquiryDraft(item, profile),
    sources,
    disclaimer: DISCLAIMER,
    officialForm: official
      ? {
          title: official.title,
          sourceName: official.sourceName,
          sourcePageUrl: official.sourcePageUrl,
        }
      : null,
    formId: official?.key ?? null,
    // 서식이 있으면 출처 페이지, 없으면 정부24 통합검색으로 공식 신청처 안내
    applyUrl: official?.sourcePageUrl ?? officialSearchUrl(item.name),
  };
}

// LLM이 가능하면(OPENAI_API_KEY 존재) 문장을 생성하고, 실패하면 템플릿으로 조용히 폴백한다.
// LLM_PROVIDER=none 이면 키가 있어도 강제로 템플릿만 쓴다.
export async function generatePacket(
  item: WelfareItem,
  profile: UserProfile,
  eligibility: Eligibility,
): Promise<Packet> {
  const template = buildTemplatePacket(item, profile, eligibility);

  const forcedOff = (process.env.LLM_PROVIDER ?? "").trim() === "none";
  if (forcedOff || !llmEnabled()) {
    return template;
  }

  try {
    return await enrichWithLLM(template, item, profile, eligibility);
  } catch {
    // LLM 실패/지연은 사용자에게 노출하지 않고 템플릿으로 조용히 폴백
    return template;
  }
}

// LLM으로 추천 이유 / 신청 문장 / 문의 메시지를 생성한다.
// 안전장치: 사용자가 말한 사실만 사용, 모르는 값은 〔본인 확인 필요〕, 자격 확정 표현 금지.
async function enrichWithLLM(
  template: Packet,
  item: WelfareItem,
  profile: UserProfile,
  eligibility: Eligibility,
): Promise<Packet> {
  const system =
    "너는 한국 공공복지 신청을 돕는 보조 작가다. 다음 규칙을 반드시 지켜라.\n" +
    "1) 사용자가 말한 사실만 사용한다. 추측으로 정보를 만들지 않는다.\n" +
    "2) 모르는 값(주민번호·상세주소·계좌번호 등)은 절대 채우지 말고 〔본인 확인 필요〕로 둔다.\n" +
    "3) 과장·허위·자격 확정 표현(예: '반드시 받을 수 있습니다')을 쓰지 않는다. 자격은 기관 확인이 필요함을 전제한다.\n" +
    "4) 정중한 한국어 존댓말로 자연스럽고 구체적으로 쓴다.\n" +
    "5) 반드시 JSON 객체 하나만 출력한다. 키: reason, applicationDraft, inquiryDraft.";

  const user = JSON.stringify({
    제도: {
      이름: item.name,
      소관기관: item.agency ?? null,
      요약: item.summary ?? null,
      지원대상: item.target ?? null,
      선정기준: item.selectionCriteria ?? null,
      지원내용: item.benefit ?? null,
      신청방법: item.applicationMethod ?? null,
      문의처: item.contacts.map((c) => `${c.label}: ${c.value}`),
    },
    사용자_말한_사실: {
      원문: profile.rawInput,
      지역: profile.region ?? null,
      나이: profile.age ?? null,
      직업: profile.occupation ?? null,
      월소득원: profile.incomeMonthlyKrw ?? null,
      키워드: profile.keywords,
    },
    지원가능성: eligibility,
    요청: {
      reason: "이 사용자에게 이 제도를 추천하는 이유 2~3문장. 사용자 상황과 제도 취지를 연결.",
      applicationDraft:
        "신청서/상담용 본인 진술 문장. 사용자의 소득감소·직업·구직 어려움 등을 반영. 모르는 PII는 〔본인 확인 필요〕.",
      inquiryDraft:
        "담당 기관에 보낼 문의 메시지. 신청 가능 여부·필요 서류·절차를 묻고, 자격은 기관 확인이 필요함을 명시. 문의처 포함.",
    },
  });

  const parsed = await chatJson({ system, user, maxTokens: 1600, temperature: 0.35 });

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : template.reason;
  const applicationDraft =
    typeof parsed.applicationDraft === "string" && parsed.applicationDraft.trim()
      ? parsed.applicationDraft.trim()
      : template.applicationDraft;
  const inquiryDraft =
    typeof parsed.inquiryDraft === "string" && parsed.inquiryDraft.trim()
      ? parsed.inquiryDraft.trim()
      : template.inquiryDraft;

  return { ...template, reason, applicationDraft, inquiryDraft };
}
