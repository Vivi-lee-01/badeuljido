// 정규화된 결과를 랭킹하고 지원 가능성 배지를 만든다.
// 데모 입력 부스팅은 스펙에 명시된 키워드가 함께 포함될 때만 적용한다.

import type { WelfareItem } from "./normalize";
import type { UserProfile } from "./analyzer";
import { DEMO_SERV_ID } from "./welfareCodes";

export type Eligibility = "높음" | "중간" | "낮음";

export type RankedItem = {
  item: WelfareItem;
  score: number;
  eligibility: Eligibility;
  matchReasons: string[];
};

// 데모 부스팅 조건: rawInput에 서울 + 프리랜서 + (소득|월소득) + (구직|생계) 가 함께 포함될 때만.
export function isDemoInput(rawInput: string): boolean {
  const t = rawInput;
  const hasSeoul = t.includes("서울");
  const hasFreelancer = t.includes("프리랜서");
  const hasIncome = t.includes("소득") || t.includes("월소득");
  const hasJobOrLiving = t.includes("구직") || t.includes("생계");
  return hasSeoul && hasFreelancer && hasIncome && hasJobOrLiving;
}

function haystack(item: WelfareItem): string {
  return [
    item.name,
    item.summary,
    item.agency,
    item.target,
    item.selectionCriteria,
    item.benefit,
    ...(item.lifeArray ?? []),
    ...(item.targetArray ?? []),
    ...(item.interestArray ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

type Signals = {
  region: boolean;
  life: boolean;
  interest: boolean;
  target: boolean;
  keywordHits: number;
};

function computeSignals(item: WelfareItem, profile: UserProfile): Signals {
  const hay = haystack(item);

  const region =
    !!profile.region &&
    (item.region?.includes(profile.region) ||
      hay.includes(profile.region) ||
      // 중앙부처(전국 단위)는 지역 조건을 만족한 것으로 본다
      item.source === "central");

  const life =
    (profile.lifeArray ?? []).some((l) => hay.includes(l)) ||
    (profile.lifeArray?.includes("청년") && /청년/.test(hay)) ||
    false;

  const interest = (profile.interestArray ?? []).some((i) => hay.includes(i));

  const target =
    (profile.targetArray ?? []).some((tg) => hay.includes(tg)) ||
    (profile.incomeMonthlyKrw !== undefined && /저소득|소득|차상위|기초생활/.test(hay));

  const keywordHits = profile.keywords.filter((k) => hay.includes(k)).length;

  return { region: !!region, life: !!life, interest, target, keywordHits };
}

function eligibilityFrom(sig: Signals): { eligibility: Eligibility; reasons: string[] } {
  const reasons: string[] = [];
  let solid = 0;
  if (sig.region) {
    solid += 1;
    reasons.push("거주 지역 조건 부합");
  }
  if (sig.life) {
    solid += 1;
    reasons.push("나이/생애주기 부합");
  }
  if (sig.interest) {
    solid += 1;
    reasons.push("관심 주제 부합");
  }
  if (sig.target) {
    solid += 1;
    reasons.push("소득/대상 조건 관련");
  }

  let eligibility: Eligibility;
  if (solid >= 2) eligibility = "높음";
  else if (solid === 1 || sig.keywordHits >= 2) eligibility = "중간";
  else eligibility = "낮음";

  if (sig.keywordHits > 0) reasons.push(`키워드 ${sig.keywordHits}개 일치`);
  return { eligibility, reasons };
}

function baseScore(sig: Signals): number {
  return (
    (sig.region ? 30 : 0) +
    (sig.life ? 25 : 0) +
    (sig.interest ? 20 : 0) +
    (sig.target ? 20 : 0) +
    sig.keywordHits * 8
  );
}

export function rank(items: WelfareItem[], profile: UserProfile): RankedItem[] {
  const demo = isDemoInput(profile.rawInput);

  // id 기준 중복 제거 (중앙/지자체 합산 시)
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const k = `${it.source}:${it.id}`;
    if (!it.id || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const ranked: RankedItem[] = unique.map((item) => {
    const sig = computeSignals(item, profile);
    const { eligibility, reasons } = eligibilityFrom(sig);
    let score = baseScore(sig);

    // 데모 부스팅: 국민취업지원제도를 최상위로. 명시된 키워드 동시 포함 시에만.
    if (demo && item.id === DEMO_SERV_ID) {
      score += 1000;
    }

    return { item, score, eligibility, matchReasons: reasons };
  });

  ranked.sort((a, b) => b.score - a.score);

  // 데모 부스팅이 걸렸는데 국민취업지원제도 배지가 낮음이면 최소 높음으로 보정
  if (demo) {
    const top = ranked.find((r) => r.item.id === DEMO_SERV_ID);
    if (top) top.eligibility = "높음";
  }

  return ranked;
}

export function top3(items: WelfareItem[], profile: UserProfile): RankedItem[] {
  return rank(items, profile).slice(0, 3);
}
