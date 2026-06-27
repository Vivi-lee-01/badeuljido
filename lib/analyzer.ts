// 자연어 입력에서 검색에 필요한 구조(UserProfile)를 추출한다.
// MVP는 정규식/키워드 룰을 우선 사용한다. LLM은 있으면 보조로만 쓴다.

export type UserProfile = {
  rawInput: string;
  age?: number;
  childAge?: number;
  region?: string;
  occupation?: string;
  incomeMonthlyKrw?: number;
  keywords: string[];
  lifeArray?: string[];
  targetArray?: string[];
  interestArray?: string[];
};

const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// "월소득 90만원", "월 90만 원", "월급 120만원" 등에서 원 단위 추출
function extractIncome(text: string): number | undefined {
  // 만원 단위
  const man = text.match(/월\s*(?:소득|급|수입|벌이)?\s*(?:이|가|은|는)?\s*약?\s*([0-9]{1,5})\s*만/);
  if (man) return parseInt(man[1], 10) * 10000;
  // "90만원으로" 같이 '월' 앞에 없을 때 소득/수입 맥락이 있으면
  if (/소득|수입|월급|벌이/.test(text)) {
    const m2 = text.match(/([0-9]{2,5})\s*만\s*원/);
    if (m2) return parseInt(m2[1], 10) * 10000;
  }
  return undefined;
}

// 자녀/돌봄 대상을 가리키는 단어. 이 단어 근처의 나이는 "사용자 나이"가 아니라 자녀 나이로 본다.
const CHILD_WORDS = /(딸|아들|아이|자녀|애기|아기|손주|손녀|손자|아동)/;

function extractAges(text: string): {
  userAge?: number;
  childAge?: number;
  hasChild: boolean;
} {
  let hasChild = CHILD_WORDS.test(text);
  let userAge: number | undefined;
  let childAge: number | undefined;
  const re = /([0-9]{1,3})\s*(?:세|살)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (!(n > 0 && n < 120)) continue;
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    const after = text.slice(re.lastIndex, re.lastIndex + 6);
    const nearChild = CHILD_WORDS.test(before) || CHILD_WORDS.test(after);
    if (nearChild) {
      if (childAge === undefined) childAge = n;
      hasChild = true;
    } else if (userAge === undefined) {
      userAge = n;
    }
  }
  return { userAge, childAge, hasChild };
}

function lifeStageFromAge(age?: number): string[] {
  if (age === undefined) return [];
  if (age <= 6) return ["영유아"];
  if (age <= 12) return ["아동"];
  if (age <= 18) return ["청소년"];
  if (age <= 39) return ["청년"];
  if (age <= 64) return ["중장년"];
  return ["노년"];
}

// 키워드 → 관심주제/대상 매핑 규칙
const KEYWORD_RULES: Array<{
  match: RegExp;
  keyword: string;
  interest?: string;
  target?: string;
}> = [
  { match: /구직|취업|일자리|실업|일이\s*줄|일감/, keyword: "구직", interest: "일자리" },
  { match: /생계|막막|생활비|먹고|끼니/, keyword: "생계", interest: "생활지원" },
  { match: /소득\s*(?:감소|줄|하락)|수입\s*(?:감소|줄)|벌이.*줄/, keyword: "소득감소", target: "저소득" },
  { match: /저소득|형편\s*어려|어렵|빈곤/, keyword: "저소득", target: "저소득" },
  { match: /건강보험|건보료|보험료/, keyword: "건강보험료", interest: "신체건강" },
  { match: /월세|전세|주거|집값|임대|보증금/, keyword: "주거", interest: "주거" },
  { match: /프리랜서|자영업|특고|플랫폼|아르바이트|알바|일용/, keyword: "프리랜서", target: "저소득" },
  { match: /육아|보육|어린이집|양육|키우|돌봄/, keyword: "양육", interest: "보육" },
  { match: /미혼모|미혼부|한부모|조손|홀로\s*키우|혼자\s*키우|혼자서\s*키우|이혼|사별|독박/, keyword: "한부모", target: "한부모조손", interest: "생활지원" },
  { match: /질병|아파|치료|병원|장애/, keyword: "건강", interest: "신체건강" },
  { match: /교육|학비|등록금|학자금/, keyword: "교육", interest: "교육" },
];

