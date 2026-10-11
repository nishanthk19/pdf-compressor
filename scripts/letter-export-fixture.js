// Synthetic acceptance fixture only; never use private correspondence in QA.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { newLetter, paragraph } from "../public/js/letter-model.js";
import { exportDocx, exportPdf } from "../src/letter-export.js";
const letter = newLetter("blank");
// Browser-generated synthetic PNG tests text and non-square logo fidelity.
const imageBrowser = await chromium.launch({chromiumSandbox: process.env.LETTER_CHROMIUM_NO_SANDBOX !== "true"});
let fixtureImage;
try {
  const page = await imageBrowser.newPage({viewport: {width: 180, height: 50}});
  await page.setContent('<body style="margin:0;background:white"><div style="font:bold 30px Arial;color:#2a4c43;padding:5px">VIBIFY QA</div></body>');
  fixtureImage = 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
} finally { await imageBrowser.close(); }
letter.title = "Letter Studio export acceptance";
letter.stationery = {
  ...letter.stationery,
  header: "VIBIFY TEST OFFICE",
  firstHeader: "VIBIFY TEST OFFICE\nOfficial correspondence",
  footer: "QA fixture - not for sending",
  firstFooter: "First page footer",
  differentFirst: true,
  logo: fixtureImage,
  signature: fixtureImage,
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
  {type: "paragraph", content: [{type: "image", attrs: {src: fixtureImage, width: 180}}]},
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
