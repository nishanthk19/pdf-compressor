export function wordOptions(body = {}) {
  const ocr = body.ocr || "auto";
  const language = body.language || "eng";
  if (!["auto", "off", "force"].includes(ocr)) throw new Error("Choose a valid OCR mode.");
  if (!["eng", "eng+hin", "eng+tam", "fra", "deu", "spa", "por"].includes(language)) throw new Error("Choose a supported OCR language.");
  const page = (value, fallback) => {
    if (value === undefined || value === "") return fallback;
    if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 100000) throw new Error("Page numbers must be positive whole numbers.");
    return Number(value);
  };
  const start = page(body.startPage ?? body.start, 1);
  const end = page(body.endPage ?? body.end, undefined);
  if (end !== undefined && (end < start || end - start + 1 > 200)) throw new Error("Select a range of up to 200 pages, with the last page after the first.");
  return { ocr, language, start, end };
}
