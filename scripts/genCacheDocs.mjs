// 사전 생성 문서 캐시(.hwpx/.docx)를 만든다. (1회용 안전망 생성기)
// 런타임 docGen.ts와 동일한 문단 구성/구조를 사용한다.
import JSZip from "jszip";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, "..", "src", "data", "cached");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function packetToParagraphs(p) {
  const L = [];
  L.push(`${p.name} 신청 준비 문서`);
  L.push(`소관기관: ${p.agency ?? "〔본인 확인 필요〕"}`);
  L.push(`지원 가능성: ${p.eligibility}`);
  L.push("");
  L.push("■ 추천 이유");
  L.push(p.reason);
  L.push("");
  L.push("■ 지원 가능성 및 확인할 점");
  p.eligibilityNote.split("\n").forEach((l) => L.push(l));
  L.push("");
  L.push("■ 신청방법");
  L.push(p.applicationMethod);
  L.push("");
  L.push("■ 문의처");
  p.contacts.forEach((c) => L.push(`- ${c.label}: ${c.value}`));
  L.push("");
  L.push("■ 서식/공식 링크");
  p.forms.forEach((f) => L.push(`- ${f.name}${f.url ? ` (${f.url})` : ""}`));
  p.links.forEach((l) => L.push(`- ${l.label}${l.url ? ` (${l.url})` : ""}`));
  L.push("");
  L.push("■ 신청서/상담 문장 초안");
  p.applicationDraft.split("\n").forEach((l) => L.push(l));
  L.push("");
  L.push("■ 기관 문의 메시지 초안");
  p.inquiryDraft.split("\n").forEach((l) => L.push(l));
  L.push("");
  L.push("■ 본인 작성 항목 (자동으로 채우지 않음)");
  L.push("- 성명: 〔본인 작성〕");
  L.push("- 주민등록번호: 〔본인 작성〕");
  L.push("- 주소: 〔본인 작성〕");
  L.push("- 연락처: 〔본인 작성〕");
  L.push("- 계좌번호: 〔본인 작성〕");
  L.push("");
  L.push("■ 출처 및 면책");
  p.sources.forEach((s) => L.push(`- ${s.label}${s.url ? ` (${s.url})` : ""}`));
  L.push(p.disclaimer);
  return L;
}

async function buildDocx(packet) {
  const paras = packetToParagraphs(packet);
  const body = paras
    .map((p) =>
      p === ""
        ? `<w:p/>`
        : `<w:p><w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic"/></w:rPr><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function buildHwpx(packet) {
  const paras = packetToParagraphs(packet);
  const sectionParas = paras
    .map((p) =>
      `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${esc(p)}</hp:t></hp:run></hp:p>`,
    )
    .join("");
  const section0 =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
    sectionParas +
    `</hs:sec>`;
  const header =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1"><hh:refList></hh:refList></hh:head>`;
  const version =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" os="10" xmlVersion="1.4" application="badeuljido" appVersion="0.1.0"/>`;
  const settings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>`;
  const contentHpf =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${esc(packet.name)} 신청 준비</opf:title></opf:metadata>` +
    `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest>` +
    `<opf:spine><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  const container =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles>` +
    `<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`;
  const manifest =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest">` +
    `<odf:file-entry full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>` +
    `<odf:file-entry full-path="Contents/header.xml" media-type="application/xml"/>` +
    `<odf:file-entry full-path="Contents/section0.xml" media-type="application/xml"/></odf:manifest>`;
  const zip = new JSZip();
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

const packet = JSON.parse(
  await fs.readFile(path.join(CACHE, "packet_WLF00003245.json"), "utf-8"),
);
await fs.writeFile(path.join(CACHE, "document_WLF00003245.hwpx"), await buildHwpx(packet));
await fs.writeFile(path.join(CACHE, "document_WLF00003245.docx"), await buildDocx(packet));
console.log("cached docs generated");
