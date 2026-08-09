import sys
import json
import fitz  # PyMuPDF

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing input PDF path"}), file=sys.stderr)
        sys.exit(1)

    input_pdf_path = sys.argv[1]

    try:
        doc = fitz.open(input_pdf_path)
        if len(doc) == 0:
            print(json.dumps({"error": "PDF has no pages"}))
            sys.exit(0)

        page = doc[0]
        rect = page.rect
        page_width = rect.width
        page_height = rect.height

        page_dict = page.get_text("dict")
        spans = []

        for block in page_dict.get("blocks", []):
            if block.get("type") == 0:  # text block
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        if not text:
                            continue
                        bbox = span.get("bbox")  # (x0, y0, x1, y1)
                        size = span.get("size", 11)
                        font = span.get("font", "Helvetica")
                        color = span.get("color", 0)

                        spans.append({
                            "text": span.get("text", ""),
                            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
                            "size": size,
                            "font": font,
                            "color": color
                        })

        doc.close()

        result = {
            "page_width": page_width,
            "page_height": page_height,
            "spans": spans
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
