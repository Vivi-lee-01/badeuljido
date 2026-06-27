// 상세 조회 + 신청 준비 패킷 생성 라우트.
// 라이브 상세 → 실패 시 캐시 상세/캐시 패킷으로 조용히 폴백한다.

import { NextRequest, NextResponse } from "next/server";
import { fetchCentralDetail, fetchLocalDetail, parseXml, extractDetail } from "@/lib/welfareClient";
import {
  normalizeCentralDetail,
  normalizeLocalDetail,
  type WelfareItem,
} from "@/lib/normalize";
import { generatePacket, type Packet } from "@/lib/packetGenerator";
import type { UserProfile } from "@/lib/analyzer";
import type { Eligibility } from "@/lib/matcher";
import { readCacheText, readCacheJson } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  servId: string;
  source: "central" | "local";
  profile: UserProfile;
  eligibility?: Eligibility;
  base?: WelfareItem; // 목록에서 얻은 메타(생애주기/지역 등) 보강용
};

async function loadCachedDetail(
  servId: string,
  source: "central" | "local",
  base?: WelfareItem,
): Promise<WelfareItem | null> {
  const file =
    source === "local"
      ? `local_detail_${servId}.xml`
      : `central_detail_${servId}.xml`;
  const xml = await readCacheText(file);
  if (!xml) return null;
  try {
    const detail = extractDetail(parseXml(xml));
    return source === "local"
      ? normalizeLocalDetail(detail, base)
      : normalizeCentralDetail(detail, base);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { servId, source = "central", base } = body;
  const profile: UserProfile = body.profile ?? { rawInput: "", keywords: [] };
  const eligibility: Eligibility = body.eligibility ?? "중간";

  let item: WelfareItem | null = null;
  const useMock = process.env.USE_MOCK === "true";

  if (!useMock && servId) {
    try {
      const raw =
        source === "local"
          ? await fetchLocalDetail(servId)
          : await fetchCentralDetail(servId);
      item =
        source === "local"
          ? normalizeLocalDetail(raw, base)
          : normalizeCentralDetail(raw, base);
      // 상세 본문이 비면 폴백 유도
      if (!item.target && !item.benefit && !item.applicationMethod) item = null;
    } catch {
      item = null;
    }
  }

  // 라이브 실패 → 캐시 상세
  if (!item) {
    item = await loadCachedDetail(servId, source, base);
  }

  // 그래도 없으면 base(목록 메타)로 최소 패킷이라도 만든다
  if (!item && base) {
    item = base;
  }

  if (!item) {
    return NextResponse.json({ error: "상세 정보를 찾지 못했습니다." }, { status: 404 });
  }

  // 패킷 생성: LLM 가능 시 문장 생성, 실패 시 템플릿. 데모 핵심 제도는 캐시 패킷으로도 보장.
  let packet: Packet;
  try {
    packet = await generatePacket(item, profile, eligibility);
  } catch {
    const cached = await readCacheJson<Packet>(`packet_${servId}.json`);
    if (cached) {
      packet = cached;
    } else {
      return NextResponse.json({ error: "패킷 생성 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ item, packet });
}
