import { imageDimensions } from "./letter-image.js";
import { chromium } from "playwright";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  ExternalHyperlink,
  AlignmentType,
} from "docx";
import { readFile } from "node:fs/promises";
import {
  nodeHtml,
  pageDimensions,
  PRINT_CSS,
  escapeHtml,
  resolveFields,
  missingFields,
  stationeryHtml,
} from "../public/js/letter-model.js";
import { validateLetter, fail } from "./letter-validation.js";
import { exportGate } from "./letter-ai.js";
import { renderViaSocket } from "./letter-render-client.js";
export { stationeryHtml };
export async function exportPdf(input, { local = false } = {}) {
  const letter = validateLetter(input);
  if (missingFields(letter).length)
    throw fail("Fill all document fields before exporting.");
  return exportGate.run(async () => {
    if (process.env.LETTER_RENDER_SOCKET && !local) return renderViaSocket(letter);
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: process.env.LETTER_CHROMIUM_NO_SANDBOX !== "true",
      executablePath: process.env.LETTER_CHROMIUM_PATH || undefined,
      args:
        process.env.LETTER_CHROMIUM_NO_SANDBOX === "true"
          ? ["--no-sandbox"]
          : [],
    });
    const deadline = setTimeout(() => browser.close().catch(() => {}), 45000);
    deadline.unref();
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      const [width, height] = pageDimensions(letter.page);
      await page.setContent(
        `<html><head><meta charset="utf-8"><style>${PRINT_CSS}body{font-family:"${letter.page.font}";font-size:${letter.page.fontSize}pt;line-height:${letter.page.lineHeight}}@page{size:${width}mm ${height}mm;margin:0}.printed-page{break-after:page}.printed-page:last-child{break-after:auto}</style></head><body><main id="print">${nodeHtml(letter.content, letter.fields)}${letter.stationery.signature ? `<img class="signature" src="${letter.stationery.signature}">` : ""}</main></body></html>`,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((i) => i.decode().catch(() => {})),
        );
      });
      const js = await readFile(
        new URL("../public/js/letter-pagination.js", import.meta.url),
        "utf8",
      );
      await page.addScriptTag({
        content: js.replace(
          "export function paginate",
          "window.paginate = function paginate",
        ),
      });
      await page.evaluate(
        ({ width, height, margin, headers, footers }) => {
          const root = document.querySelector("#print");
          root.replaceChildren(
            ...root.firstElementChild.children,
            ...[...root.children].slice(1),
          );
          window.paginate(root, {
            width,
            height,
            margin,
            headerHtml: (i) => headers[i === 1 ? 0 : 1],
            footerHtml: (i) =>
              footers[i === 1 ? 0 : 1].replace(
                /data-current-page>\d+</,
                `data-current-page>${i}<`,
              ),
          });
        },
        {
          width,
          height,
          margin: letter.page.margin,
          headers: [stationeryHtml(letter, 1), stationeryHtml(letter, 2)],
          footers: [
            stationeryHtml(letter, 1, true),
            stationeryHtml(letter, 2, true),
          ],
        },
      );
      await page.evaluate(async () => {
        await Promise.all(
          [...document.images].map((i) => i.decode().catch(() => {})),
        );
        for (const n of document.querySelectorAll(".stationery"))
          if (n.scrollHeight > n.clientHeight + 1)
            throw new Error("Letterhead or footer is too tall.");
      });
      return await page.pdf({
        width: `${width}mm`,
        height: `${height}mm`,
        printBackground: true,
        timeout: 30000,
      });
    } finally {
      clearTimeout(deadline);
      await browser.close();
    }
  });
}
export async function exportDocx(input) {
  const letter = validateLetter(input);
  if (missingFields(letter).length)
    throw fail("Fill all document fields before exporting.");
  return exportGate.run(async () => {
    const p = letter.page,
      s = letter.stationery,
      [width, height] = pageDimensions(p);
    const mm = (n) => Math.round(n * 56.6929);
    const image = (src, maxWidth = 189, maxHeight = 75) => {
      const i = imageDimensions(src),
        scale = Math.min(1, maxWidth / i.width, maxHeight / i.height);
      return new ImageRun({
        data: i.data,
        type: i.type,
        transformation: {
          width: Math.round(i.width * scale),
          height: Math.round(i.height * scale),
        },
      });
    };
    function runs(n) {
      if (n.type === "hardBreak") return [new TextRun({ break: 1 })];
      if (n.type === "image")
        return [
          image(
            n.attrs.src,
            Math.min(650, Number(n.attrs.width) || 240),
            (height - p.margin * 2 - 48) * 3.7795,
          ),
        ];
      if (n.type !== "text") return (n.content || []).flatMap(runs);
      const marks = n.marks || [],
        style = marks.find((m) => m.type === "textStyle")?.attrs || {};
      const runOptions = {
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
        underline: marks.some((m) => m.type === "underline") ? {} : undefined,
        strike: marks.some((m) => m.type === "strike"),
        font: style.fontFamily || p.font,
        size: (parseFloat(style.fontSize) || p.fontSize) * 2,
        color: style.color?.replace("#", ""),
      };
      const resolvedRuns = resolveFields(n.text, letter.fields)
        .split(/\r?\n/)
        .map(
          (text, index) =>
            new TextRun({
              ...runOptions,
              text,
              ...(index ? { break: 1 } : {}),
            }),
        );
      const link = marks.find((m) => m.type === "link");
      return [
        link
          ? new ExternalHyperlink({
              link: link.attrs.href,
              children: resolvedRuns,
            })
          : resolvedRuns,
      ].flat();
    }
    function blocks(n, list = null, level = 0) {
      const a = n.attrs || {};
      if (n.type === "doc" || n.type === "blockquote" || n.type === "listItem")
        return (n.content || []).flatMap((c) => blocks(c, list, level));
      if (n.type === "bulletList" || n.type === "orderedList")
        return (n.content || []).flatMap((c) => blocks(c, n.type, level + 1));
      if (n.type === "pageBreak")
        return [new Paragraph({ pageBreakBefore: true })];
      if (n.type === "table")
        return [
          new Table({
            width: { size: 100, type: "pct" },
            rows: (n.content || []).map(
              (row) =>
                new TableRow({
                  tableHeader: row.content.some(
                    (c) => c.type === "tableHeader",
                  ),
                  children: row.content.map(
                    (cell) =>
                      new TableCell({
                        columnSpan: cell.attrs?.colspan,
                        rowSpan: cell.attrs?.rowspan,
                        margins: {
                          top: 100,
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        children: cell.content.flatMap((c) => blocks(c)),
                      }),
                  ),
                }),
            ),
          }),
        ];
      return [
        new Paragraph({
          children: runs(n),
          heading:
            n.type === "heading"
              ? `Heading${Math.min(3, a.level || 1)}`
              : undefined,
          alignment:
            AlignmentType[a.textAlign?.toUpperCase()] || AlignmentType.LEFT,
          spacing: {
            after: (Number(a.spaceAfter) || 9) * 20,
            line: Math.round((Number(a.lineHeight) || p.lineHeight) * 240),
          },
          indent: { left: mm((Number(a.indent) || 0) * 12) },
          bullet:
            list === "bulletList"
              ? { level: Math.min(8, level - 1) }
              : undefined,
          numbering:
            list === "orderedList"
              ? { reference: "letters", level: Math.min(8, level - 1) }
              : undefined,
        }),
      ];
    }
    function header(first = false) {
      const lines = resolveFields(
        first ? s.firstHeader : s.header,
        letter.fields,
      )
        .split("\n")
        .map(
          (text) =>
            new Paragraph({
              spacing: { after: 0, line: 240 },
              children: [new TextRun({ text, size: 20, font: p.font })],
            }),
        );
      if (!s.logo) return new Header({ children: lines });
      const none = { style: "none", size: 0, color: "FFFFFF" },
        borders = {
          top: none,
          bottom: none,
          left: none,
          right: none,
          insideHorizontal: none,
          insideVertical: none,
        };
      return new Header({
        children: [
          new Table({
            width: { size: 100, type: "pct" },
            borders,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    width: { size: 25, type: "pct" },
                    children: [
                      new Paragraph({
                        spacing: { after: 0 },
                        children: [image(s.logo, 189, 60)],
                      }),
                    ],
                  }),
                  new TableCell({ borders, children: lines }),
                ],
              }),
            ],
          }),
        ],
      });
    }
    function footer(first = false) {
      return new Footer({
        children: [
          ...resolveFields(first ? s.firstFooter : s.footer, letter.fields)
            .split("\n")
            .map(
              (text) =>
                new Paragraph({
                  spacing: { after: 0, line: 240 },
                  children: [new TextRun({ text, size: 20, font: p.font })],
                }),
            ),
          ...(s.pageNumbers
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      children: [
                        "Page ",
                        PageNumber.CURRENT,
                        " of ",
                        PageNumber.TOTAL_PAGES,
                      ],
                      size: 18,
                    }),
                  ],
                }),
              ]
            : []),
        ],
      });
    }
    const document = new Document({
      creator: "Vibify Letter Studio",
      title: letter.title,
      styles: {
        paragraphStyles: [1, 2, 3].map((n) => ({
          id: "Heading" + n,
          name: "Heading " + n,
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: p.font,
            size: [40, 32, 26][n - 1],
            color: "111111",
            bold: true,
          },
          paragraph: { spacing: { before: 320, after: 200 } },
        })),
        default: {
          document: {
            run: { font: p.font, size: p.fontSize * 2, color: "17222E" },
            paragraph: {
              spacing: { line: Math.round(p.lineHeight * 240), after: 180 },
            },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: "letters",
            levels: Array.from({ length: 9 }, (_, level) => ({
              level,
              format: "decimal",
              text: `%${level + 1}.`,
              alignment: "left",
            })),
          },
        ],
      },
      sections: [
        {
          properties: {
            titlePage: s.differentFirst,
            page: {
              size: { width: mm(width), height: mm(height) },
              margin: {
                top: mm(p.margin + 30),
                bottom: mm(p.margin + 16),
                left: mm(p.margin),
                right: mm(p.margin),
                header: mm(p.margin),
                footer: mm(p.margin),
              },
            },
          },
          headers: {
            default: header(),
            ...(s.differentFirst ? { first: header(true) } : {}),
          },
          footers: {
            default: footer(),
            ...(s.differentFirst ? { first: footer(true) } : {}),
          },
          children: [
            ...blocks(letter.content),
            ...(s.signature
              ? [new Paragraph({ children: [image(s.signature)] })]
              : []),
          ],
        },
      ],
    });
    return Packer.toBuffer(document);
  });
}
