import sys
import fitz  # PyMuPDF

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 extract_html.py <input_pdf_path> <output_html_path>", file=sys.stderr)
        sys.exit(1)

    input_pdf_path = sys.argv[1]
    output_html_path = sys.argv[2]

    try:
        doc = fitz.open(input_pdf_path)
        html_pages = []

        for page in doc:
            html_pages.append(page.get_text("html"))

        doc.close()

        combined_html = "\n".join(html_pages)

        with open(output_html_path, "w", encoding="utf-8") as f:
            f.write(combined_html)

    except Exception as e:
        print(f"Error extracting HTML from PDF: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
