import sys
import json
import fitz  # PyMuPDF

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Error: Missing input PDF path\n")
        sys.exit(1)

    input_pdf_path = sys.argv[1]

    try:
        doc = fitz.open(input_pdf_path)
        if len(doc) == 0:
            doc.close()
            print(json.dumps([]))
            sys.exit(0)

        page = doc[0]
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

                        spans.append({
                            "text": span.get("text", ""),
                            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
                            "size": size
                        })

        doc.close()
        print(json.dumps(spans))

    except Exception as e:
        sys.stderr.write(f"Error extracting coordinates: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
