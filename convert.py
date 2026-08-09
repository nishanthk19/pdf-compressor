import sys
from pdf2docx import Converter

# 1. Ensure the server passed the right arguments
if len(sys.argv) < 3:
    print("Error: Missing input or output file paths.", file=sys.stderr)
    sys.exit(1)

pdf_file = sys.argv[1]
docx_file = sys.argv[2]

try:
    # 2. Initialize the heavy layout-analysis engine
    cv = Converter(pdf_file)
    
    # 3. Convert all pages to Word format
    cv.convert(docx_file)
    
    # 4. Close the converter to free up your server's RAM
    cv.close()
    
except Exception as e:
    # If the PDF is corrupted, crash gracefully so Node.js can catch the error
    print(f"Error during conversion: {e}", file=sys.stderr)
    sys.exit(1)