// 공식 신청 서식 다운로드 라우트.
// 실제 공식 출처에서 라이브로 서식 파일을 가져오고, 실패 시 사전 저장된 동일 파일로 폴백한다.
// 공식 서식이 등록되지 않은 제도는 noOfficialForm 으로 응답해, UI가 준비 메모(초안)로 폴백하게 한다.

import { NextRequest, NextResponse } from "next/server";
import {
  getOfficialFormByKey,
  resolveOfficialForm,
} from "@/lib/officialForms";
import { readCacheBuffer } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 30;

function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="form"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest) {
  const formId = req.nextUrl.searchParams.get("formId") ?? "";
  const servId = req.nextUrl.searchParams.get("servId") ?? "";
  const name = req.nextUrl.searchParams.get("name") ?? "";
  // 우선순위: formId(레지스트리 키) → name/servId 로 해소
  const meta = formId
    ? getOfficialFormByKey(formId)
    : resolveOfficialForm(name || undefined, servId || undefined);

  if (!meta) {
    // 공식 서식 미등록 → UI가 준비 메모로 폴백하도록 신호
    return NextResponse.json(
      { error: "등록된 공식 서식이 없습니다.", noOfficialForm: true },
      { status: 404 },
    );
  }

  // 1) 공식 출처에서 라이브로 실제 파일 가져오기
  let buf: Buffer | null = null;
  try {
    buf = meta.fetchLive ? await meta.fetchLive() : null;
  } catch {
    buf = null;
  }

  // 2) 라이브 실패 시 사전 저장된 동일 파일로 조용히 폴백
  if (!buf || buf.length === 0) {
    buf = await readCacheBuffer(meta.cacheFile);
  }

  if (!buf || buf.length === 0) {
    return NextResponse.json(
      { error: "서식 파일을 가져오지 못했습니다.", noOfficialForm: true },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": meta.contentType,
      "Content-Disposition": contentDisposition(meta.filename),
      // 출처 표시(디버그/감사용)
      "X-Form-Source": encodeURIComponent(meta.sourceName),
    },
  });
}
