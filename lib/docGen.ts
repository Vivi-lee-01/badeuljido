// 신청 준비 문서 생성.
// 전략: 런타임 .hwpx 생성(jszip) 시도 → 실패 시 사전 생성 .hwpx → 그래도 없으면 .docx.
// PII(주민번호·주소·계좌 등)는 자동으로 채우지 않고 〔본인 작성〕으로 둔다.

import JSZip from "jszip";
import type { Packet } from "./packetGenerator";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 문서에 들어갈 문단 목록을 패킷에서 구성한다. (hwpx/docx 공통)
export function packetToParagraphs(packet: Packet): string[] {
  const lines: string[] = [];
  lines.push(`${packet.name} 신청 준비 문서`);
  lines.push(`소관기관: ${packet.agency ?? "〔본인 확인 필요〕"}`);
  lines.push(`지원 가능성: ${packet.eligibility}`);
  lines.push("");
  lines.push("■ 추천 이유");
  lines.push(packet.reason);
  lines.push("");
  lines.push("■ 지원 가능성 및 확인할 점");
  packet.eligibilityNote.split("\n").forEach((l) => lines.push(l));
  lines.push("");
  lines.push("■ 신청방법");
  lines.push(packet.applicationMethod);
  lines.push("");
  lines.push("■ 문의처");
  packet.contacts.forEach((c) => lines.push(`- ${c.label}: ${c.value}`));
  lines.push("");
  lines.push("■ 서식/공식 링크");
  packet.forms.forEach((f) => lines.push(`- ${f.name}${f.url ? ` (${f.url})` : ""}`));
  packet.links.forEach((l) => lines.push(`- ${l.label}${l.url ? ` (${l.url})` : ""}`));
  lines.push("");
  lines.push("■ 신청서/상담 문장 초안");
  packet.applicationDraft.split("\n").forEach((l) => lines.push(l));
  lines.push("");
  lines.push("■ 기관 문의 메시지 초안");
  packet.inquiryDraft.split("\n").forEach((l) => lines.push(l));
  lines.push("");
  lines.push("■ 본인 작성 항목 (자동으로 채우지 않음)");
  lines.push("- 성명: 〔본인 작성〕");
  lines.push("- 주민등록번호: 〔본인 작성〕");
  lines.push("- 주소: 〔본인 작성〕");
  lines.push("- 연락처: 〔본인 작성〕");
  lines.push("- 계좌번호: 〔본인 작성〕");
  lines.push("");
  lines.push("■ 출처 및 면책");
  packet.sources.forEach((s) => lines.push(`- ${s.label}${s.url ? ` (${s.url})` : ""}`));
  lines.push(packet.disclaimer);
  return lines;
}

// ---- .docx (확실히 열리는 폴백) ----

export async function buildDocx(packet: Packet): Promise<Buffer> {
  const paras = packetToParagraphs(packet);
  const body = paras
    .map((p) => {
      if (p === "") return `<w:p/>`;
      return (
        `<w:p><w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/></w:rPr>` +
        `<w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`
      );
    })
    .join("");

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ---- .hwpx (런타임 생성 시도) ----
// OWPML 최소 구조. 정밀 스타일/필드 매핑은 MVP 범위 밖이며, 실패 시 route에서 폴백한다.

export async function buildHwpx(packet: Packet): Promise<Buffer> {
  const paras = packetToParagraphs(packet);

  const sectionParas = paras
    .map((p) => {
      if (p === "") {
        return `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>`;
      }
      return `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${esc(p)}</hp:t></hp:run></hp:p>`;
    })
    .join("");

  const section0 =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ` +
    `xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
    sectionParas +
    `</hs:sec>`;

  const header =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1">` +
    `<hh:refList></hh:refList></hh:head>`;

  const version =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" ` +
    `tagetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" ` +
    `os="10" xmlVersion="1.4" application="badeuljido" appVersion="0.1.0"/>`;

  const settings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>`;

  const contentHpf =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${esc(packet.name)} 신청 준비</opf:title></opf:metadata>` +
    `<opf:manifest>` +
    `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>` +
    `</opf:manifest>` +
    `<opf:spine><opf:itemref idref="section0" linear="yes"/></opf:spine>` +
    `</opf:package>`;

  const container =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<ocf:rootfiles>` +
    `<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>` +
    `</ocf:rootfiles></ocf:container>`;

  const manifest =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest">` +
    `<odf:file-entry full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>` +
    `<odf:file-entry full-path="Contents/header.xml" media-type="application/xml"/>` +
    `<odf:file-entry full-path="Contents/section0.xml" media-type="application/xml"/>` +
    `</odf:manifest>`;

  const zip = new JSZip();
  // mimetype은 비압축(STORE)으로 가장 먼저 넣는다 (OCF 규약).
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file("version.xml", version);
  zip.file("settings.xml", settings);
  zip.file("Contents/content.hpf", contentHpf);
  zip.file("Contents/header.xml", header);
  zip.file("Contents/section0.xml", section0);
  zip.file("META-INF/container.xml", container);
  zip.file("META-INF/manifest.xml", manifest);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
