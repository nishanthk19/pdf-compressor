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
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            print(json.dumps({"totalPages": 0, "pages": [], "spans": []}))
            sys.exit(0)

        pages_data = []
        all_page1_spans = []

        for page_num in range(total_pages):
            page = doc[page_num]
            page_dict = page.get_text("dict")
            spans = []

            for block in page_dict.get("blocks", []):
                if block.get("type") == 0:  # text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            if not text.strip():
                                continue
                            bbox = span.get("bbox")  # (x0, y0, x1, y1)
                            size = span.get("size", 11)
                            font = span.get("font", "Helvetica")

                            span_obj = {
                                "text": text,
                                "bbox": [round(bbox[0], 2), round(bbox[1], 2), round(bbox[2], 2), round(bbox[3], 2)],
                                "size": round(size, 2),
                                "font": font
                            }
                            spans.append(span_obj)

            pages_data.append({
                "pageIndex": page_num,
                "pageNumber": page_num + 1,
                "width": round(page.rect.width, 2),
                "height": round(page.rect.height, 2),
                "spans": spans
            })

            if page_num == 0:
                all_page1_spans = spans

        doc.close()
        print(json.dumps({
            "totalPages": total_pages,
            "pages": pages_data,
            "spans": all_page1_spans
        }))

    except Exception as e:
        sys.stderr.write(f"Error extracting coordinates: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

