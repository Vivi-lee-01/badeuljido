// LLM 기반 제도 추천 엔진 (핵심).
// 사용자의 자연어 상황을 OpenAI에 입력해 실제로 추론하여, 걸맞는 한국 공공복지 제도를
// TOP3로 추천한다. 하드코딩 키워드 매핑/부스팅이 아니라 LLM의 추론 결과를 사용한다.
//
// 추천된 제도가 우리가 실데이터(상세/서식)를 보유한 제도면 실제 servId에 연결하고,
// 아니면 LLM이 만든 정보로 표시한다(상세/서식은 일반 안내로 폴백).

import type { WelfareItem } from "./normalize";
import type { UserProfile } from "./analyzer";
import type { Eligibility, RankedItem } from "./matcher";
import { chatJson, llmEnabled } from "./llm";

// 우리가 실제 상세/서식 데이터를 보유한 제도 (이름 → servId 매핑).
// LLM이 추천한 제도명을 실데이터에 연결하기 위한 용도일 뿐, 추천 자체는 LLM이 한다.
const KNOWN_PROGRAMS: Array<{
  match: RegExp;
  servId: string;
  source: "central" | "local";
}> = [
  { match: /국민\s*취업\s*지원/, servId: "WLF00003245", source: "central" },
  { match: /긴급\s*복지/, servId: "WLF00000130", source: "central" },
  { match: /청년\s*월세/, servId: "WLF00000456", source: "central" },
  { match: /청년\s*수당/, servId: "WLF00006135", source: "local" },
];

function resolveKnown(name: string): { servId: string; source: "central" | "local" } | null {
  for (const k of KNOWN_PROGRAMS) {
    if (k.match.test(name)) return { servId: k.servId, source: k.source };
  }
  return null;
}

function normalizeEligibility(v: unknown): Eligibility {
  const s = String(v ?? "").trim();
  if (s.includes("높")) return "높음";
  if (s.includes("낮")) return "낮음";
  return "중간";
}

function slug(name: string): string {
  return "LLM_" + Buffer.from(name).toString("base64url").slice(0, 16);
}

type LlmRec = {
  name?: string;
  agency?: string;
  summary?: string;
  reason?: string;
  eligibility?: string;
  eligibilityReason?: string;
};

// LLM으로 추천을 받아 RankedItem 배열로 변환한다. 실패 시 throw (호출부에서 폴백).
export async function recommendWithLLM(
  input: string,
  profile: UserProfile,
): Promise<RankedItem[]> {
  if (!llmEnabled()) throw new Error("LLM 비활성");

  const system =
    "너는 한국 공공복지 상담 전문가다. 사용자가 자연어로 말한 상황을 읽고, " +
    "실제로 존재하는 한국의 공공복지 제도(중앙부처·지자체) 중 가장 적합한 것을 추론해 추천한다.\n" +
    "규칙:\n" +
    "1) 반드시 실재하는 제도의 정확한 공식 명칭을 사용한다. 존재하지 않는 제도를 지어내지 않는다.\n" +
    "2) 사용자의 상황(지역·나이·소득·생애주기·관심사)을 근거로 관련성이 높은 순서로 정렬한다.\n" +
    "3) 합격/불합격을 단정하지 말고 '지원 가능성'을 높음/중간/낮음으로만 표현한다. 최종 자격은 기관 확인이 필요함을 전제한다.\n" +
    "4) 각 제도에 추천 이유를 사용자 상황과 연결해 1~2문장으로 쓴다.\n" +
    "5) 핵심 니즈를 직접 해결하는 '중앙부처 대표 제도'를 1순위로 우선한다. 지자체·부가 제도는 그다음.\n" +
    "6) 가장 적합한 3개만 추천한다.\n" +
    "\n" +
    "참고(상황 유형별 대표 중앙부처 제도 — 사용자 상황에 맞을 때만 추론에 활용):\n" +
    "- 저소득 구직자·실업·소득 감소·프리랜서/특고의 일자리+생계: 국민취업지원제도(고용노동부, 한국형 실업부조)\n" +
    "- 갑작스러운 위기로 생계 곤란: 긴급복지지원(보건복지부)\n" +
    "- 65세 이상 저소득 노인 소득보전: 기초연금 / 기초생활보장 생계급여\n" +
    "- 난방·전기 등 에너지비용: 에너지바우처\n" +
    "- 한부모·미혼모/부 양육: 한부모가족 지원사업, 아이돌봄 서비스\n" +
    "- 임신·출산: 산모·신생아 건강관리 지원사업, 첫만남이용권, 부모급여\n" +
    "- 청년 주거: 청년월세 특별지원\n" +
    '반드시 JSON 하나만 출력: {"recommendations":[{"name","agency","summary","reason","eligibility":"높음|중간|낮음","eligibilityReason"}]}';

  const user = JSON.stringify({
    상황_원문: input,
    참고_분석: {
      지역: profile.region ?? null,
      나이: profile.age ?? null,
      직업: profile.occupation ?? null,
      월소득원: profile.incomeMonthlyKrw ?? null,
      키워드: profile.keywords,
    },
  });

  const parsed = await chatJson({
    system,
    user,
    maxTokens: 1500,
    temperature: 0.3,
    timeoutMs: 20000,
  });

  const recs = Array.isArray(parsed.recommendations)
    ? (parsed.recommendations as LlmRec[])
    : [];
  if (recs.length === 0) throw new Error("LLM 추천 0건");

  const ranked: RankedItem[] = [];
  let order = 0;
  for (const rec of recs) {
    const name = String(rec.name ?? "").trim();
    if (!name) continue;
    const known = resolveKnown(name);
    const item: WelfareItem = {
      id: known?.servId ?? slug(name),
      source: known?.source ?? ("central" as const),
      name,
      agency: rec.agency ? String(rec.agency) : undefined,
      summary: rec.summary ? String(rec.summary) : undefined,
      applicationLinks: [],
      contacts: [],
      forms: [],
      raw: rec,
    };
    const eligibility = normalizeEligibility(rec.eligibility);
    ranked.push({
      item,
      score: 1000 - order, // LLM이 정렬한 순서를 점수로 보존
      eligibility,
      matchReasons: rec.eligibilityReason
        ? [String(rec.eligibilityReason)]
        : [],
    });
    order += 1;
    if (ranked.length >= 3) break;
  }

  if (ranked.length === 0) throw new Error("LLM 추천 파싱 실패");
  return ranked;
}
