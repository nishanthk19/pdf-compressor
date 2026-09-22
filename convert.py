"""VPS-only PDF to DOCX worker; no remote API or inference.

Digital pages use pdf2docx's layout analysis. Scanned pages supply local OCR
text to the same engine, not a full-page screenshot in Word. The RawPageFactory
adapter is integration-tested against the pinned dependencies.
"""
import argparse
import json
import logging
import math
import os
from pathlib import Path
import sys
import zipfile
from xml.etree import ElementTree

# The Node pool owns concurrency; avoid native-library thread oversubscription.
for variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[variable] = "1"


class ConversionError(Exception):
    pass


def convert(input_path, output_path, *, ocr="auto", language="eng", start=1, end=None):
    import pymupdf as fitz
    from pdf2docx import Converter
    from pdf2docx.page.RawPageFactory import RawPageFactory
    from pdf2docx.page.RawPageFitz import RawPageFitz

    if ocr not in ("auto", "off", "force") or language not in (
        "eng", "eng+hin", "eng+tam", "fra", "deu", "spa", "por"
    ):
        raise ConversionError("OPTIONS")
    try:
        source = fitz.open(input_path)
    except Exception:
        raise ConversionError("INVALID_PDF") from None
    with source:
        if source.needs_pass:
            raise ConversionError("PASSWORD")
        end = source.page_count if end is None else end
        if not 1 <= start <= end <= source.page_count:
            raise ConversionError("PAGE_RANGE")
        if end - start + 1 > 200:
            raise ConversionError("PAGE_LIMIT")
        ocr_pages = set()
        for index in range(start - 1, end):
            page = source[index]
            if page.rect.is_empty or max(page.rect.width, page.rect.height) > 2880:
                raise ConversionError("PAGE_SIZE")
            traces = page.get_texttrace()
            visible = sum(len(span.get("chars", ())) for span in traces if span.get("type") != 3)
            hidden = any(span.get("type") == 3 for span in traces)
            image_area = max((fitz.Rect(i["bbox"]).get_area() for i in page.get_image_info()), default=0)
            coverage = image_area / max(1, page.rect.get_area())
            # Handles existing hidden OCR and scans with digital headers/footers.
            needs_ocr = hidden or coverage >= 0.65 or (visible < 20 and coverage >= 0.15)
            if ocr == "force" or (ocr == "auto" and needs_ocr):
                ocr_pages.add(index)
            elif ocr == "off" and needs_ocr:
                raise ConversionError("OCR_REQUIRED")
        if len(ocr_pages) > 40:
            raise ConversionError("OCR_LIMIT")

    if ocr_pages:
        tessdata = os.environ.get("TESSDATA_PREFIX")
        if not tessdata or any(not (Path(tessdata) / (lang + ".traineddata")).is_file() for lang in language.split("+")):
            raise ConversionError("OCR_UNAVAILABLE")

    class LocalOcrPage(RawPageFitz):
        def extract_raw_dict(self, **settings):
            raw = super().extract_raw_dict(**settings)
            if self.page_engine.number in ocr_pages:
                raw["width"], raw["height"] = self.ocr_size
                self.width, self.height = self.ocr_size
            return raw

        def _preprocess_text(self, **settings):
            if self.page_engine.number not in ocr_pages:
                return super()._preprocess_text(**settings)
            # Bound raster memory even for large PDF page dimensions.
            dpi = min(220, max(36, int(72 * math.sqrt(12_000_000 / self.page_engine.rect.get_area()))))
            try:
                import cv2
                import numpy as np
                cv2.setNumThreads(1)
                pix = self.page_engine.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False)
                pixels = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3).copy()
                gray = cv2.cvtColor(pixels, cv2.COLOR_RGB2GRAY)
                _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
                mask = np.zeros_like(ink)
                self.ocr_shapes = []
                candidates = []
                # Rules can make Tesseract omit an entire table. Remove them from
                # its input and give them separately to pdf2docx as editable borders.
                for horizontal in (True, False):
                    kernel = (max(50, pix.width // 25), 1) if horizontal else (1, max(80, pix.height // 25))
                    lines = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, kernel))
                    contours, _ = cv2.findContours(lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    for contour in contours[:2000]:
                        x, y, w, h = cv2.boundingRect(contour)
                        thickness = h if horizontal else w
                        if thickness > 12:
                            continue
                        candidates.append((horizontal, contour, x, y, w, h))
                for horizontal, contour, x, y, w, h in candidates:
                    crossings = 0
                    for other, _, ox, oy, ow, oh in candidates:
                        if other == horizontal:
                            continue
                        if horizontal:
                            crosses = x - 4 <= ox + ow / 2 <= x + w + 4 and oy - 4 <= y + h / 2 <= oy + oh + 4
                        else:
                            crosses = ox - 4 <= x + w / 2 <= ox + ow + 4 and y - 4 <= oy + oh / 2 <= y + h + 4
                        crossings += int(crosses)
                    # Only a grid, not the stems of large letters or underlines.
                    if crossings < 2:
                        continue
                    cv2.drawContours(mask, [contour], -1, 255, -1)
                    scale = 72 / dpi
                    thickness = h if horizontal else w
                    a = (x * scale, (y + h / 2) * scale) if horizontal else ((x + w / 2) * scale, y * scale)
                    b = ((x + w) * scale, (y + h / 2) * scale) if horizontal else ((x + w / 2) * scale, (y + h) * scale)
                    self.ocr_shapes.append({"start": a, "end": b, "width": max(0.4, thickness * scale), "color": 0})
                pixels[cv2.dilate(mask, np.ones((3, 3), np.uint8)) > 0] = 255
                # Test cardinal orientations locally. Choosing the most recognized
                # word content avoids returning sideways OCR as single-letter noise.
                best_score = -1
                best_turns = 0
                for turns in range(4):
                    oriented = np.ascontiguousarray(np.rot90(pixels, turns))
                    height, width = oriented.shape[:2]
                    clean = fitz.Pixmap(fitz.csRGB, width, height, oriented.tobytes(), False)
                    clean.set_dpi(dpi, dpi)
                    with fitz.open(stream=clean.pdfocr_tobytes(language=language, tessdata=tessdata), filetype="pdf") as recognized:
                        text = recognized[0].get_text()
                        score = sum(len(word) for word in text.split() if len(word) >= 3 and "\ufffd" not in word)
                        if score > best_score:
                            best_score, best_turns = score, turns
                            blocks = recognized[0].get_text("rawdict", flags=0)["blocks"]
                            self.ocr_size = (recognized[0].rect.width, recognized[0].rect.height)
                width, height = pix.width * 72 / dpi, pix.height * 72 / dpi
                for _ in range(best_turns):
                    matrix = fitz.Matrix(0, -1, 1, 0, 0, width)
                    for shape in self.ocr_shapes:
                        shape["start"] = tuple(fitz.Point(shape["start"]) * matrix)
                        shape["end"] = tuple(fitz.Point(shape["end"]) * matrix)
                    width, height = height, width
            except Exception:
                raise ConversionError("OCR_FAILED") from None
            blocks = [block for block in blocks if block.get("type") == 0]
            if not any(char.get("c", "").strip() for block in blocks for line in block["lines"] for span in line["spans"] for char in span["chars"]):
                raise ConversionError("NO_OCR_TEXT")
            for block in blocks:
                for line in block["lines"]:
                    for span in line["spans"]:
                        # GlyphLessFont is a recognition font, not a Word typeface.
                        span["font"] = "Noto Sans Tamil" if "tam" in language else "Noto Sans Devanagari" if "hin" in language else "Arial"
                        span["flags"] = 0
            return blocks

        def _preprocess_images(self, **settings):
            # Do not duplicate a full scan behind recognized editable text.
            # Scanned figures are not reconstructed; the UI explains this.
            if self.page_engine.number in ocr_pages:
                return []
            return super()._preprocess_images(**settings)

        def _preprocess_hyperlinks(self):
            if self.page_engine.number in ocr_pages:
                return []
            return super()._preprocess_hyperlinks()

        def _preprocess_shapes(self, **settings):
            if self.page_engine.number in ocr_pages:
                return self.ocr_shapes, []
            return super()._preprocess_shapes(**settings)

    original = RawPageFactory.MAP["PYMUPDF"]
    RawPageFactory.MAP["PYMUPDF"] = LocalOcrPage
    converter = None
    try:
        converter = Converter(str(input_path))
        for index in range(start - 1, end):
            converter.fitz_doc[index].remove_rotation()
        converter.convert(str(output_path), start=start - 1, end=end,
                          multi_processing=False, ignore_page_error=False,
                          raw_exceptions=True, clip_image_res_ratio=2.0)
    finally:
        if converter is not None:
            converter.close()
        RawPageFactory.MAP["PYMUPDF"] = original

    # A ZIP header alone does not prove success. Reject empty Word output.
    if Path(output_path).stat().st_size > 150 * 1024 * 1024:
        raise ConversionError("OUTPUT_LIMIT")
    with zipfile.ZipFile(output_path) as archive:
        if archive.testzip() is not None:
            raise ConversionError("INVALID_OUTPUT")
        document = ElementTree.fromstring(archive.read("word/document.xml"))
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        text = "".join(node.text or "" for node in document.findall(".//w:t", ns))
        if not text.strip():
            raise ConversionError("NO_TEXT")
    return {"pages": end - start + 1, "ocrPages": len(ocr_pages)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--ocr", default="auto")
    parser.add_argument("--language", default="eng")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        if sys.platform == "linux":
            import resource
            # Hard caps in the conversion subprocess, independent of request size.
            resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024,) * 2)
            resource.setrlimit(resource.RLIMIT_FSIZE, (150 * 1024 * 1024,) * 2)
        logging.disable(logging.CRITICAL)
        result = convert(args.input, args.output, ocr=args.ocr, language=args.language, start=args.start, end=args.end)
        Path(args.report).write_text(json.dumps(result), encoding="utf-8")
    except BaseException as error:
        code = str(error) if isinstance(error, ConversionError) else "DEPENDENCY" if isinstance(error, ImportError) else "RESOURCE_LIMIT" if isinstance(error, MemoryError) else "FAILED"
        print("VIBIFY_WORD_ERROR:" + code, file=sys.stderr)
        Path(args.output).unlink(missing_ok=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
