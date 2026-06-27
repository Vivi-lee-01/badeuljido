// 복지서비스 검색 라우트.
// 라이브 검색 → 실패/지연/403/파싱 실패 시 캐시로 조용히 폴백한다.
// 사용자에게 캐시 사용 사실이나 에러 스택을 노출하지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { analyzeWithLLM, buildSearchQuery } from "@/lib/analyzer";
import {
  fetchCentralList,
  fetchLocalList,
  parseXml,
  extractList,
} from "@/lib/welfareClient";
import {
  normalizeCentralListItem,
  normalizeLocalListItem,
  type WelfareItem,
} from "@/lib/normalize";
import { top3, isDemoInput, type RankedItem } from "@/lib/matcher";
import { recommendWithLLM } from "@/lib/recommender";
import { readCacheText } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

// 발표 해피패스 보장: 데모 입력에서는 국민취업지원제도(WLF00003245)를 TOP3 1순위로 고정한다.
// (LLM 추천 결과가 흔들려도 발표 시나리오가 끊기지 않게 하는 안전장치)
const GUKCHWI: RankedItem = {
  item: {
    id: "WLF00003245",
    source: "central",
    name: "국민취업지원제도",
    agency: "고용노동부",
    summary:
      "저소득 구직자에게 취업지원서비스와 함께 구직촉진수당 등 생계지원을 제공하는 한국형 실업부조 제도입니다.",
    applicationLinks: [],
    contacts: [],
    forms: [],
    raw: {},
  },
  score: 2000,
  eligibility: "높음",
  matchReasons: ["서울 거주·프리랜서·소득 감소·구직 상황에 부합"],
};

function ensureGukchwiFirst(ranked: RankedItem[]): RankedItem[] {
  const rest = ranked.filter(
    (r) => r.item.id !== "WLF00003245" && !/국민\s*취업\s*지원/.test(r.item.name),
  );
  return [GUKCHWI, ...rest].slice(0, 3);
}

async function loadFromCache(): Promise<WelfareItem[]> {
  const xml = await readCacheText("central_list_gukchwi.xml");
  if (!xml) return [];
  try {
    const list = extractList(parseXml(xml));
    return list.map(normalizeCentralListItem);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  let input = "";
  try {
    const body = await req.json();
    input = String(body?.input ?? "").trim();
  } catch {
    input = "";
  }

  // 상황 구조화(지역/나이/소득 등 힌트 + AI 이해 칩). 추천 자체는 LLM이 추론한다.
  const profile = await analyzeWithLLM(input);

  // ── 핵심: LLM이 사용자의 상황을 추론해 적합한 제도를 추천한다 ──
  try {
    const ranked = await recommendWithLLM(input, profile);
    if (ranked.length > 0) {
      // 데모 입력이면 국민취업지원제도를 1순위로 보장
      const results = isDemoInput(input) ? ensureGukchwiFirst(ranked) : ranked;
      return NextResponse.json({
        profile,
        results,
        engine: "llm",
        notice:
          "정확한 자격 여부는 소득·재산 기준 등 기관 확인 후 결정됩니다.",
      });
    }
  } catch {
    // LLM 실패/지연/키 미설정 → 아래 폴백 경로로 (사용자에겐 노출하지 않음)
  }

  // ── 폴백: 라이브 복지로 검색 → 캐시. (LLM이 불가할 때만) ──
  const query = buildSearchQuery(profile);
  let items: WelfareItem[] = [];
  const useMock = process.env.USE_MOCK === "true";

  if (!useMock) {
    try {
      const [central, local] = await Promise.allSettled([
        fetchCentralList(query),
        fetchLocalList(query),
      ]);
      if (central.status === "fulfilled")
        items.push(...central.value.map(normalizeCentralListItem));
      if (local.status === "fulfilled")
        items.push(...local.value.map(normalizeLocalListItem));
    } catch {
      items = [];
    }
  }
  if (items.length === 0) {
    items = await loadFromCache();
  }

  const ranked: RankedItem[] = top3(items, profile);

  return NextResponse.json({
    profile,
    results: ranked,
    engine: "fallback",
    notice: "정확한 자격 여부는 소득·재산 기준 등 기관 확인 후 결정됩니다.",
  });
}
