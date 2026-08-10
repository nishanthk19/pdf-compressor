import os
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Import pyHanko and PKCS11 modules for signing logic
try:
    import pkcs11
    from pkcs11 import PKCS11Error
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import fields, signers, pkcs11 as pyhanko_pkcs11
    from pyhanko.sign.fields import SigFieldSpec, append_signature_field
except ImportError:
    pass

class DSCBatchSignerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Central Warehouse Bodhan - DSC Batch Signer")
        self.root.geometry("620x480")
        self.root.resizable(True, True)

        # Style configuration
        style = ttk.Style()
        style.theme_use('clam')
        
        # Main Padding Container
        main_frame = ttk.Frame(self.root, padding="20 20 20 20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Title / Header
        title_label = ttk.Label(
            main_frame,
            text="Central Warehouse Bodhan - DSC Batch Signer",
            font=("Helvetica", 14, "bold")
        )
        title_label.pack(anchor=tk.W, pady=(0, 5))

        subtitle_label = ttk.Label(
            main_frame,
            text="Batch sign PDF documents using hardware USB crypto tokens (PKCS#11)",
            font=("Helvetica", 9),
            foreground="#555555"
        )
        subtitle_label.pack(anchor=tk.W, pady=(0, 20))

        # 1. PDF File Selector
        pdf_frame = ttk.LabelFrame(main_frame, text=" 1. Input PDF Document ", padding="10 10 10 10")
        pdf_frame.pack(fill=tk.X, pady=(0, 15))

        self.pdf_path_var = tk.StringVar()
        pdf_entry = ttk.Entry(pdf_frame, textvariable=self.pdf_path_var, width=50)
        pdf_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))

        browse_btn = ttk.Button(pdf_frame, text="Browse...", command=self.browse_pdf)
        browse_btn.pack(side=tk.RIGHT)

        # 2. Token Driver Selection
        driver_frame = ttk.LabelFrame(main_frame, text=" 2. PKCS#11 Token Driver ", padding="10 10 10 10")
        driver_frame.pack(fill=tk.X, pady=(0, 15))

        self.driver_var = tk.StringVar()
        driver_options = [
            r"C:\Windows\System32\eps2003csp11.dll",  # ePass2003
            r"C:\Windows\System32\proxPKCS11.dll",    # ProxKey
            r"C:\Windows\System32\wdpkcs.dll"          # WatchData
        ]
        self.driver_var.set(driver_options[0])

        driver_combo = ttk.Combobox(
            driver_frame, 
            textvariable=self.driver_var, 
            values=driver_options, 
            width=58
        )
        driver_combo.pack(fill=tk.X, expand=True)

        # 3. Token PIN Input
        pin_frame = ttk.LabelFrame(main_frame, text=" 3. Token PIN / Password ", padding="10 10 10 10")
        pin_frame.pack(fill=tk.X, pady=(0, 20))

        self.pin_var = tk.StringVar()
        pin_entry = ttk.Entry(pin_frame, textvariable=self.pin_var, show="*", width=30)
        pin_entry.pack(anchor=tk.W)

        # 4. Massive Batch Sign Button
        sign_btn = tk.Button(
            main_frame,
            text="BATCH SIGN DOCUMENT",
            font=("Helvetica", 11, "bold"),
            bg="#0284c7",
            fg="white",
            activebackground="#0369a1",
            activeforeground="white",
            height=2,
            cursor="hand2",
            command=self.start_batch_signing
        )
        sign_btn.pack(fill=tk.X, pady=(10, 0))

    def browse_pdf(self):
        filename = filedialog.askopenfilename(
            title="Select PDF File to Sign",
            filetypes=[("PDF Files", "*.pdf"), ("All Files", "*.*")]
        )
        if filename:
            self.pdf_path_var.set(filename)

    def start_batch_signing(self):
        pdf_path = self.pdf_path_var.get().strip()
        driver_lib = self.driver_var.get().strip()
        user_pin = self.pin_var.get().strip()

        if not pdf_path or not os.path.exists(pdf_path):
            messagebox.showerror("Error", "Please select a valid input PDF file.")
            return

        if not driver_lib:
            messagebox.showerror("Error", "Please select or enter a PKCS#11 Token Driver path.")
            return

        if not user_pin:
            messagebox.showerror("Error", "Please enter your Token PIN.")
            return

        out_path = os.path.splitext(pdf_path)[0] + "_signed.pdf"

        try:
            lib = pkcs11.lib(driver_lib)
            slots = lib.get_slots(token_present=True)
            if not slots:
                messagebox.showerror("Token Error", "No USB Hardware Token detected. Please insert your DSC token.")
                return

            token = slots[0].get_token()
            
            with token.open(user_pin=user_pin) as session:
                signer = pyhanko_pkcs11.PKCS11Signer(
                    pkcs11_session=session,
                    cert_label=None
                )

                with open(pdf_path, 'rb') as inf:
                    r = PdfFileReader(inf)
                    num_pages = len(r.pages)

                    working_in_path = pdf_path
                    current_out_path = out_path

                    for page_idx in range(num_pages):
                        with open(working_in_path, 'rb') as in_stream:
                            w = IncrementalPdfFileWriter(in_stream)

                            sig_field_name = f"Signature_Page_{page_idx + 1}"
                            
                            append_signature_field(
                                w,
                                SigFieldSpec(
                                    sig_field_name=sig_field_name,
                                    box=(50, 50, 200, 100),
                                    page_index=page_idx
                                )
                            )

                            meta = signers.PdfSignatureMetadata(field_name=sig_field_name)
                            
                            with open(current_out_path, 'wb') as out_stream:
                                signers.sign_pdf(
                                    w,
                                    meta,
                                    signer=signer,
                                    output=out_stream
                                )

                        working_in_path = current_out_path

            messagebox.showinfo("Success", f"Document batch signed successfully!\nSaved as: {out_path}")

        except Exception as e:
            messagebox.showerror("Signing Failed", f"An error occurred during signing:\n{str(e)}")

def main():
    root = tk.Tk()
    app = DSCBatchSignerApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