function extractOccupation(text: string): string | undefined {
  const occ = [
    "프리랜서", "자영업", "특수고용", "플랫폼노동", "일용직", "아르바이트",
    "무직", "구직자", "직장인", "근로자", "학생", "주부",
  ];
  for (const o of occ) {
    if (text.includes(o)) return o;
  }
  if (/알바/.test(text)) return "아르바이트";
  if (/미혼모|미혼부|한부모/.test(text)) return "한부모 가구";
  return undefined;
}

export function analyze(rawInput: string): UserProfile {
  const text = rawInput.trim();

  const region = REGIONS.find((r) => text.includes(r));
  const { userAge, childAge, hasChild } = extractAges(text);
  const incomeMonthlyKrw = extractIncome(text);
  const occupation = extractOccupation(text);

  const keywords = new Set<string>();
  const interest = new Set<string>();
  const target = new Set<string>();

  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(text)) {
      keywords.add(rule.keyword);
      if (rule.interest) interest.add(rule.interest);
      if (rule.target) target.add(rule.target);
    }
  }

  // 사용자 나이 기준 생애주기. 자녀 나이는 사용자 생애주기로 쓰지 않는다.
  const lifeArray = lifeStageFromAge(userAge);

  // 자녀가 있으면 양육/보육 신호를 보강한다.
  if (hasChild) {
    keywords.add("양육");
    interest.add("보육");
  }

  // 청년이고 구직 맥락이면 일자리 관심을 보강
  if (lifeArray.includes("청년") && keywords.has("구직")) {
    interest.add("일자리");
  }

  return {
    rawInput: text,
    age: userAge,
    childAge,
    region,
    occupation,
    incomeMonthlyKrw,
    keywords: Array.from(keywords),
    lifeArray,
    targetArray: Array.from(target),
    interestArray: Array.from(interest),
  };
}

// LLM 보조 분석: 정규식 결과를 LLM으로 보강/교정한다.
// 발표 해피패스의 3초 응답을 지키기 위해 기본은 꺼져 있고(LLM_ANALYZE=true 일 때만),
// 실패/지연 시 정규식 결과를 그대로 쓴다.
export async function analyzeWithLLM(rawInput: string): Promise<UserProfile> {
  const base = analyze(rawInput);
  if ((process.env.LLM_ANALYZE ?? "").trim() !== "true") return base;

  try {
    const { chatJson, llmEnabled } = await import("./llm");
    if (!llmEnabled()) return base;

    const system =
      "너는 한국 공공복지 상담 보조다. 사용자의 자연어 입력에서 검색에 필요한 구조만 추출하라. " +
      "추측하지 말고, 명시되지 않은 값은 null로 둔다. JSON 객체 하나만 출력하라. " +
      "키: age(number|null), region(string|null, 시도명), occupation(string|null), " +
      "incomeMonthlyKrw(number|null, 원 단위), keywords(string[]).";
    const parsed = await chatJson({
      system,
      user: rawInput,
      maxTokens: 400,
      temperature: 0,
      timeoutMs: 6000,
    });

    const merged: UserProfile = {
      ...base,
      age: typeof parsed.age === "number" ? parsed.age : base.age,
      region: typeof parsed.region === "string" ? parsed.region : base.region,
      occupation:
        typeof parsed.occupation === "string" ? parsed.occupation : base.occupation,
      incomeMonthlyKrw:
        typeof parsed.incomeMonthlyKrw === "number"
          ? parsed.incomeMonthlyKrw
          : base.incomeMonthlyKrw,
      keywords: Array.isArray(parsed.keywords)
        ? Array.from(new Set([...base.keywords, ...parsed.keywords.map(String)]))
        : base.keywords,
    };
    return merged;
  } catch {
    return base;
  }
}

// 검색어 생성: 키워드와 관심주제를 조합한다.
export function buildSearchQuery(profile: UserProfile): string {
  const parts = new Set<string>();
  for (const k of profile.keywords) parts.add(k);
  if (parts.size === 0 && profile.rawInput) {
    // 키워드가 비면 입력의 핵심 명사 일부라도 사용
    parts.add(profile.occupation ?? "복지");
  }
  return Array.from(parts).slice(0, 4).join(" ");
}
