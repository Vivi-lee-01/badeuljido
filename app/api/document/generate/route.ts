// 신청서 다운로드 라우트.
// 1) 런타임 .hwpx 생성 시도 → 2) 사전 생성 .hwpx → 3) .docx 폴백.
// 사용자에게는 항상 파일이 끊기지 않고 내려가야 한다.

import { NextRequest, NextResponse } from "next/server";
import { buildHwpx, buildDocx } from "@/lib/docGen";
import type { Packet } from "@/lib/packetGenerator";
import { readCacheBuffer, readCacheJson } from "@/lib/cache";

export const runtime = "nodejs";

// RFC5987: 한글 파일명을 안전하게 내려준다.
function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`;
}

function fileName(name: string, ext: string): string {
  const safe = (name || "신청준비").replace(/[\\/:*?"<>|]/g, "");
  return `받을지도_${safe}_신청준비.${ext}`;
}

export async function POST(req: NextRequest) {
  let packet: Packet | null = null;
  let servId = "";
  try {
    const body = await req.json();
    packet = body?.packet ?? null;
    servId = String(body?.servId ?? packet?.servId ?? "");
  } catch {
    packet = null;
  }

  // 패킷이 없으면 캐시 패킷으로 폴백 (데모 안전망)
  if (!packet && servId) {
    packet = await readCacheJson<Packet>(`packet_${servId}.json`);
  }
  if (!packet) {
    return NextResponse.json({ error: "문서 데이터 없음" }, { status: 400 });
  }

  const name = packet.name || "신청준비";

  // 1) 런타임 .hwpx 생성 시도
  try {
    const buf = await buildHwpx(packet);
    if (buf && buf.length > 0) {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/hwp+zip",
          "Content-Disposition": contentDisposition(fileName(name, "hwpx")),
        },
      });
    }
  } catch {
    // 다음 폴백으로 진행
  }

  // 2) 사전 생성 .hwpx
  if (servId) {
    const cachedHwpx = await readCacheBuffer(`document_${servId}.hwpx`);
    if (cachedHwpx) {
      return new NextResponse(new Uint8Array(cachedHwpx), {
        status: 200,
        headers: {
          "Content-Type": "application/hwp+zip",
          "Content-Disposition": contentDisposition(fileName(name, "hwpx")),
        },
      });
    }
  }

  // 3) .docx 폴백 (런타임 생성 → 사전 생성)
  try {
    const buf = await buildDocx(packet);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(fileName(name, "docx")),
      },
    });
  } catch {
    // 최후의 사전 생성 .docx
    if (servId) {
      const cachedDocx = await readCacheBuffer(`document_${servId}.docx`);
      if (cachedDocx) {
        return new NextResponse(new Uint8Array(cachedDocx), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": contentDisposition(fileName(name, "docx")),
          },
        });
      }
    }
    return NextResponse.json({ error: "문서 생성 실패" }, { status: 500 });
  }
}
