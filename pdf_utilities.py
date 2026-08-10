import sys
import os
import fitz  # PyMuPDF

def main():
    if len(sys.argv) < 5:
        sys.stderr.write("Usage: python3 pdf_utilities.py <operation> <input> <output> <arg>\n")
        sys.exit(1)

    op = sys.argv[1].lower()
    input_path = sys.argv[2]
    output_path = sys.argv[3]
    arg = sys.argv[4] if len(sys.argv) > 4 else ""

    if not os.path.exists(input_path):
        sys.stderr.write(f"Error: Input file {input_path} does not exist.\n")
        sys.exit(1)

    try:
        if op == "unlock":
            doc = fitz.open(input_path)
            if doc.is_encrypted:
                auth_res = doc.authenticate(arg)
                if not auth_res:
                    sys.stderr.write("Error: Incorrect password for encrypted PDF.\n")
                    sys.exit(1)
            doc.save(output_path)
            doc.close()

        elif op == "protect":
            doc = fitz.open(input_path)
            password = arg.strip()
            if not password:
                sys.stderr.write("Error: Password cannot be empty.\n")
                sys.exit(1)
            doc.save(
                output_path,
                encryption=fitz.PDF_ENCRYPT_AES_256,
                owner_pw=password,
                user_pw=password
            )
            doc.close()

        elif op == "rotate":
            doc = fitz.open(input_path)
            try:
                angle = int(arg)
            except ValueError:
                angle = 90
            
            for page in doc:
                new_rot = (page.rotation + angle) % 360
                page.set_rotation(new_rot)
            
            doc.save(output_path)
            doc.close()

        elif op == "delete":
            doc = fitz.open(input_path)
            total_pages = len(doc)
            
            raw_pages = arg.split(',')
            pages_to_delete = set()
            
            for item in raw_pages:
                item = item.strip()
                if not item:
                    continue
                if '-' in item:
                    parts = item.split('-')
                    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                        start_p = int(parts[0])
                        end_p = int(parts[1])
                        for p in range(start_p, end_p + 1):
                            pages_to_delete.add(p - 1)
                elif item.isdigit():
                    pages_to_delete.add(int(item) - 1)

            valid_to_delete = sorted([p for p in pages_to_delete if 0 <= p < total_pages], reverse=True)
            
            if not valid_to_delete:
                sys.stderr.write("Error: No valid page numbers specified for deletion.\n")
                sys.exit(1)

            if len(valid_to_delete) >= total_pages:
                sys.stderr.write("Error: Cannot delete all pages in the PDF document.\n")
                sys.exit(1)

            for p in valid_to_delete:
                doc.delete_page(p)

            doc.save(output_path)
            doc.close()

        elif op == "paginate":
            doc = fitz.open(input_path)
            position = arg.strip().lower() if arg else "bottom-center"

            for page in doc:
                width = page.rect.width
                height = page.rect.height
                margin = 30

                # Calculate X and Y coordinates with 30-point margin
                pos_map = {
                    "top-left": (margin, margin + 10),
                    "top-center": (width / 2, margin + 10),
                    "top-right": (width - 50, margin + 10),
                    "middle-left": (margin, height / 2),
                    "middle-center": (width / 2, height / 2),
                    "middle-right": (width - 50, height / 2),
                    "bottom-left": (margin, height - margin),
                    "bottom-center": (width / 2, height - margin),
                    "bottom-right": (width - 50, height - margin)
                }

                x, y = pos_map.get(position, (width / 2, height - margin))
                page_str = str(page.number + 1)

                # Visually adjust X position for center and right alignment
                if "center" in position:
                    x = x - (len(page_str) * 3.5)
                elif "right" in position:
                    x = x - (len(page_str) * 7)

                page.insert_text(
                    fitz.Point(x, y),
                    page_str,
                    fontsize=12,
                    fontname="helv"
                )

            doc.save(output_path)
            doc.close()

        else:
            sys.stderr.write(f"Error: Unknown operation '{op}'.\n")
            sys.exit(1)

    except Exception as e:
        sys.stderr.write(f"Error executing operation '{op}': {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
