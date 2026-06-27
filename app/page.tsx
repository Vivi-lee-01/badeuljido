"use client";

import { useState, useCallback, useEffect } from "react";

// ---- 타입 (lib과 형태 일치) ----
type WelfareItem = {
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
  region?: string;
  lifeArray?: string[];
  targetArray?: string[];
  interestArray?: string[];
};
type Eligibility = "높음" | "중간" | "낮음";
type RankedItem = {
  item: WelfareItem;
  score: number;
  eligibility: Eligibility;
  matchReasons: string[];
};
type UserProfile = {
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
type Packet = {
  servId: string;
  name: string;
  agency?: string;
  eligibility: Eligibility;
  reason: string;
  eligibilityNote: string;
  applicationMethod: string;
  contacts: Array<{ label: string; value: string }>;
  links: Array<{ label: string; url?: string }>;
  forms: Array<{ name: string; url?: string }>;
  applicationDraft: string;
  inquiryDraft: string;
  sources: Array<{ label: string; url?: string }>;
  disclaimer: string;
  officialForm?: { title: string; sourceName: string; sourcePageUrl: string } | null;
  formId?: string | null;
  applyUrl: string;
};

// 신청 준비 중/완료된 제도 (복수 신청 지원)
type Prepared = {
  key: string;
  item: WelfareItem;
  eligibility: Eligibility;
  packet: Packet | null;
  loading: boolean;
};

type Screen = "input" | "work";

const DEMO_INPUT =
  "서울에 사는 33세 프리랜서입니다. 최근 일이 줄어 월소득이 90만원 수준으로 떨어졌어요. 앞으로 구직·생계가 막막하고 건강보험료 부담도 걱정입니다.";

const EXAMPLES = [
  DEMO_INPUT,
  "8살 딸을 혼자 키우는 미혼모입니다. 최근 이혼해서 아이 키우는 게 막막해요.",
  "65세 어르신인데 소득이 거의 없어 생계가 어렵습니다.",
];

const DISCLAIMER = "정확한 자격 여부는 소득·재산 기준 등 기관 확인 후 결정됩니다.";

const keyOf = (it: { source: string; id: string }) => `${it.source}:${it.id}`;

// ---- 발표/제출 캡처용 데모 시드 (?demo=results | ?demo=packet) ----
const DEMO_PROFILE: UserProfile = {
  rawInput: DEMO_INPUT,
  age: 33,
  region: "서울",
  occupation: "프리랜서",
  incomeMonthlyKrw: 900000,
  keywords: ["구직", "생계", "프리랜서"],
};
const DEMO_RESULTS: RankedItem[] = [
  {
    item: {
      id: "GUKCHWI", source: "central", name: "국민취업지원제도", agency: "고용노동부",
      summary: "구직활동을 지원하고, 저소득 구직자에게 구직촉진수당(월 50만원×최대 6개월)을 지원합니다.",
      applicationLinks: [{ label: "워크넷 신청", url: "https://www.work.go.kr" }],
      contacts: [{ label: "고용노동부 고객상담", value: "국번없이 1350" }],
      forms: [{ name: "국민취업지원제도 신청서" }], interestArray: ["취업"], targetArray: ["청년", "저소득"],
    }, score: 92, eligibility: "높음", matchReasons: [],
  },
  {
    item: {
      id: "EMERGENCY", source: "central", name: "긴급복지지원", agency: "보건복지부",
      summary: "갑작스러운 위기 상황으로 생계가 곤란한 가구에 생계비를 신속하게 지원합니다.",
      applicationLinks: [{ label: "복지로", url: "https://www.bokjiro.go.kr" }],
      contacts: [{ label: "보건복지상담센터", value: "129" }], forms: [], interestArray: ["생계"], targetArray: [],
    }, score: 70, eligibility: "중간", matchReasons: [],
  },
  {
    item: {
      id: "YOUTHRENT", source: "central", name: "청년월세 한시 특별지원", agency: "국토교통부",
      summary: "무주택 청년에게 월 최대 20만원의 월세를 최대 12개월 지원합니다.",
      applicationLinks: [{ label: "복지로", url: "https://www.bokjiro.go.kr" }],
      contacts: [{ label: "국토교통부", value: "1599-0001" }], forms: [], interestArray: ["주거"], targetArray: ["청년"],
    }, score: 64, eligibility: "중간", matchReasons: [],
  },
];
const DEMO_PACKET: Packet = {
  servId: "GUKCHWI", name: "국민취업지원제도", agency: "고용노동부", eligibility: "높음",
  reason: "프리랜서·저소득 구직자 요건에 부합합니다. 월소득 90만원 수준은 Ⅰ유형 소득기준 검토 대상이에요.",
  eligibilityNote:
    "· 가구 소득·재산 기준 확인이 필요해요.\n· 최근 2년간 100일 이상 취업 경험 여부를 확인하세요.\n· 거주지 고용센터 방문 또는 워크넷 온라인으로 신청합니다.",
  applicationMethod:
    "워크넷(work.go.kr) 온라인 신청 후, 거주지 관할 고용센터에서 구직활동계획 상담을 진행합니다.",
  contacts: [
    { label: "고용노동부 고객상담", value: "국번없이 1350" },
    { label: "워크넷", value: "www.work.go.kr" },
  ],
  links: [{ label: "국민취업지원제도 안내", url: "https://www.work.go.kr" }],
  forms: [{ name: "국민취업지원제도 신청서" }],
  applicationDraft:
    "안녕하세요. 서울 거주 33세 프리랜서로, 최근 소득이 월 90만원 수준으로 줄어 국민취업지원제도 신청을 문의드립니다. 구직활동계획 수립과 구직촉진수당 지원 대상 여부를 확인하고 싶습니다.",
  inquiryDraft:
    "안녕하세요. 국민취업지원제도 신청 자격을 문의드립니다. 프리랜서로 최근 소득이 급감했는데, Ⅰ유형/Ⅱ유형 중 어디에 해당하는지와 준비해야 할 서류를 알고 싶습니다.",
  sources: [{ label: "고용노동부 · 국민취업지원제도", url: "https://www.work.go.kr" }],
  disclaimer: DISCLAIMER,
  officialForm: { title: "국민취업지원제도 신청서", sourceName: "고용노동부", sourcePageUrl: "https://www.work.go.kr" },
  formId: "GUKCHWI", applyUrl: "https://www.work.go.kr",
};

// 복지 영역별 카테고리 색 (컬러감 강화형)
type Cat = { label: string; color: string; bg: string };
function categorize(item: WelfareItem): Cat {
  const t = `${item.name} ${item.summary ?? ""} ${(item.interestArray ?? []).join(
    " ",
  )} ${(item.targetArray ?? []).join(" ")}`;
  const has = (re: RegExp) => re.test(t);
  // 깜찍 파스텔 — 라벤더/베리/스카이/그린/오렌지 톤과 연동
  if (has(/취업|일자리|구직|실업|고용|근로/))
    return { label: "일자리", color: "#6b50e0", bg: "#ece7fe" };
  if (has(/주거|월세|전세|임대|주택|보증금/))
    return { label: "주거", color: "#1f86d8", bg: "#e2f1fc" };
  if (has(/양육|보육|아이돌봄|한부모|아동|육아|자녀|영유아/))
    return { label: "양육·보육", color: "#d83f86", bg: "#fce3ee" };
  if (has(/건강|의료|보험|질병|치료|장애/))
    return { label: "건강·의료", color: "#1f9d6b", bg: "#e6f7f0" };
  if (has(/생계|생활|긴급|기초생활|저소득|소득|수당/))
    return { label: "생계·생활", color: "#d97a16", bg: "#fdeed6" };
  return { label: "복지", color: "#6a5acd", bg: "#ecebf7" };
}

function CatTag({ cat }: { cat: Cat }) {
  return (
    <span className="cat-tag" style={{ color: cat.color, background: cat.bg }}>
      {cat.label}
    </span>
  );
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("input");
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<RankedItem[]>([]);
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1800);
  }, []);

  // 제출 캡처용 데모 시드
  useEffect(() => {
    if (typeof window === "undefined") return;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo) return;
    if (demo === "input") {
      setInput(DEMO_INPUT);
      return;
    }
    setProfile(DEMO_PROFILE);
    setResults(DEMO_RESULTS);
    setScreen("work");
    if (demo === "packet") {
      const it = DEMO_RESULTS[0].item;
      const k = keyOf(it);
      setPrepared([{ key: k, item: it, eligibility: "높음", packet: DEMO_PACKET, loading: false }]);
      setActiveKey(k);
    }
  }, []);

  const activePacket =
    prepared.find((p) => p.key === activeKey)?.packet ?? null;
  const activePrep = prepared.find((p) => p.key === activeKey) ?? null;

  // ---- 화면 1 → 워크스페이스: 검색 ----
  async function handleSearch() {
    if (input.trim().length < 10) return;
    setSearching(true);
    try {
      const res = await fetch("/api/welfare/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      setProfile(data.profile ?? null);
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setProfile({ rawInput: input, keywords: [] });
      setResults([]);
    } finally {
      setSearching(false);
      setPrepared([]);
      setActiveKey(null);
      setScreen("work");
    }
  }

  // ---- 제도 선택 → 왼쪽 패널에 신청 준비 패킷 열기 (복수 누적) ----
  async function openPrepare(r: RankedItem) {
    const k = keyOf(r.item);
    const existing = prepared.find((p) => p.key === k);
    if (existing) {
      setActiveKey(k);
      return;
    }
    setPrepared((prev) => [
      ...prev,
      { key: k, item: r.item, eligibility: r.eligibility, packet: null, loading: true },
    ]);
    setActiveKey(k);
    try {
      const res = await fetch("/api/welfare/detail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          servId: r.item.id,
          source: r.item.source,
          profile,
          eligibility: r.eligibility,
          base: r.item,
        }),
      });
      const data = await res.json();
      setPrepared((prev) =>
        prev.map((p) =>
          p.key === k ? { ...p, packet: data?.packet ?? null, loading: false } : p,
        ),
      );
      if (!data?.packet) showToast("준비 자료를 불러오지 못했어요.");
    } catch {
      setPrepared((prev) =>
        prev.map((p) => (p.key === k ? { ...p, loading: false } : p)),
      );
      showToast("준비 자료를 불러오지 못했어요.");
    }
  }

  function closePrepared(k: string) {
    setPrepared((prev) => {
      const next = prev.filter((p) => p.key !== k);
      if (activeKey === k) setActiveKey(next.length ? next[next.length - 1].key : null);
      return next;
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("복사했어요.");
    } catch {
      showToast("복사에 실패했어요. 길게 눌러 복사해 주세요.");
    }
  }

  function saveBlob(blob: Blob, cd: string, fallbackName: string) {
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const filename = m ? decodeURIComponent(m[1]) : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadOfficialForm(packet: Packet) {
    if (!packet.formId) return;
    showToast("공식 신청 서식을 가져오는 중...");
    try {
      const res = await fetch(
        `/api/document/form?formId=${encodeURIComponent(packet.formId)}`,
      );
      if (res.ok) {
        const blob = await res.blob();
        saveBlob(
          blob,
          res.headers.get("Content-Disposition") ?? "",
          `${packet.name}_신청서`,
        );
        showToast("공식 신청 서식을 내려받았어요.");
        return;
      }
      showToast("공식 서식을 가져오지 못했어요. 공식 신청처로 안내할게요.");
      window.open(packet.applyUrl, "_blank", "noopener");
    } catch {
      showToast("다운로드에 실패했어요. 다시 시도해 주세요.");
    }
  }

  async function downloadPrepMemo(packet: Packet) {
    try {
      const res = await fetch("/api/document/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packet, servId: packet.servId }),
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      saveBlob(
        blob,
        res.headers.get("Content-Disposition") ?? "",
        `받을지도_${packet.name}_신청준비.hwpx`,
      );
      showToast("신청 준비 메모를 내려받았어요.");
    } catch {
      showToast("다운로드에 실패했어요. 다시 시도해 주세요.");
    }
  }

  const wideClass = screen === "work" ? "wrap wide" : "wrap";

  return (
    <div className={wideClass}>
      <Stepper
        screen={screen}
        hasResults={results.length > 0}
        hasPrepared={prepared.length > 0}
        onInput={() => setScreen("input")}
        onWork={() => results.length > 0 && setScreen("work")}
      />

      {screen === "input" && (
        <div className="hero-stage">
          <InputScreen
            input={input}
            setInput={setInput}
            searching={searching}
            onSearch={handleSearch}
            onExample={(ex) => setInput(ex)}
          />
        </div>
      )}

      {screen === "work" && (
        <div className="workspace">
          {/* 왼쪽: 선택한 제도의 신청 준비 (복수 탭) */}
          <aside className="pane-left">
            {prepared.length === 0 ? (
              <div className="placeholder">
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>
                  신청 준비 영역
                </div>
                <p style={{ marginTop: 8 }}>
                  오른쪽 추천에서 제도를 선택하면 여기에 신청 준비가 열립니다.
                  <br />
                  여러 제도를 동시에 준비할 수 있어요.
                </p>
              </div>
            ) : (
              <>
                <div className="tabs">
                  {prepared.map((p) => (
                    <span
                      key={p.key}
                      className={`tab ${p.key === activeKey ? "active" : ""}`}
                      onClick={() => setActiveKey(p.key)}
                    >
                      {p.item.name}
                      <button
                        className="tab-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          closePrepared(p.key);
                        }}
                        aria-label="닫기"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <PacketPanel
                  prep={activePrep}
                  packet={activePacket}
                  onCopy={copy}
                  onDownloadForm={downloadOfficialForm}
                  onDownloadMemo={downloadPrepMemo}
                />
              </>
            )}
          </aside>

          {/* 오른쪽: 추천 목록 */}
          <section className="pane-right">
            <h2 className="pane-title serif">받을지도 추천</h2>
            <ProfileChips profile={profile} />
            {results.length === 0 ? (
              <div className="empty">
                딱 맞는 제도를 찾지 못했어요.
                <br />
                상황을 조금 다르게 적어볼까요?
              </div>
            ) : (
              results.map((r, i) => {
                const k = keyOf(r.item);
                const isOpen = prepared.some((p) => p.key === k);
                const cat = categorize(r.item);
                return (
                  <div
                    className={`card ${k === activeKey ? "card-active" : ""}`}
                    key={k}
                    style={{ ["--cat" as string]: cat.color }}
                  >
                    <div className="card-head">
                      <span className="rank-no">{i + 1}</span>
                      <span className="name" style={{ marginRight: "auto" }}>
                        {r.item.name}
                      </span>
                      <CatTag cat={cat} />
                    </div>
                    <div className="agency">
                      {r.item.agency ??
                        (r.item.source === "central" ? "중앙부처" : "지자체")}
                    </div>
                    {r.item.summary && <div className="summary">{r.item.summary}</div>}
                    <div className="row">
                      <span className={`badge ${r.eligibility}`}>
                        지원 가능성: {r.eligibility}
                      </span>
                      <button className="ghost" onClick={() => openPrepare(r)}>
                        {isOpen ? "왼쪽에서 열기" : "신청 준비하기"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <p className="notice">{DISCLAIMER}</p>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function Stepper({
  screen,
  hasResults,
  hasPrepared,
  onInput,
  onWork,
}: {
  screen: Screen;
  hasResults: boolean;
  hasPrepared: boolean;
  onInput: () => void;
  onWork: () => void;
}) {
  return (
    <div className="stepper">
      <button
        className={`step-pill clickable ${screen === "input" ? "active" : ""}`}
        onClick={onInput}
      >
        ① 상황 입력
      </button>
      <button
        className={`step-pill ${hasResults ? "clickable" : ""} ${
          screen === "work" ? "active" : ""
        }`}
        onClick={onWork}
      >
        ② 받을지도 추천
      </button>
      <button
        className={`step-pill ${hasPrepared ? "active" : ""}`}
        onClick={onWork}
      >
        ③ 신청 준비{hasPrepared ? "" : ""}
      </button>
    </div>
  );
}

function InputScreen({
  input,
  setInput,
  searching,
  onSearch,
  onExample,
}: {
  input: string;
  setInput: (v: string) => void;
  searching: boolean;
  onSearch: () => void;
  onExample: (ex: string) => void;
}) {
  const disabled = input.trim().length < 10 || searching;
  return (
    <section className="hero-split">
      <div className="hero-copy">
        <span className="eyebrow">받을지도 · 복지 길찾기</span>
        <h1 className="hero-title serif">
          받을 수 있는지,
          <br />
          같이 찾아봐요
        </h1>
        <p className="hero-sub">
          제도명을 몰라도 괜찮아요. 지금 상황을 적어주시면, 받을 가능성이 있는
          복지서비스를 AI가 찾아 신청 준비까지 안내합니다.
        </p>

        <textarea
          className="input"
          placeholder="예) 서울에 사는 33세 프리랜서입니다. 최근 일이 줄어 월소득이 90만원 수준으로 떨어졌어요. 구직·생계가 막막합니다."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <button className="cta" disabled={disabled} onClick={onSearch}>
          {searching ? (
            <>
              <span className="spin" />
              받을지도가 상황을 읽는 중...
            </>
          ) : (
            "받을지도 찾기 →"
          )}
        </button>

        <div className="chips">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="chip" onClick={() => onExample(ex)}>
              {i === 0 ? "예시 입력 (발표용)" : ex.slice(0, 16) + "…"}
            </button>
          ))}
        </div>

        <p className="privacy">
          입력하신 상황은 저장하지 않습니다. 주민번호·계좌번호 등 민감정보는 입력하지 마세요.
        </p>
      </div>

      <div className="hero-visual">
        <img
          className="hero-photo"
          src="/people/ko-hero-woman.png"
          alt="상황을 이야기하는 시민"
        />
        <div className="float-card one">
          <div className="fc-top">
            <span className="fc-rank" style={{ background: "var(--lav)" }}>1</span>
            <span className="fc-name">국민취업지원제도</span>
          </div>
          <div className="fc-sub">고용노동부</div>
          <span className="fc-pill" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
            지원 가능성 · 높음
          </span>
        </div>
        <div className="float-card two">
          <div className="fc-top">
            <span className="fc-rank" style={{ background: "var(--berry)" }}>2</span>
            <span className="fc-name">긴급복지지원</span>
          </div>
          <div className="fc-sub">보건복지부 · 생계비 신속 지원</div>
          <span className="fc-pill" style={{ background: "var(--lav-soft)", color: "var(--lav)" }}>
            신청 준비 완료까지
          </span>
        </div>
      </div>
    </section>
  );
}

function ProfileChips({ profile }: { profile: UserProfile | null }) {
  if (!profile) return null;
  const tags: string[] = [];
  if (profile.region) tags.push(`지역: ${profile.region}`);
  if (profile.age !== undefined) tags.push(`나이: ${profile.age}세`);
  if (profile.childAge !== undefined) tags.push(`자녀: ${profile.childAge}세`);
  if (profile.occupation) tags.push(`상황: ${profile.occupation}`);
  if (profile.incomeMonthlyKrw !== undefined)
    tags.push(`월소득: 약 ${Math.round(profile.incomeMonthlyKrw / 10000)}만원`);
  for (const k of profile.keywords) tags.push(`#${k}`);
  if (tags.length === 0) tags.push("입력하신 상황을 바탕으로 찾았어요");

  return (
    <div className="understand">
      <div className="label">AI가 이렇게 이해했어요</div>
      <div>
        {tags.map((t, i) => (
          <span key={i} className="tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="packet-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function PacketPanel({
  prep,
  packet,
  onCopy,
  onDownloadForm,
  onDownloadMemo,
}: {
  prep: Prepared | null;
  packet: Packet | null;
  onCopy: (t: string) => void;
  onDownloadForm: (p: Packet) => void;
  onDownloadMemo: (p: Packet) => void;
}) {
  if (prep?.loading || !packet) {
    return (
      <div className="empty">
        <span
          className="spin"
          style={{ borderTopColor: "#1f2a44", borderColor: "#cfd6dd", borderTopWidth: 2 }}
        />
        <div style={{ marginTop: 12 }}>신청 준비 자료를 만드는 중...</div>
      </div>
    );
  }

  const cat = prep ? categorize(prep.item) : null;

  return (
    <div style={cat ? ({ ["--cat" as string]: cat.color } as React.CSSProperties) : undefined}>
      <div className="card-head" style={{ marginBottom: 6 }}>
        <h2 className="pane-title serif" style={{ margin: 0, marginRight: "auto" }}>
          {packet.name}
        </h2>
        {cat && <CatTag cat={cat} />}
      </div>
      <div className="agency" style={{ marginBottom: 14 }}>
        {packet.agency} ·{" "}
        <span className={`badge ${packet.eligibility}`}>
          지원 가능성: {packet.eligibility}
        </span>
      </div>

      <Section title="추천 이유">
        <p>{packet.reason}</p>
      </Section>

      <Section title="지원 가능성 및 확인할 점">
        {packet.eligibilityNote.split("\n").map((l, i) =>
          l.trim() ? <p key={i}>{l}</p> : <br key={i} />,
        )}
      </Section>

      <Section title="신청방법">
        <p>{packet.applicationMethod}</p>
      </Section>

      <Section title="문의처">
        <ul>
          {packet.contacts.map((c, i) => (
            <li key={i}>
              {c.label}: {c.value}
            </li>
          ))}
        </ul>
      </Section>

      {(packet.forms.length > 0 || packet.links.length > 0) && (
        <Section title="서식 / 공식 링크">
          <ul>
            {packet.forms.map((f, i) => (
              <li key={`f${i}`}>
                {f.url ? (
                  <a className="link" href={f.url} target="_blank" rel="noreferrer">
                    {f.name}
                  </a>
                ) : (
                  f.name
                )}
              </li>
            ))}
            {packet.links.map((l, i) => (
              <li key={`l${i}`}>
                {l.url ? (
                  <a className="link" href={l.url} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                ) : (
                  l.label
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="신청서 / 상담 문장 초안">
        <div className="draft">{packet.applicationDraft}</div>
        <button className="copy-btn" onClick={() => onCopy(packet.applicationDraft)}>
          신청 문장 복사
        </button>
      </Section>

      <Section title="기관 문의 메시지 초안">
        <div className="draft">{packet.inquiryDraft}</div>
        <button className="copy-btn" onClick={() => onCopy(packet.inquiryDraft)}>
          문의 메시지 복사
        </button>
      </Section>

      {packet.officialForm ? (
        <Section title="공식 신청 서식">
          <p>
            <strong>{packet.officialForm.title}</strong>
          </p>
          <p style={{ color: "var(--steel)", fontSize: 13 }}>
            출처: {packet.officialForm.sourceName} ·{" "}
            <a
              className="link"
              href={packet.officialForm.sourcePageUrl}
              target="_blank"
              rel="noreferrer"
            >
              원본 페이지
            </a>
          </p>
          <div className="btn-row">
            <button
              className="cta"
              style={{ width: "auto", flex: 1 }}
              onClick={() => onDownloadForm(packet)}
            >
              공식 신청서 다운로드 ↓
            </button>
            <button className="ghost" onClick={() => onDownloadMemo(packet)}>
              받을지도 준비 메모
            </button>
          </div>
        </Section>
      ) : (
        <Section title="공식 신청 안내">
          <p style={{ color: "var(--steel)", fontSize: 13 }}>
            이 제도는 다운로드용 서식 대신 <strong>온라인·방문 신청</strong>으로
            접수됩니다. 아래 공식 신청처에서 바로 진행하세요.
          </p>
          <div className="btn-row">
            <a
              className="cta"
              style={{ width: "auto", flex: 1, textDecoration: "none" }}
              href={packet.applyUrl}
              target="_blank"
              rel="noreferrer"
            >
              공식 신청 바로가기 →
            </a>
            <button className="ghost" onClick={() => onDownloadMemo(packet)}>
              받을지도 준비 메모
            </button>
          </div>
        </Section>
      )}

      <Section title="출처 및 면책">
        <ul>
          {packet.sources.map((s, i) => (
            <li key={i}>
              {s.url ? (
                <a className="link" href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              ) : (
                s.label
              )}
            </li>
          ))}
        </ul>
        <p className="notice">{packet.disclaimer}</p>
      </Section>
    </div>
  );
}
