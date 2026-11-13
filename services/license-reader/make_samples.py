"""
Makes fictional sample licenses for testing the reader (not real licenses):
  samples/license-valid.pdf     text PDF, valid until 2027
  samples/license-valid.png     the same license as an image (tests the vision path)
  samples/license-photo-large.jpg  the same at phone-camera size (~3400 px wide)
  samples/license-expired.pdf   text PDF that expired in 2025
  samples/license-other-name.pdf  valid, but issued to a different person/company
Run:  .venv\\Scripts\\python.exe make_samples.py
"""
import os

import fitz

OUT = os.path.join(os.path.dirname(__file__), "samples")


def make(path_pdf, name, business, number, issued, expires, png=None, big_jpg=None):
    doc = fitz.open()
    page = doc.new_page(width=612, height=396)  # landscape card-ish
    page.draw_rect(fitz.Rect(18, 18, 594, 378), color=(0.07, 0.09, 0.11), width=2)
    lines = [
        ("TEXAS DEPARTMENT OF LICENSING AND REGULATION", 15, 40),
        ("Air Conditioning and Refrigeration Contractor License", 13, 70),
        (f"License Number: {number}", 12, 120),
        (f"Licensee: {name}", 12, 145),
        (f"Business Name: {business}", 12, 170),
        ("Class A - Environmental Air", 12, 195),
        (f"Issue Date: {issued}", 12, 230),
        (f"Expiration Date: {expires}", 12, 255),
        ("SAMPLE DOCUMENT FOR TESTING ONLY - NOT A REAL LICENSE", 9, 350),
    ]
    for text, size, y in lines:
        page.insert_text((40, y), text, fontsize=size, fontname="helv")
    doc.save(path_pdf)
    if png:
        page.get_pixmap(dpi=150).save(png)
    if big_jpg:
        with open(big_jpg, "wb") as f:
            f.write(page.get_pixmap(dpi=400).tobytes("jpg"))


os.makedirs(OUT, exist_ok=True)
make(os.path.join(OUT, "license-valid.pdf"), "Maria J. Lopez", "Lopez Cooling, LLC", "TACLA00012345C",
     "03/01/2025", "03/01/2027", png=os.path.join(OUT, "license-valid.png"), big_jpg=os.path.join(OUT, "license-photo-large.jpg"))
make(os.path.join(OUT, "license-expired.pdf"), "Maria J. Lopez", "Lopez Cooling, LLC", "TACLA00012345C",
     "03/01/2023", "03/01/2025")
make(os.path.join(OUT, "license-other-name.pdf"), "John R. Smith", "Smith Air Inc", "TACLA00098765C",
     "06/15/2025", "06/15/2027")
print("samples written to", OUT)
