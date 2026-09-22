"""Real engine regression suite: python tests/word-conversion.py.

Requires requirements-word.txt, reportlab (fixtures only), and local English
Tesseract data. Outputs remain in .artifacts/word-qa for visual comparison.
"""
import importlib.util
import io
import logging
from pathlib import Path
import sys
import unittest
import zipfile
from xml.etree import ElementTree as ET

import pymupdf as fitz
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".artifacts" / "word-qa"
OUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("word_converter", ROOT / "convert.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
logging.disable(logging.CRITICAL)
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def xml_output(name):
    with zipfile.ZipFile(OUT / (name + ".docx")) as archive:
        return ET.fromstring(archive.read("word/document.xml")), archive.namelist()


def contents(xml):
    return " ".join(e.text or "" for e in xml.findall(".//w:t", NS))


class WordConversion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        c = canvas.Canvas(str(OUT / "native.pdf"), pagesize=(612, 792))
        c.setFont("Helvetica-Bold", 22)
        c.drawString(48, 735, "Quarterly sales report")
        c.setFont("Helvetica", 11)
        c.drawString(48, 705, "Revenue increased during the quarter. All values are in USD.")
        c.setFont("Helvetica-Oblique", 11)
        c.drawString(48, 684, "Prepared for the operations team")
        for y in [635, 605, 575, 545]:
            c.line(48, y, 500, y)
        for x in [48, 275, 500]:
            c.line(x, 545, x, 635)
        for y, left, right in [(615, "Product", "Revenue"), (585, "Alpha", "1200"), (555, "Beta", "3400")]:
            c.drawString(60, y, left)
            c.drawString(287, y, right)
        image = Image.new("RGB", (240, 100), "#f0f5ff")
        draw = ImageDraw.Draw(image)
        draw.rectangle((20, 50, 90, 85), fill="#145ac2")
        draw.rectangle((130, 20, 210, 85), fill="#28a583")
        c.drawImage(ImageReader(image), 48, 395, width=240, height=100)
        c.showPage()
        c.setFont("Helvetica-Bold", 18)
        c.drawString(48, 735, "Regional outlook")
        c.setFont("Helvetica", 11)
        for row in range(7):
            c.drawString(48, 700 - row * 18, f"Western region note {row + 1}.")
            c.drawString(330, 700 - row * 18, f"Eastern region note {row + 1}.")
        c.save()
        # Raster-only source with no searchable text layer.
        with fitz.open(OUT / "native.pdf") as native:
            with fitz.open() as scan:
                page = scan.new_page(width=612, height=792)
                page.insert_image(page.rect, stream=native[0].get_pixmap(dpi=180).tobytes("png"))
                scan.save(OUT / "scan.pdf")
            with fitz.open(OUT / "scan.pdf") as scan:
                native.insert_pdf(scan)
                native.save(OUT / "mixed.pdf")
        with fitz.open() as blank:
            blank.new_page()
            blank.save(OUT / "blank.pdf")
        with fitz.open(OUT / "native.pdf") as native:
            native.save(OUT / "protected.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="fixture", user_pw="fixture")

    def test_native_layout_and_editable_objects(self):
        result = engine.convert(OUT / "native.pdf", OUT / "native.docx")
        self.assertEqual(result, {"pages": 2, "ocrPages": 0})
        xml, names = xml_output("native")
        for expected in ["Quarterly sales report", "Alpha", "1200", "Beta", "3400", "Regional outlook", "Western region", "Eastern region"]:
            self.assertIn(expected, contents(xml))
        self.assertTrue(xml.findall(".//w:tbl", NS), "table must be editable, not an image")
        self.assertTrue(xml.findall(".//w:b", NS), "bold heading must survive")
        self.assertTrue(any(name.startswith("word/media/") for name in names), "image must survive")
        self.assertGreaterEqual(len(xml.findall(".//w:sectPr", NS)), 2)
        self.assertTrue(any(node.get("{" + NS["w"] + "}num") == "2" for node in xml.findall(".//w:cols", NS)))

    def test_scan_has_editable_ocr_not_screenshot(self):
        result = engine.convert(OUT / "scan.pdf", OUT / "scan.docx")
        self.assertEqual(result["ocrPages"], 1)
        xml, names = xml_output("scan")
        self.assertIn("Quarterly sales report", contents(xml))
        self.assertIn("1200", contents(xml))
        self.assertIn("3400", contents(xml))
        self.assertTrue(xml.findall(".//w:tbl", NS), "scan grid must become editable table cells")
        self.assertFalse(any(name.startswith("word/media/") for name in names))

    def test_mixed_keeps_native_and_ocr(self):
        result = engine.convert(OUT / "mixed.pdf", OUT / "mixed.docx")
        self.assertEqual(result, {"pages": 3, "ocrPages": 1})
        xml, _ = xml_output("mixed")
        self.assertEqual(contents(xml).count("Quarterly sales report"), 2)
        self.assertIn("Regional outlook", contents(xml))
        self.assertTrue(xml.findall(".//w:tbl", NS))

    def test_page_range(self):
        result = engine.convert(OUT / "native.pdf", OUT / "range.docx", start=2, end=2)
        self.assertEqual(result["pages"], 1)
        xml, _ = xml_output("range")
        self.assertIn("Regional outlook", contents(xml))
        self.assertNotIn("Quarterly sales", contents(xml))

    def test_force_ocr_and_rotation(self):
        with fitz.open(OUT / "native.pdf") as native:
            native[0].set_rotation(90)
            native.save(OUT / "rotated.pdf")
        result = engine.convert(OUT / "rotated.pdf", OUT / "rotated.docx", ocr="force", end=1)
        self.assertEqual(result, {"pages": 1, "ocrPages": 1})
        xml, _ = xml_output("rotated")
        self.assertIn("Quarterly sales report", contents(xml))

    def test_limits_before_conversion(self):
        with fitz.open() as many:
            for _ in range(201):
                many.new_page()
            many.save(OUT / "many.pdf")
        with self.assertRaisesRegex(engine.ConversionError, "PAGE_LIMIT"):
            engine.convert(OUT / "many.pdf", OUT / "rejected.docx")
        with self.assertRaisesRegex(engine.ConversionError, "OCR_LIMIT"):
            engine.convert(OUT / "many.pdf", OUT / "rejected.docx", ocr="force", end=41)

    def test_clear_errors(self):
        for name, options, code in [
            ("blank", {}, "NO_TEXT"), ("protected", {}, "PASSWORD"),
            ("native", {"start": 8}, "PAGE_RANGE"),
            ("scan", {"ocr": "off"}, "OCR_REQUIRED"),
            ("native", {"language": "../eng"}, "OPTIONS"),
        ]:
            with self.subTest(code=code), self.assertRaisesRegex(engine.ConversionError, code):
                engine.convert(OUT / (name + ".pdf"), OUT / "rejected.docx", **options)


if __name__ == "__main__":
    unittest.main(verbosity=2)
