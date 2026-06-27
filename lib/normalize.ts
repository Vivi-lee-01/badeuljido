// 중앙부처/지자체 복지 응답을 공통 스키마(WelfareItem)로 변환하는 단일 진입점.
// 각 소스의 필드 차이가 이 파일 밖으로 새어 나가지 않게 한다.

export type WelfareItem = {
  id: string;
  source: "central" | "local";
  name: string;
  agency?: string;
  summary?: string;
  target?: string;
  selectionCriteria?: string;
  benefit?: string;
  applicationMethod?: string;
  applicationLinks: Array<{ label: string; url?: string }>;
  contacts: Array<{ label: string; value: string }>;
  forms: Array<{ name: string; url?: string }>;
  detailLink?: string;
  // 매칭 보조 메타데이터 (랭킹/배지 계산용)
  region?: string;
  lifeArray?: string[];
  targetArray?: string[];
  interestArray?: string[];
  raw: unknown;
};

// 값이 단일/배열/누락 어느 경우든 항상 배열로 강제한다.
function asArray<T>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

// "구직, 생계 지원" 같은 콤마/구분자 문자열을 토큰 배열로 만든다.
function splitTokens(v: unknown): string[] {
  if (!v) return [];
  return String(v)
    .split(/[,/·|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

// 여러 후보 키 중 처음으로 값이 있는 것을 고른다 (라이브 응답 필드명 흔들림 방어).
function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const val = str(obj[k]);
    if (val) return val;
  }
  return undefined;
}

// ---- 중앙부처 ----

export function normalizeCentralListItem(item: Record<string, unknown>): WelfareItem {
  const id = pick(item, ["servId", "servid", "id"]) ?? "";
  return {
    id,
    source: "central",
    name: pick(item, ["servNm", "servnm", "name"]) ?? "이름 미상 복지서비스",
    agency: pick(item, ["jurMnofNm", "jurOrgNm", "agency"]),
    summary: pick(item, ["servDgst", "servDtlLink", "summary"]),
    applicationMethod: pick(item, ["aplyMtdNm", "applicationMethod"]),
    applicationLinks: [],
    contacts: [],
    forms: [],
    detailLink: pick(item, ["servDtlLink", "detailLink"]),
    lifeArray: splitTokens(item["lifeArray"]),
    targetArray: splitTokens(item["trgterIndvdlArray"]),
    interestArray: splitTokens(item["intrsThemaArray"]),
    raw: item,
  };
}

export function normalizeCentralDetail(
  detail: Record<string, unknown>,
  base?: WelfareItem,
): WelfareItem {
  const id = pick(detail, ["servId", "servid", "id"]) ?? base?.id ?? "";

  // 신청방법 리스트 (servSeNm/servSeDetailNm/servSeDetailLink)
  const applmet = asArray<Record<string, unknown>>(
    (detail["applmetList"] as Record<string, unknown> | undefined)?.["applmetList"] ??
      detail["applmetList"],
  );
  const applicationLinks = applmet
    .map((a) => ({
      label:
        pick(a, ["servSeDetailNm", "servSeNm", "label"]) ?? "신청 안내",
      url: pick(a, ["servSeDetailLink", "url"]),
    }))
    .filter((l) => l.label || l.url);

  // 문의처 리스트
  const inqpl = asArray<Record<string, unknown>>(
    (detail["inqplCtadrList"] as Record<string, unknown> | undefined)?.["inqplCtadrList"] ??
      detail["inqplCtadrList"],
  );
  const contacts = inqpl
    .map((c) => ({
      label: pick(c, ["wlfareInfoDtlCd", "inqplCtadrNm", "label"]) ?? "문의처",
      value: pick(c, ["inqDocCn", "inqplCtadrCn", "value"]) ?? "",
    }))
    .filter((c) => c.value);

  // 대표 문의처 보강
  const rprs = pick(detail, ["rprsCtadr", "tel"]);
  if (rprs && !contacts.some((c) => c.value === rprs)) {
    contacts.unshift({ label: "대표 문의처", value: rprs });
  }

  // 서식 리스트
  const basfrm = asArray<Record<string, unknown>>(
    (detail["basfrmList"] as Record<string, unknown> | undefined)?.["basfrmList"] ??
      detail["basfrmList"],
  );
  const forms = basfrm
    .map((f) => ({
      name: pick(f, ["servSeDetailNm", "name"]) ?? "관련 서식",
      url: pick(f, ["servSeDetailLink", "url"]),
    }))
    .filter((f) => f.name || f.url);

  // 관련 사이트 → 신청 링크에 합산
  const hmpg = asArray<Record<string, unknown>>(
    (detail["inqplHmpgReldList"] as Record<string, unknown> | undefined)?.["inqplHmpgReldList"] ??
      detail["inqplHmpgReldList"],
  );
  for (const h of hmpg) {
    const label = pick(h, ["wlfareInfoReldNm", "label"]) ?? "관련 사이트";
    const url = pick(h, ["wlfareInfoReldCn", "url"]);
    if (url) applicationLinks.push({ label, url });
  }

  return {
    id,
    source: "central",
    name: pick(detail, ["servNm", "name"]) ?? base?.name ?? "이름 미상 복지서비스",
    agency: pick(detail, ["jurMnofNm", "jurOrgNm", "agency"]) ?? base?.agency,
    summary:
      pick(detail, ["wlfareInfoOutlCn", "servDgst", "summary"]) ?? base?.summary,
    target: pick(detail, ["tgtrDtlCn", "target"]),
    selectionCriteria: pick(detail, ["slctCritCn", "selectionCriteria"]),
    benefit: pick(detail, ["alwServCn", "benefit"]),
    applicationMethod:
      pick(detail, ["aplyMtdCn", "applicationMethod"]) ?? base?.applicationMethod,
    applicationLinks,
    contacts,
    forms,
    detailLink: pick(detail, ["servDtlLink", "detailLink"]) ?? base?.detailLink,
    region: base?.region,
    lifeArray: base?.lifeArray,
    targetArray: base?.targetArray,
    interestArray: base?.interestArray,
    raw: detail,
  };
}

// ---- 지자체 ----

export function normalizeLocalListItem(item: Record<string, unknown>): WelfareItem {
  const id = pick(item, ["servId", "servid", "id"]) ?? "";
  const ctpv = pick(item, ["ctpvNm"]);
  const sgg = pick(item, ["sggNm"]);
  const region = [ctpv, sgg].filter(Boolean).join(" ") || undefined;
  return {
    id,
    source: "local",
    name: pick(item, ["servNm", "name"]) ?? "이름 미상 복지서비스",
    agency: pick(item, ["jurOrgNm", "ctpvNm", "agency"]) ?? region,
    summary: pick(item, ["servDgst", "summary"]),
    applicationLinks: [],
    contacts: [],
    forms: [],
    detailLink: pick(item, ["servDtlLink", "detailLink"]),
    region,
    lifeArray: splitTokens(item["lifeArray"] ?? item["lifeNmArray"]),
    targetArray: splitTokens(item["trgterIndvdlArray"] ?? item["trgterIndvdlNmArray"]),
    interestArray: splitTokens(item["intrsThemaArray"] ?? item["intrsThemaNmArray"]),
    raw: item,
  };
}

export function normalizeLocalDetail(
  detail: Record<string, unknown>,
  base?: WelfareItem,
): WelfareItem {
  // 지자체 상세는 중앙과 유사 구조를 공유하므로 중앙 로직을 재사용 후 source만 교정한다.
  const merged = normalizeCentralDetail(detail, base);
  return { ...merged, source: "local", region: base?.region ?? merged.region };
}
