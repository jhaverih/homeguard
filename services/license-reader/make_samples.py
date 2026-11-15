"""
Makes fictional sample licenses for testing the reader (not real licenses):
  samples/license-valid.pdf     text PDF, valid until 2027
  samples/license-valid.png     the same license as an image (tests the vision path)
  samples/license-photo-large.jpg  the same at phone-camera size (~3400 px wide)
  samples/license-expired.pdf   text PDF that expired in 2025
  samples/license-other-name.pdf  valid, but issued to a different person/company
  samples/registration-*.pdf    state registrations (TN active, KY dissolved, TN other name)
  samples/coi-*.pdf             certificates of insurance (good, no additional insured, low limit, expired)
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


def text_pdf(path_pdf, lines, png=None):
    """A one-page letter PDF with the given (text, size) lines, top to bottom."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    y = 60
    for text, size in lines:
        page.insert_text((50, y), text, fontsize=size, fontname="helv")
        y += size + 12
    page.insert_text((50, 760), "SAMPLE DOCUMENT FOR TESTING ONLY - NOT A REAL RECORD", fontsize=8, fontname="helv")
    doc.save(path_pdf)
    if png:
        page.get_pixmap(dpi=150).save(png)


def registration(path_pdf, state_name, code, name, number, status_line, formed):
    text_pdf(path_pdf, [
        (f"STATE OF {state_name.upper()}", 16),
        ("Secretary of State - Division of Business Services", 12),
        ("CERTIFICATE OF EXISTENCE", 15),
        (f"Entity Name: {name}", 12),
        (f"Control Number: {number}", 12),
        (f"State of Formation: {code}", 12),
        ("Entity Type: Limited Liability Company", 12),
        (f"Formation Date: {formed}", 12),
        (f"Status: {status_line}", 12),
        ("Date Issued: 10/01/2026", 12),
    ])


def coi(path_pdf, holder_ai, limit, expires, png=None):
    ai_flag = "Y" if holder_ai else " "
    desc = ("Certificate holder Attenteve LLC is named as additional insured with respect to general liability."
            if holder_ai else "Evidence of coverage only.")
    text_pdf(path_pdf, [
        ("ACORD 25  CERTIFICATE OF LIABILITY INSURANCE   DATE: 10/01/2026", 12),
        ("PRODUCER: Volunteer Insurance Agency, Nashville TN", 10),
        ("INSURED: Lopez Cooling, LLC  2509 Hospitality Drive, Columbia TN 38401", 10),
        ("INSURER A: Middle Tennessee Mutual Insurance Co.   NAIC 12345", 10),
        ("TYPE OF INSURANCE: COMMERCIAL GENERAL LIABILITY - OCCUR", 10),
        (f"INSR LTR: A   ADDL INSD: {ai_flag}   POLICY NUMBER: GL-7784512", 10),
        (f"POLICY EFF: 03/01/2026   POLICY EXP: {expires}", 10),
        (f"LIMITS: EACH OCCURRENCE ${limit:,}   GENERAL AGGREGATE ${limit * 2:,}", 10),
        (f"DESCRIPTION OF OPERATIONS: {desc}", 9),
        ("CERTIFICATE HOLDER: Attenteve LLC, Nashville TN", 10),
        ("AUTHORIZED REPRESENTATIVE: J. Agent", 10),
    ], png=png)


os.makedirs(OUT, exist_ok=True)
registration(os.path.join(OUT, "registration-tn-active.pdf"), "Tennessee", "TN", "Lopez Cooling, LLC", "001234567",
             "Active - In Good Standing", "04/12/2019")
registration(os.path.join(OUT, "registration-ky-dissolved.pdf"), "Kentucky", "KY", "Lopez Cooling, LLC", "1098765",
             "Administratively Dissolved", "04/12/2019")
registration(os.path.join(OUT, "registration-tn-other-name.pdf"), "Tennessee", "TN", "Smith Air Inc", "000998877",
             "Active - In Good Standing", "06/01/2015")
coi(os.path.join(OUT, "coi-good.pdf"), True, 1000000, "03/01/2027", png=os.path.join(OUT, "coi-good.png"))
coi(os.path.join(OUT, "coi-no-additional-insured.pdf"), False, 1000000, "03/01/2027")
coi(os.path.join(OUT, "coi-low-limit.pdf"), True, 500000, "03/01/2027")
coi(os.path.join(OUT, "coi-expired.pdf"), True, 1000000, "03/01/2026")
make(os.path.join(OUT, "license-valid.pdf"), "Maria J. Lopez", "Lopez Cooling, LLC", "TACLA00012345C",
     "03/01/2025", "03/01/2027", png=os.path.join(OUT, "license-valid.png"), big_jpg=os.path.join(OUT, "license-photo-large.jpg"))
make(os.path.join(OUT, "license-expired.pdf"), "Maria J. Lopez", "Lopez Cooling, LLC", "TACLA00012345C",
     "03/01/2023", "03/01/2025")
make(os.path.join(OUT, "license-other-name.pdf"), "John R. Smith", "Smith Air Inc", "TACLA00098765C",
     "06/15/2025", "06/15/2027")
print("samples written to", OUT)
