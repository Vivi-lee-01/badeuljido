// 공공데이터(복지로) 호출 클라이언트.
// 모든 호출은 서버(API route)에서만 수행하며, DATA_GO_KR_KEY를 프론트로 노출하지 않는다.
// 타임아웃/403/파싱 실패는 throw 하고, 캐시 폴백은 호출하는 route에서 처리한다.

import { XMLParser } from "fast-xml-parser";
import { ENDPOINTS } from "./welfareCodes";

const TIMEOUT_MS = 8000;

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false, // 숫자/코드가 의도치 않게 number로 바뀌지 않게 한다
});

export function parseXml(xml: string): Record<string, unknown> {
  const obj = parser.parse(xml);
  // 공공데이터 표준 에러 응답 감지
  const header =
    (obj?.response?.header as Record<string, unknown>) ??
    (obj?.OpenAPI_ServiceResponse?.cmmMsgHeader as Record<string, unknown>);
  if (header) {
    const code = String(header["resultCode"] ?? header["returnReasonCode"] ?? "");
    if (code && code !== "00" && code !== "0") {
      throw new Error(`공공데이터 오류 응답: ${code}`);
    }
  }
  return obj as Record<string, unknown>;
}

async function fetchXml(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`); // 403 등 포함
    }
    const text = await res.text();
    if (!text || !text.trim().startsWith("<")) {
      throw new Error("XML이 아닌 응답");
    }
    return parseXml(text);
  } finally {
    clearTimeout(timer);
  }
}

function key(): string {
  const k = process.env.DATA_GO_KR_KEY;
  if (!k) throw new Error("DATA_GO_KR_KEY 미설정");
  return k;
}

// servList 배열을 안전하게 추출한다.
export function extractList(obj: Record<string, unknown>): Record<string, unknown>[] {
  const wantedList =
    (obj?.["wantedList"] as Record<string, unknown>) ??
    (obj?.["response"] as Record<string, unknown>)?.["body"] ??
    obj;
  const servList = (wantedList as Record<string, unknown>)?.["servList"];
  if (!servList) return [];
  return Array.isArray(servList) ? servList : [servList];
}

export function extractDetail(obj: Record<string, unknown>): Record<string, unknown> {
  return (
    (obj?.["wantedDtl"] as Record<string, unknown>) ??
    (obj?.["response"] as Record<string, unknown>)?.["body"] as Record<string, unknown> ??
    obj
  );
}

export async function fetchCentralList(searchWrd: string): Promise<Record<string, unknown>[]> {
  const url =
    `${ENDPOINTS.centralList}?serviceKey=${key()}` +
    `&callTp=L&pageNo=1&numOfRows=20&srchKeyCode=003&searchWrd=${encodeURIComponent(searchWrd)}`;
  return extractList(await fetchXml(url));
}

export async function fetchCentralDetail(servId: string): Promise<Record<string, unknown>> {
  const url = `${ENDPOINTS.centralDetail}?serviceKey=${key()}&callTp=D&servId=${encodeURIComponent(servId)}`;
  return extractDetail(await fetchXml(url));
}

export async function fetchLocalList(searchWrd: string): Promise<Record<string, unknown>[]> {
  const url =
    `${ENDPOINTS.localList}?serviceKey=${key()}` +
    `&pageNo=1&numOfRows=20&searchWrd=${encodeURIComponent(searchWrd)}`;
  return extractList(await fetchXml(url));
}

export async function fetchLocalDetail(servId: string): Promise<Record<string, unknown>> {
  const url = `${ENDPOINTS.localDetail}?serviceKey=${key()}&servId=${encodeURIComponent(servId)}`;
  return extractDetail(await fetchXml(url));
}
