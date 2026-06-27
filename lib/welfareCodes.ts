// 복지로 공공데이터 코드 및 엔드포인트 모음.
// 생애주기/가구상황/관심주제 코드는 "확실할 때만" 보조 필터로 쓴다.

export const ENDPOINTS = {
  // 중앙부처(보건복지부 한눈에 보는 복지정보) 목록/상세
  centralList:
    "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001",
  centralDetail:
    "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfaredetailedV001",
  // 지자체 복지정보 목록/상세
  localList:
    "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LocalGovernmentWelfarelist",
  localDetail:
    "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LocalGovernmentWelfaredetailed",
} as const;

// 생애주기 코드 (lifeArray)
export const LIFE_CODES: Record<string, string> = {
  영유아: "001",
  아동: "002",
  청소년: "003",
  청년: "004",
  중장년: "005",
  노년: "006",
  임신출산: "007",
};

// 관심주제 코드 (intrsThemaArray)
export const INTEREST_CODES: Record<string, string> = {
  신체건강: "010",
  정신건강: "020",
  생활지원: "030",
  주거: "040",
  일자리: "050",
  문화여가: "060",
  안전위기: "070",
  임신출산: "080",
  보육: "090",
  교육: "100",
  입양위탁: "110",
  보호돌봄: "120",
  서민금융: "130",
  법률: "140",
  에너지: "150",
};

// 가구상황 코드 (trgterIndvdlArray)
export const TARGET_CODES: Record<string, string> = {
  저소득: "010",
  장애인: "020",
  한부모조손: "030",
  다자녀: "040",
  다문화탈북민: "050",
  보훈대상자: "060",
};

// 발표 해피패스 핵심 제도 ID
export const DEMO_SERV_ID = "WLF00003245"; // 국민취업지원제도
export const DEMO_LOCAL_SERV_ID = "WLF00006135"; // 지자체 예시 제도
