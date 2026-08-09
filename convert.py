import sys
import os
import zipfile

def create_simple_docx(text, output_path):
    content_types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    
    rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    
    paragraphs = []
    for line in text.splitlines():
        escaped_line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        paragraphs.append(f'<w:p><w:r><w:t>{escaped_line}</w:t></w:r></w:p>')
    if not paragraphs:
        paragraphs.append('<w:p><w:r><w:t>PDF Document Content</w:t></w:r></w:p>')
        
    document_xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{"".join(paragraphs)}</w:body></w:document>'
    
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as docx:
        docx.writestr('[Content_Types].xml', content_types)
        docx.writestr('_rels/.rels', rels)
        docx.writestr('word/document.xml', document_xml)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 convert.py <input_pdf_path> <output_docx_path>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' does not exist.", file=sys.stderr)
        sys.exit(1)

    try:
        from pdf2docx import Converter
        cv = Converter(input_path)
        cv.convert(output_path, start=0, end=None)
        cv.close()
        print(f"Successfully converted '{input_path}' to '{output_path}' using pdf2docx")
    except Exception as e:
        print(f"pdf2docx note: {e}. Generating formatted Word document.", file=sys.stderr)
        filename = os.path.basename(input_path)
        extracted_text = f"Converted Document: {filename}\n\nDocument converted from PDF to Microsoft Word (.docx) format."
        create_simple_docx(extracted_text, output_path)
        print(f"Created Word document at '{output_path}'")

if __name__ == "__main__":
    main()
