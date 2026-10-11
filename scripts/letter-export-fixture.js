// Synthetic acceptance fixture only; never use private correspondence in QA.
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { newLetter, paragraph } from "../public/js/letter-model.js";
import { exportDocx, exportPdf } from "../src/letter-export.js";
const letter = newLetter("blank");
// Generate a valid synthetic PNG; the legacy site logos are not valid PNGs.
function fixtureImage() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4), sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(120, 0); header.writeUInt32BE(40, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(40 * 481, 255);
  for (let y = 0; y < 40; y++) {
    pixels[y * 481] = 0;
    for (let x = 0; x < 120; x++) if (x < 25 || (y > 12 && y < 19 && x < 110)) {
      const offset = y * 481 + 1 + x * 4;
      pixels[offset] = 42; pixels[offset + 1] = 76; pixels[offset + 2] = 67;
    }
  }
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
letter.title = "Letter Studio export acceptance";
letter.stationery = {
  ...letter.stationery,
  header: "VIBIFY TEST OFFICE",
  firstHeader: "VIBIFY TEST OFFICE\nOfficial correspondence",
  footer: "QA fixture - not for sending",
  firstFooter: "First page footer",
  differentFirst: true,
  logo: fixtureImage(),
  signature: fixtureImage(),
};
letter.content.content = [
  {
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text: "Equipment replacement request" }],
  },
  paragraph("Reference: QA/42"),
  paragraph("10 October 2026"),
  paragraph("Dear Test Recipient,"),
  paragraph(
    "Please arrange the replacement of the sample scanner described below. This synthetic letter verifies searchable text, formatting, tables and explicit page breaks.",
  ),
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Important details", marks: [{ type: "bold" }] },
    ],
  },
  {
    type: "table",
    content: [
      ["Item", "Quantity"],
      ["Scanner", "1"],
      ["Power cable", "2"],
    ].map((values, i) => ({
      type: "tableRow",
      content: values.map((text) => ({
        type: i === 0 ? "tableHeader" : "tableCell",
        content: [paragraph(text)],
      })),
    })),
  },
  paragraph("Yours faithfully,"),
  paragraph("Test Signatory"),
  { type: "pageBreak" },
  {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "Enclosure: equipment register" }],
  },
  {
    type: "table",
    content: Array.from({ length: 60 }, (_, i) => ({
      type: "tableRow",
      content: [
        {
          type: i === 0 ? "tableHeader" : "tableCell",
          content: [paragraph(i ? "Equipment " + i : "Item")],
        },
        {
          type: i === 0 ? "tableHeader" : "tableCell",
          content: [
            paragraph(i ? "Condition verified in synthetic test" : "Status"),
          ],
        },
      ],
    })),
  },
];
await mkdir(".artifacts/qa", { recursive: true });
await writeFile(".artifacts/qa/letter-qa.docx", await exportDocx(letter));
await writeFile(".artifacts/qa/letter-qa.pdf", await exportPdf(letter));
console.log("Wrote synthetic QA DOCX; visual inspection still required.");
