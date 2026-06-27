import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "받을지도 — 받을 수 있는지, 같이 찾아봐요",
  description:
    "내 상황을 말하면 받을 가능성이 있는 복지서비스를 찾고 신청 준비까지 도와주는 공공지원 신청 준비 코파일럿.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 헤드라인 Nanum Myeongjo, 본문 Pretendard */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
