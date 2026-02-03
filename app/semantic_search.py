from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from pathlib import Path
from text_chunker import extract_text_with_pages, chunk_text_with_metadata


class SemanticSearchEngine:
    def __init__(self, model_name="all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.index = None
        self.text_chunks = []

    def build_index(self, chunks):
        self.text_chunks = chunks
        embeddings = self.model.encode(
            [chunk["text"] for chunk in chunks],
            show_progress_bar=True
        )

        embeddings = np.array(embeddings).astype("float32")
        dimension = embeddings.shape[1]

        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings)

    def search(self, query, top_k=3):
        query_embedding = self.model.encode([query])
        query_embedding = np.array(query_embedding).astype("float32")

        distances, indices = self.index.search(query_embedding, top_k)

        results = []
        for idx in indices[0]:
            results.append(self.text_chunks[idx])

        return results


if __name__ == "__main__":
    pdf_path = Path("data/raw/sample.pdf")

    pages = extract_text_with_pages(pdf_path)
    chunks = chunk_text_with_metadata(pages, chunk_size=500)

    engine = SemanticSearchEngine()
    engine.build_index(chunks)

    print("Semantic index built successfully")

    while True:
        query = input("\nAsk a question (or type 'exit'): ")
        if query.lower() == "exit":
            break

        results = engine.search(query)
        print("\nRelevant results:\n")
        for res in results:
            print(f"[Page {res['page']}] {res['text'][:300]}\n")
