import sys
from pdf2docx import Converter

# Ensure the server passed the right arguments
if len(sys.argv) < 3:
    print("Error: Missing input or output file paths.", file=sys.stderr)
    sys.exit(1)

pdf_file = sys.argv[1]
docx_file = sys.argv[2]

try:
    # Initialize the converter
    cv = Converter(pdf_file)
    
    # Convert all pages
    cv.convert(docx_file)
    
    # Close the converter to free up system memory
    cv.close()
    
except Exception as e:
    print(f"Error during conversion: {e}", file=sys.stderr)
    sys.exit(1)