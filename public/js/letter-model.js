// Shared, versioned source of truth for editor, storage, and exports.
export const FIELDS = [
  "recipient",
  "address",
  "date",
  "reference",
  "subject",
  "signatory",
  "enclosures",
];
export const DEFAULT_PAGE = {
  size: "A4",
  orientation: "portrait",
  margin: 22,
  font: "Arial",
  fontSize: 11,
  lineHeight: 1.5,
};
export const DEFAULT_STATIONERY = {
  header: "",
  footer: "",
  firstHeader: "",
  firstFooter: "",
  differentFirst: false,
  pageNumbers: true,
  logo: "",
  signature: "",
};
export const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const textNode = (text) => ({ type: "text", text });
export const paragraph = (text) => ({
  type: "paragraph",
  content: text ? [textNode(text)] : [],
});
export function newLetter(kind = "formal") {
  const bodies = {
    blank: [""],
    formal: [
      "Dear {{recipient}},",
      "I am writing regarding {{subject}}.",
      "Please find the details below.",
      "Yours faithfully,",
      "{{signatory}}",
    ],
    request: [
      "Dear {{recipient}},",
      "Subject: {{subject}}",
      "I would like to request your consideration of the following matter.",
      "Please let me know if any further information is required.",
      "Yours faithfully,",
      "{{signatory}}",
    ],
    reply: [
      "Dear {{recipient}},",
      "With reference to your correspondence regarding {{subject}}, please find our response below.",
      "Thank you for your attention to this matter.",
      "Yours sincerely,",
      "{{signatory}}",
    ],
    reminder: [
      "Dear {{recipient}},",
      "This is a reminder regarding {{subject}}.",
      "Please provide an update at your earliest convenience.",
      "Yours sincerely,",
      "{{signatory}}",
    ],
    notice: [
      "NOTICE",
      "Subject: {{subject}}",
      "This notice is issued to inform you of the following.",
      "{{signatory}}",
    ],
    covering: [
      "Dear {{recipient}},",
      "Please find enclosed the documents relating to {{subject}}.",
      "Enclosures: {{enclosures}}",
      "Yours faithfully,",
      "{{signatory}}",
    ],
  };
  return {
    version: 1,
    title:
      kind === "blank"
        ? "Untitled letter"
        : `${kind[0].toUpperCase() + kind.slice(1)} letter`,
    content: {
      type: "doc",
      content: [
        ...(kind === "blank"
          ? []
          : [
              paragraph("{{date}}"),
              paragraph("{{reference}}"),
              paragraph("{{recipient}}"),
              paragraph("{{address}}"),
            ]),
        ...(bodies[kind] || bodies.formal).map(paragraph),
      ],
    },
    page: { ...DEFAULT_PAGE },
    stationery: { ...DEFAULT_STATIONERY },
    fields: Object.fromEntries(
      FIELDS.map((k) => [
        k,
        k === "date" ? new Date().toISOString().slice(0, 10) : "",
      ]),
    ),
    required: kind === "blank" ? [] : ["recipient", "subject", "signatory"],
    status: "draft",
  };
}
export function resolveFields(text, fields) {
  return String(text || "").replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => fields[key] || `{{${key}}}`,
  );
}
export function missingFields(letter) {
  const found = [
    ...JSON.stringify([letter.content, letter.stationery]).matchAll(
      /\{\{(\w+)\}\}/g,
    ),
  ].map((m) => m[1]);
  return [...new Set([...(letter.required || []), ...found])].filter(
    (k) => !String(letter.fields[k] || "").trim(),
  );
}
export function documentText(letter) {
  const walk = (n) =>
    n.type === "text"
      ? resolveFields(n.text, letter.fields)
      : (n.content || []).map(walk).join(n.type === "doc" ? "\n" : " ");
  return walk(letter.content);
}
export function pageDimensions(page) {
  const d = page.size === "Letter" ? [215.9, 279.4] : [210, 297];
  return page.orientation === "landscape" ? d.reverse() : d;
}
export function stationeryHtml(letter, index, footer = false) {
  const s = letter.stationery,
    first = index === 1 && s.differentFirst;
  const text = escapeHtml(
    resolveFields(
      s[
        first
          ? footer
            ? "firstFooter"
            : "firstHeader"
          : footer
            ? "footer"
            : "header"
      ],
      letter.fields,
    ),
  ).replace(/\n/g, "<br>");
  if (!footer)
    return `<div class="stationery-layout">${s.logo ? `<img src="${escapeHtml(s.logo)}">` : ""}<div>${text}</div></div>`;
  return (
    text +
    (s.pageNumbers
      ? `<div>Page <span data-current-page>${index}</span> of <span data-total-pages></span></div>`
      : "")
  );
}
export function tableColumnWidths(node) {
  const cells = node.content?.[0]?.content || [];
  if (!cells.some((c) => c.attrs?.colwidth?.length)) return null;
  return cells.flatMap((c) => Array.from({ length: Math.max(1, Number(c.attrs?.colspan) || 1) }, (_, i) => Math.max(20, Number(c.attrs?.colwidth?.[i]) || 100)));
}
export function nodeHtml(node, fields = {}) {
  const content = (node.content || []).map((n) => nodeHtml(n, fields)).join("");
  const a = node.attrs || {};
  if (node.type === "text") {
    let text = escapeHtml(resolveFields(node.text, fields)).replace(
      /\r?\n/g,
      "<br>",
    );
    for (const mark of node.marks || []) {
      if (["bold", "italic", "underline", "strike"].includes(mark.type)) {
        const t = { bold: "strong", italic: "em", underline: "u", strike: "s" }[
          mark.type
        ];
        text = `<${t}>${text}</${t}>`;
      }
      if (mark.type === "link" && /^https?:\/\//.test(mark.attrs?.href || ""))
        text = `<a href="${escapeHtml(mark.attrs.href)}">${text}</a>`;
      if (["superscript", "subscript"].includes(mark.type)) {
        const tag = mark.type === "superscript" ? "sup" : "sub";
        text = `<${tag}>${text}</${tag}>`;
      }
      if (mark.type === "textStyle") {
        const m = mark.attrs || {};
        text = `<span style="${m.fontFamily ? `font-family:${escapeHtml(m.fontFamily)};` : ""}${m.fontSize ? `font-size:${Number.parseFloat(m.fontSize)}pt;` : ""}${/^#[0-9a-f]{6}$/i.test(m.color || "") ? `color:${m.color};` : ""}${/^#[0-9a-f]{6}$/i.test(m.backgroundColor || "") ? `background-color:${m.backgroundColor};` : ""}">${text}</span>`;
      }
    }
    return text;
  }
  if (node.type === "pageBreak") return '<div class="page-break"></div>';
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "table") {
    const widths = tableColumnWidths(node), total = widths?.reduce((a, b) => a + b, 0);
    return `<table${widths ? ' style="table-layout:fixed"' : ""}>${widths ? `<colgroup>${widths.map((w) => `<col style="width:${w / total * 100}%">`).join("")}</colgroup>` : ""}${content}</table>`;
  }
  if (node.type === "image")
    return `<img src="${escapeHtml(a.src)}" alt="${escapeHtml(a.alt || "")}" style="width:${Math.min(650, Number(a.width) || 240)}px;max-width:100%;display:block;margin-left:${a.textAlign === "center" || a.textAlign === "right" ? "auto" : "0"};margin-right:${a.textAlign === "right" ? "0" : "auto"}">`;
  const tag =
    {
      doc: "div",
      paragraph: "p",
      heading: `h${Math.min(3, Math.max(1, a.level || 1))}`,
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      blockquote: "blockquote",
      table: "table",
      tableRow: "tr",
      tableCell: "td",
      tableHeader: "th",
      horizontalRule: "hr",
    }[node.type] || "div";
  const style = `${a.textAlign ? `text-align:${a.textAlign};` : ""}${a.indent ? `margin-left:${Number(a.indent) * 12}mm;` : ""}${a.lineHeight ? `line-height:${Number(a.lineHeight)};` : ""}${a.spaceAfter != null ? `margin-bottom:${Number(a.spaceAfter)}pt;` : ""}${a.spaceBefore != null ? `margin-top:${Number(a.spaceBefore)}pt;` : ""}${a.firstLine ? `text-indent:${Number(a.firstLine)}pt;` : ""}${a.keepNext ? "break-after:avoid;" : ""}${/^#[0-9a-f]{6}$/i.test(a.backgroundColor || "") ? `background-color:${a.backgroundColor};` : ""}${["top", "middle", "bottom"].includes(a.verticalAlign) ? `vertical-align:${a.verticalAlign};` : ""}`;
  return `<${tag}${style ? ` style="${style}"` : ""}${["td", "th"].includes(tag) ? ` colspan="${Number(a.colspan) || 1}" rowspan="${Number(a.rowspan) || 1}"` : ""}>${content || (tag === "p" ? "<br>" : "")}</${tag}>`;
}
export const PRINT_CSS = `*{box-sizing:border-box}body{margin:0;color:#17222e}p{margin:0 0 9pt;orphans:2;widows:2}h1,h2,h3{color:#111;break-after:avoid;margin:16pt 0 10pt}h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}table{border-collapse:collapse;width:100%;margin:12pt 0}td,th{border:1px solid #cbd1d8;padding:7pt;vertical-align:top}th{background:#edf1f5}tr{break-inside:avoid}img{max-width:100%;height:auto}blockquote{margin-left:12mm}a{color:inherit}ul,ol{padding-left:8mm}.page-break{break-after:page;height:0} .stationery{font:10pt Arial;white-space:pre-wrap}.stationery-layout{display:flex;align-items:flex-start;gap:5mm}.stationery-layout>div{flex:1}.stationery img{max-height:16mm;max-width:50mm}.signature{max-height:20mm;max-width:50mm}`;
export function legacyLetter(saved) {
  const data = typeof saved === "string" ? JSON.parse(saved) : saved;
  const blocks =
    data?.blocks ||
    data?.body?.blocks ||
    data?.bodyData?.blocks ||
    data?.editorData?.blocks ||
    data?.content?.blocks;
  if (!Array.isArray(blocks))
    throw new Error(
      "This saved draft is not a supported Editor.js document. The original remains unchanged.",
    );
  const strip = (s) =>
    String(s || "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  const letter = newLetter("blank");
  letter.title = data.title || data.headerTitle || "Imported PDF Maker draft";
  letter.content.content = blocks.map((b) =>
    b.type === "header"
      ? {
          type: "heading",
          attrs: { level: Math.min(3, b.data.level || 1) },
          content: [textNode(strip(b.data.text))],
        }
      : paragraph(
          strip(b.data.text || b.data.caption || JSON.stringify(b.data)),
        ),
  );
  letter.stationery.header =
    data.header?.enabled === false
      ? ""
      : [data.header?.title || data.headerTitle, data.header?.subtitle]
          .filter(Boolean)
          .join("\n");
  letter.stationery.footer =
    data.footer?.enabled === false
      ? ""
      : [data.footer?.left || data.footerLeft, data.footer?.right]
          .filter(Boolean)
          .join("\n");
  if (data.settings) {
    letter.page.size =
      data.settings.size?.toLowerCase() === "a4" ? "A4" : "Letter";
    letter.page.orientation =
      data.settings.orientation === "landscape" ? "landscape" : "portrait";
    letter.page.font =
      data.settings.font === "serif"
        ? "Times New Roman"
        : data.settings.font === "mono"
          ? "Courier New"
          : "Arial";
  }
  return letter;
}
