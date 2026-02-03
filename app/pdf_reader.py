from pypdf import PdfReader
from pathlib import Path


def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    full_text = ""

    for page_number, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            full_text += f"\n--- Page {page_number + 1} ---\n"
            full_text += page_text

    return full_text


if __name__ == "__main__":
    pdf_file = Path("data/raw/sample.pdf")

    if not pdf_file.exists():
        print("❌ PDF not found. Please add sample.pdf to data/raw/")
    else:
        text = extract_text_from_pdf(pdf_file)
        print("✅ PDF TEXT EXTRACTED SUCCESSFULLY\n")
        print(text[:2000])  # show only first 2000 characters
