import {
  DEFAULT_PAGE,
  DEFAULT_STATIONERY,
  FIELDS,
} from "../public/js/letter-model.js";
import { imageDimensions } from "./letter-image.js";
import { fail } from "./letter-validation-error.js";
export { fail };
const nodeTypes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "image",
  "hardBreak",
  "pageBreak",
  "horizontalRule",
]);
const fonts = new Set([
  "Arial",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Calibri",
]);
export function validateLetter(input) {
  if (
    !input ||
    typeof input !== "object" ||
    JSON.stringify(input).length > 2_000_000
  )
    throw fail("Document is missing or too large.");
  if (input.content?.type !== "doc" || !Array.isArray(input.content.content))
    throw fail("Invalid document.");
  let count = 0;
  function walk(n, depth = 0) {
    if (++count > 20000 || depth > 30 || !nodeTypes.has(n?.type))
      throw fail("Unsupported or overly complex document.");
    if (n.content && !Array.isArray(n.content))
      throw fail("Invalid node content.");
    if (n.marks && !Array.isArray(n.marks)) throw fail("Invalid formatting.");
    if (n.type === "text" && (typeof n.text !== "string" || !n.text))
      throw fail("Invalid text.");
    if (n.type === "table" && depth > 1)
      throw fail("Nested tables are not supported.");
    if (n.marks)
      for (const m of n.marks) {
        if (
          ![
            "bold",
            "italic",
            "underline",
            "strike",
            "link",
            "textStyle",
            "code",
          ].includes(m.type)
        )
          throw fail("Unsupported formatting.");
        if (m.type === "link" && !/^https?:\/\//.test(m.attrs?.href || ""))
          throw fail("Links must use HTTP or HTTPS.");
        if (m.type === "textStyle") {
          const a = m.attrs || {};
          if (a.fontFamily && !fonts.has(a.fontFamily))
            throw fail("Unsupported font.");
          if (a.color && !/^#[0-9a-f]{6}$/i.test(a.color))
            throw fail("Use a six-digit text color.");
          if (
            a.fontSize &&
            !/^([8-9]|[1-6][0-9]|7[0-2])(?:\.\d)?(?:pt)?$/.test(
              String(a.fontSize),
            )
          )
            throw fail("Font size must be 8–72 pt.");
        }
      }
    if (
      n.type === "image" &&
      !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(
        n.attrs?.src || "",
      )
    )
      throw fail("Use an uploaded PNG or JPEG image.");
    if (n.type === "image") imageDimensions(n.attrs.src);
    if (
      n.attrs?.textAlign &&
      !["left", "center", "right", "justify"].includes(n.attrs.textAlign)
    )
      throw fail("Invalid alignment.");
    for (const key of [
      "indent",
      "lineHeight",
      "spaceAfter",
      "width",
      "colspan",
      "rowspan",
    ])
      if (
        n.attrs?.[key] != null &&
        (!Number.isFinite(Number(n.attrs[key])) ||
          Number(n.attrs[key]) < 0 ||
          Number(n.attrs[key]) > 700)
      )
        throw fail("Invalid layout value.");
    if (
      n.attrs?.indent > 4 ||
      n.attrs?.lineHeight > 2.5 ||
      n.attrs?.spaceAfter > 36
    )
      throw fail("Paragraph spacing is out of range.");
    (n.content || []).forEach((c) => walk(c, depth + 1));
  }
  walk(input.content);
  const page = { ...DEFAULT_PAGE, ...input.page };
  if (
    !["A4", "Letter"].includes(page.size) ||
    !["portrait", "landscape"].includes(page.orientation) ||
    !fonts.has(page.font) ||
    !Number.isFinite(page.margin) ||
    page.margin < 12 ||
    page.margin > 40 ||
    !Number.isFinite(page.fontSize) ||
    page.fontSize < 8 ||
    page.fontSize > 24 ||
    !Number.isFinite(page.lineHeight) ||
    page.lineHeight < 1 ||
    page.lineHeight > 2.5
  )
    throw fail("Invalid page settings.");
  const stationery = { ...DEFAULT_STATIONERY, ...input.stationery };
  for (const k of ["header", "footer", "firstHeader", "firstFooter"])
    if (typeof stationery[k] !== "string" || stationery[k].length > 1500)
      throw fail("Stationery text is too long.");
  for (const k of ["logo", "signature"])
    if (
      stationery[k] &&
      !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(stationery[k])
    )
      throw fail("Use a PNG or JPEG for stationery images.");
  for (const k of ["logo", "signature"])
    if (stationery[k]) imageDimensions(stationery[k]);
  const fields = Object.fromEntries(
    FIELDS.map((k) => [k, String(input.fields?.[k] || "").slice(0, 2000)]),
  );
  return {
    version: 1,
    title: String(input.title || "Untitled letter").slice(0, 150),
    content: input.content,
    page,
    stationery,
    fields,
    required: (Array.isArray(input.required) ? input.required : []).filter(
      (k) => FIELDS.includes(k),
    ),
    status: input.status === "final" ? "final" : "draft",
  };
}
