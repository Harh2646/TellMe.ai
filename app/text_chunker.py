import re
from pathlib import Path
from pypdf import PdfReader


def extract_text_with_pages(pdf_path):
    reader = PdfReader(pdf_path)
    pages = []

    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text()
        if text:
            pages.append({
                "page": page_num,
                "text": text
            })

    return pages


def clean_text(text):
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def chunk_text_with_metadata(pages, chunk_size=500):
    chunks = []

    for page_data in pages:
        words = clean_text(page_data["text"]).split()
        page_number = page_data["page"]

        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_text = " ".join(chunk_words)

            chunks.append({
                "page": page_number,
                "text": chunk_text
            })

    return chunks


if __name__ == "__main__":
    pdf_path = Path("data/raw/sample.pdf")

    if not pdf_path.exists():
        print("PDF not found in data/raw/")
        exit()

    pages = extract_text_with_pages(pdf_path)
    chunks = chunk_text_with_metadata(pages, chunk_size=500)

    print("TEXT CLEANING & CHUNKING COMPLETED")
    print(f"Total pages processed: {len(pages)}")
    print(f"Total chunks created: {len(chunks)}\n")

    print("📌 Sample chunk:")
    print(f"Page: {chunks[0]['page']}")
    print(chunks[0]['text'][:800])
