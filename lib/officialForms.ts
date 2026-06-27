// 실제 공식 신청 서식 레지스트리 + 라이브 가져오기.
//
// 중요 1) 복지로 공공데이터(data.go.kr) 상세 API는 "서식 파일"을 내려주지 않는다(텍스트만).
//         실제 서식 파일(hwp/pdf)은 각 제도 공식 출처에 흩어져 있다.
// 중요 2) 상당수 복지제도(기초연금·생계/의료/주거/교육급여·한부모·부모급여·양육수당·
//         아동수당·아이돌봄·장애인연금 등)는 "사회보장급여 신청(변경)서" 하나의 공통서식을 쓴다.
//         그래서 서식 매칭은 servId가 아니라 "제도명(name)" 기준으로 한다. (여러 제도 → 한 서식)
//
// 동작: 공식 출처에서 라이브로 실제 파일을 가져오고, 실패 시 사전 저장된 동일 파일
//       (src/data/cached/form_<key>.*)로 조용히 폴백한다.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const FETCH_TIMEOUT = 8000;

export type OfficialFormMeta = {
  key: string; // 안정 키(레지스트리/캐시 식별)
  match: RegExp; // 제도명 매칭 (공통서식이 여러 제도를 커버)
  servIds?: string[]; // 정확 servId 매칭(선택)
  title: string; // 서식 공식 명칭
  filename: string; // 다운로드 파일명
  ext: "hwp" | "pdf" | "hwpx" | "docx";
  contentType: string;
  sourceName: string; // 출처 이름
  sourcePageUrl: string; // 사람이 확인할 수 있는 출처 페이지
  cacheFile: string; // src/data/cached/ 내 사전 저장 파일명
  fetchLive?: () => Promise<Buffer | null>; // 라이브로 실제 파일 가져오기
};

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// 직접 다운로드 URL에서 바이너리 파일을 가져온다(HTML/에러 페이지면 실패 처리).
async function fetchDirect(url: string, referer?: string): Promise<Buffer | null> {
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
      signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    return buf;
  } catch {
    return null;
  } finally {
    done();
  }
}

// 고용24(work24) 서식자료실 다운로드 재현: 페이지에서 gfn_downloadAttFile({...}) 파라미터 파싱 → POST.
async function fetchWork24Form(
  pageUrl: string,
  ext: "hwp" | "pdf",
): Promise<Buffer | null> {
  const { signal, done } = withTimeout();
  try {
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": UA },
      signal,
      cache: "no-store",
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const decoded = html.replace(/&#034;/g, '"').replace(/&quot;/g, '"');
    const re = /gfn_downloadAttFile\((\{[^}]*?\.(?:hwp|pdf)"\})\)/g;
    let param: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(decoded)) !== null) {
      if (m[1].includes(`.${ext}"`)) {
        param = m[1];
        break;
      }
    }
    if (!param) return null;
    const url =
      "https://www.work24.go.kr/cm/common/myDriveFileDownload.do?param=" +
      encodeURIComponent(param) +
      "&_csrf=";
    const fileRes = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, Referer: pageUrl },
      signal,
      cache: "no-store",
    });
    if (!fileRes.ok) return null;
    const ct = fileRes.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.length < 1024) return null;
    return buf;
  } catch {
    return null;
  } finally {
    done();
  }
}

const WORK24_GUKCHWI_PAGE =
  "https://www.work24.go.kr/cm/c/b/1100/selectBbttInfo.do?polySvcFomtId=FM00000239";
const DOBONG_EMERGENCY_PAGE =
  "https://www.dobong.go.kr/wdb_dev/bokji/bokjiDataView.asp?a=1&bokji_idx=3";
const DOBONG_EMERGENCY_FILE =
  "https://www.dobong.go.kr/WDB_common/include/download_unitsvc.asp?fcode=13524675&bcode=3";
// 사회보장급여 신청(변경)서 [별지 제1호서식] (사회보장급여 공통서식 고시) — 지자체 직배포본
const SBG_PAGE =
  "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13520000048";
const SBG_FILE =
  "https://m.gyeryong.go.kr/kr/html/sub01/0102.html?category=14&file_id=33449&mode=D&no=51ef0c82773b520ca792bf4958548679";

// 서식 레지스트리. 위에서부터 먼저 매칭(구체적인 것 우선, 공통서식은 마지막).
const FORMS: OfficialFormMeta[] = [
  {
    key: "GUKCHWI",
    match: /국민\s*취업\s*지원/,
    servIds: ["WLF00003245"],
    title: "[별지 제1호서식] 취업지원 신청서",
    filename: "국민취업지원제도_취업지원신청서.hwp",
    ext: "hwp",
    contentType: "application/x-hwp",
    sourceName: "고용24 서식자료실",
    sourcePageUrl: WORK24_GUKCHWI_PAGE,
    cacheFile: "form_WLF00003245.hwp",
    fetchLive: () => fetchWork24Form(WORK24_GUKCHWI_PAGE, "hwp"),
  },
  {
    key: "EMERGENCY",
    match: /긴급\s*복지|긴급\s*지원/,
    servIds: ["WLF00000130"],
    title: "긴급복지지원 신청서식",
    filename: "긴급복지지원_신청서식.hwp",
    ext: "hwp",
    contentType: "application/x-hwp",
    sourceName: "보건복지부 · 도봉구 맞춤복지",
    sourcePageUrl: DOBONG_EMERGENCY_PAGE,
    cacheFile: "form_EMERGENCY.hwp",
    fetchLive: () => fetchDirect(DOBONG_EMERGENCY_FILE, DOBONG_EMERGENCY_PAGE),
  },
  {
    // 사회보장급여 공통서식 — 다수 제도 커버
    key: "SBG",
    match:
      /기초연금|생계급여|의료급여|주거급여|교육급여|기초생활|한부모|부모급여|양육수당|아동수당|아이돌봄|장애인연금|장애수당|장애아동수당|차상위|청소년\s*한부모|첫만남/,
    title: "사회보장급여 신청(변경)서 [별지 제1호서식]",
    filename: "사회보장급여_신청(변경)서.pdf",
    ext: "pdf",
    contentType: "application/pdf",
    sourceName: "사회보장급여 관련 공통서식 고시",
    sourcePageUrl: SBG_PAGE,
    cacheFile: "form_SBG.pdf",
    fetchLive: () => fetchDirect(SBG_FILE),
  },
];

// 제도명/ servId 로 매칭되는 공식 서식을 찾는다. 없으면 null(= 다운로드용 서식 없음).
export function resolveOfficialForm(
  name?: string,
  servId?: string,
): OfficialFormMeta | null {
  for (const f of FORMS) {
    if (servId && f.servIds?.includes(servId)) return f;
  }
  if (name) {
    for (const f of FORMS) {
      if (f.match.test(name)) return f;
    }
  }
  return null;
}

export function getOfficialFormByKey(key: string): OfficialFormMeta | null {
  return FORMS.find((f) => f.key === key) ?? null;
}

// 다운로드용 서식이 없는 제도의 "공식 신청 바로가기" — 정부24 통합검색(제도명).
export function officialSearchUrl(name: string): string {
  return `https://www.gov.kr/search?srhQuery=${encodeURIComponent(name)}`;
}
