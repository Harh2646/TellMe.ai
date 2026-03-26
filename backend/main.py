"""
TellMe.ai v2 — Backend API
AI-Powered Multi-Document Reader & Voice Assistant
Fully Offline | CPU-Friendly | phi3:mini via Ollama
UNIVERSAL: Works with ANY document type
OPTIMIZED: Smart detection + timeout protection
"""
import os, uuid, json, time, logging, threading, shutil, re
import numpy as np
from pathlib import Path
from typing import Optional, List
from datetime import datetime

import fitz                          # PyMuPDF
import faiss
import requests
from sentence_transformers import SentenceTransformer
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pyttsx3

# ─────────────────────────────────────────────────────────────────────────────
# 1. CONFIG
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "phi3:mini"

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# 2. EMBEDDING MODEL
# ─────────────────────────────────────────────────────────────────────────────
logging.info("Loading embedding model...")

MODEL_PATH = "./models/all-MiniLM-L6-v2"
if os.path.exists(MODEL_PATH):
    embed_model = SentenceTransformer(MODEL_PATH)
    logging.info("Embedding model loaded from local cache (fully offline).")
else:
    embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    logging.warning("Model downloaded from internet. Run offline save script.")

logging.info("Embedding model ready.")

# ─────────────────────────────────────────────────────────────────────────────
# 3. PDF HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def extract_text_from_pdf(pdf_path: Path) -> List[dict]:
    doc   = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc, 1):
        pages.append({"page": i, "text": page.get_text()})
    doc.close()
    return pages


def chunk_text(text: str, size: int = 500, overlap: int = 50) -> List[str]:
    words  = text.split()
    chunks = []
    for i in range(0, len(words), size - overlap):
        chunk = " ".join(words[i : i + size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks

# ─────────────────────────────────────────────────────────────────────────────
# 4. RAG HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def build_index(session, new_chunks: Optional[List[str]] = None):
    if new_chunks:
        embeddings = embed_model.encode(new_chunks, show_progress_bar=True)
        if session.index is None:
            d = embeddings.shape[1]
            session.index = faiss.IndexFlatL2(d)
            session.embeddings = embeddings
            session.index.add(embeddings)
        else:
            session.index.add(embeddings)
            session.embeddings = (
                embeddings if session.embeddings is None
                else np.vstack([session.embeddings, embeddings])
            )
        return

    if not session.chunks:
        return

    embeddings = embed_model.encode(session.chunks, show_progress_bar=True)
    d = embeddings.shape[1]
    session.index = faiss.IndexFlatL2(d)
    session.index.add(embeddings)
    session.embeddings = embeddings


def retrieve_context(session, query: str, top_k: int = 5) -> List[dict]:
    if session.index is None:
        return []
    q_vec              = embed_model.encode([query])
    distances, indices = session.index.search(q_vec, min(top_k, len(session.chunks)))
    results, seen      = [], set()
    for idx in indices[0]:
        if 0 <= idx < len(session.chunks):
            chunk = session.chunks[idx]
            if chunk in seen:
                continue
            seen.add(chunk)
            meta = session.chunk_meta[idx]
            results.append({
                "text":     chunk,
                "filename": meta["filename"],
                "page":     meta["page"]
            })
    return results


def optimize_context_text(text: str, max_chars: int = 3500) -> str:
    text      = " ".join(text.split())
    sentences = text.split(". ")
    filtered  = [s.strip() for s in sentences if len(s.strip()) > 40]
    cleaned   = ". ".join(filtered)
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars]
    return cleaned


def clean_streaming_tokens(text: str) -> str:
    """
    Clean tokenization artifacts.
    Runs on FULL answer after streaming completes — for saving to history only.
    NOT used for live display.
    """
    cleaned = text
    cleaned = re.sub(r'\s+([.,!?:;])', r'\1', cleaned)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    cleaned = re.sub(r'(\d)\s+\.\s+(\d)', r'\1.\2', cleaned)
    cleaned = re.sub(r'\s+\'', "'", cleaned)
    cleaned = re.sub(r'\'\s+', "'", cleaned)
    return cleaned.strip()

# ─────────────────────────────────────────────────────────────────────────────
# 5. OLLAMA HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def estimate_question_complexity(question: str) -> str:
    q       = question.lower()
    n_words = len(q.split())

    list_patterns = [
        "list", "list all", "enumerate", "name all", "what are the",
        "show all", "give me all", "tell me all", "methods", "applications",
        "give all", "all the"
    ]
    if any(pattern in q for pattern in list_patterns):
        return "detailed"

    simple   = ["what is", "define", "who is", "when was", "where is"]
    complex_ = ["explain", "compare", "analyze", "how does", "why", "describe",
                "summarize all", "in detail"]

    if n_words <= 6 and any(p in q for p in simple):
        return "brief"
    if any(p in q for p in complex_) or n_words > 15:
        return "detailed"
    return "moderate"


def ask_ollama(prompt: str, complexity: str = "moderate", detail_level: str = "standard") -> str:
    limits = {
        "brief":    200,
        "moderate": 350,
        "detailed": 700
    }
    timeouts = {
        "quick":    360,
        "standard": 480,
        "deep":     660
    }
    timeout = timeouts.get(detail_level, 360)

    # ✅ Quick mode forces small token count = fast response
    if detail_level == "quick":
        num_predict = 150
    else:
        num_predict = limits.get(complexity, 250)

    payload = {
        "model":   OLLAMA_MODEL,
        "prompt":  prompt,
        "stream":  False,
        "options": {
            "num_predict": num_predict,
            "temperature": 0.7,
            "top_p":       0.9,
            "num_thread":  max(4, os.cpu_count() - 2),
        },
    }

    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail=f"Ollama timed out after {timeout}s. Try a simpler question."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI model error: {str(e)}")


def stream_ollama(prompt: str, complexity: str = "moderate", detail_level: str = "standard"):
    """TRUE token streaming from Ollama."""
    limits = {
        "brief":    200,
        "moderate": 350,
        "detailed": 700,
    }

    # ✅ Quick mode forces small token count = fast response
    if detail_level == "quick":
        num_predict = 150
    else:
        num_predict = limits.get(complexity, 250)

    payload = {
        "model":   OLLAMA_MODEL,
        "prompt":  prompt,
        "stream":  True,
        "options": {
            "num_predict": num_predict,
            "temperature": 0.7,
            "top_p":       0.9,
            "num_thread":  max(4, os.cpu_count() - 2),
        },
    }

    try:
        with requests.post(OLLAMA_URL, json=payload, stream=True, timeout=720) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line:
                    continue
                data  = json.loads(line.decode("utf-8"))
                token = data.get("response", "")
                if token:
                    yield token
                if data.get("done", False):
                    break
    except Exception as e:
        yield f"\n[Streaming error: {str(e)}]"

# ─────────────────────────────────────────────────────────────────────────────
# 6. PROMPT BUILDERS
# ─────────────────────────────────────────────────────────────────────────────
def build_prompt_quick(question: str, context_text: str) -> str:
    """Short fast prompt for Quick mode."""
    return f"""You are a document Q&A assistant. Use ONLY the context below. Never use outside knowledge.

Rules:
- If topic is NOT in context at all → say: "This topic is not covered in the uploaded document."
- If topic is mentioned but has no detail → say only what context says, then add: "The document does not provide further detail on this."
- If topic is well covered → answer in max 4 sentences using only the context.

Context: {context_text}

Question: {question}

Answer:"""


def build_prompt(question: str, context_text: str, is_list_question: bool) -> str:
    """Full strict prompt for Standard and Deep modes."""
    if is_list_question:
        format_instruction = """FORMATTING RULES FOR LIST ANSWERS:
1. List EVERY item found in the document
2. Check if the question asks for explanation/description/details:
   - If NO explanation asked → just item names, one per line:
     1. Item name
     2. Item name
   - If explanation IS asked → item name with brief explanation:
     1. Item name — one sentence explanation
     2. Item name — one sentence explanation
3. One item per line, NO blank lines between items
4. Do NOT add explanations unless the user specifically asked for them
5. Do NOT stop until ALL items from the document are listed"""
    else:
        format_instruction = "- Match answer length to question complexity. Be concise but complete."

    return f"""You are a strict document-based Q&A assistant for TellMe.ai.

STRICT RULES — READ CAREFULLY AND FOLLOW EXACTLY:

RULE 1 — TOPIC NOT IN DOCUMENT AT ALL:
If the question topic does not appear anywhere in the context below, respond ONLY with this exact message:
"The topic you asked about is not covered in the uploaded document. I can only answer based on the document's content. Please ask questions related to the document."
Do NOT provide any general knowledge. Do NOT explain the topic. Stop immediately.

RULE 2 — TOPIC MENTIONED BUT DETAILS ARE LIMITED:
If the topic appears in the context but with insufficient detail, state only what the document says, then add:
"Note: The document mentions this topic briefly but does not provide further detail."
Do NOT supplement with outside knowledge.

RULE 3 — TOPIC WELL COVERED IN DOCUMENT:
If sufficient context exists, answer thoroughly and directly using ONLY the document content.
Cite specific details from the document wherever possible.

RULE 4 — NEVER INVENT:
Never fabricate facts, statistics, or explanations not present in the context.
Never use your training knowledge to fill gaps.

---
Context from uploaded document:
{context_text}

---
Question: {question}

{format_instruction}

Answer:"""

# ─────────────────────────────────────────────────────────────────────────────
# 7. SESSION CLASS
# ─────────────────────────────────────────────────────────────────────────────
class Session:
    def __init__(self, session_id: str, created_at: str = None, title: str = "New Chat"):
        self.id          = session_id
        self.created_at  = created_at or datetime.now().isoformat()
        self.title       = title
        self.folder      = DATA_DIR / session_id
        self.folder.mkdir(exist_ok=True)
        self.docs:       List[dict] = []
        self.chunks:     List[str]  = []
        self.chunk_meta: List[dict] = []
        self.embeddings  = None
        self.index       = None
        self.history:    List[dict] = []

    def save_meta(self):
        meta = {
            "session_id": self.id,
            "created_at": self.created_at,
            "title":      self.title,
            "docs": [
                {
                    "filename": d["filename"],
                    "pages":    int(d["pages"]),
                    "size":     int(d.get("size", 0)),
                    "words":    int(d.get("words", 0)),
                    "chunks":   len(d["chunks"]),
                }
                for d in self.docs
            ],
            "history": self.history,
        }
        with open(self.folder / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

    @classmethod
    def load_from_disk(cls, session_id: str) -> "Session":
        folder    = DATA_DIR / session_id
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            return cls(session_id)

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        sess = cls(
            session_id = meta.get("session_id", session_id),
            created_at = meta.get("created_at"),
            title      = meta.get("title", "Chat"),
        )
        sess.history = meta.get("history", [])

        for doc_meta in meta.get("docs", []):
            pdf_path = folder / doc_meta["filename"]
            if pdf_path.exists():
                pages      = extract_text_from_pdf(pdf_path)
                all_text   = " ".join(p["text"] for p in pages)
                doc_chunks = chunk_text(all_text)
                sess.docs.append({
                    "filename": doc_meta["filename"],
                    "path":     str(pdf_path),
                    "pages":    len(pages),
                    "chunks":   doc_chunks,
                    "size":     doc_meta.get("size", 0),
                    "words":    len(all_text.split()),
                })
                sess.chunks.extend(doc_chunks)
                for i in range(len(doc_chunks)):
                    sess.chunk_meta.append({"filename": doc_meta["filename"], "page": i + 1})

        if sess.chunks and sess.index is None:
            build_index(sess)
        return sess

# ─────────────────────────────────────────────────────────────────────────────
# 8. SESSION STORE
# ─────────────────────────────────────────────────────────────────────────────
sessions: dict = {}

def _load_all_sessions():
    for folder in sorted(DATA_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if folder.is_dir() and (folder / "meta.json").exists():
            try:
                sess = Session.load_from_disk(folder.name)
                sessions[sess.id] = sess
                logging.info(f"Restored session '{sess.title}' ({sess.id[:8]}…)")
            except Exception as e:
                logging.warning(f"Could not restore session {folder.name}: {e}")

_load_all_sessions()

def get_session(sid: str) -> Session:
    if sid not in sessions:
        sessions[sid] = Session(sid)
    return sessions[sid]

# ─────────────────────────────────────────────────────────────────────────────
# 9. FASTAPI APP
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="TellMe.ai Backend", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# 10. OLLAMA KEEP-ALIVE THREAD
# ─────────────────────────────────────────────────────────────────────────────
def _keep_warm():
    while True:
        time.sleep(45)
        try:
            requests.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "prompt": ".", "stream": False},
                timeout=5
            )
        except:
            pass

threading.Thread(target=_keep_warm, daemon=True).start()

# ─────────────────────────────────────────────────────────────────────────────
# 11. PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question:     str
    detail_level: Optional[str] = "standard"

class TTSRequest(BaseModel):
    text: str

# ─────────────────────────────────────────────────────────────────────────────
# 12. ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "TellMe.ai Backend v2.0 - Production Ready", "model": OLLAMA_MODEL}

# ── Sessions ──────────────────────────────────────────────────────────────────

@app.get("/sessions")
def list_sessions():
    result = []
    for s in sessions.values():
        result.append({
            "session_id":     s.id,
            "created_at":     s.created_at,
            "title":          s.title,
            "message_count":  len([h for h in s.history if h.get("role") == "user"]),
            "document_count": len(s.docs),
        })
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return {"sessions": result}


@app.post("/sessions")
def create_session():
    sid  = str(uuid.uuid4())
    sess = Session(sid)
    sessions[sid] = sess
    sess.save_meta()
    return {
        "session_id":     sid,
        "created_at":     sess.created_at,
        "title":          sess.title,
        "message_count":  0,
        "document_count": 0,
    }


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sessions.pop(session_id)
    try:
        shutil.rmtree(sess.folder)
    except Exception as e:
        logging.warning(f"Could not delete folder {sess.folder}: {e}")
    return {"deleted": session_id}

# ── Documents ─────────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/upload")
async def upload_document(session_id: str, file: UploadFile = File(...)):
    session  = get_session(session_id)
    pdf_path = session.folder / file.filename
    content  = await file.read()

    with open(pdf_path, "wb") as f:
        f.write(content)

    file_size  = len(content)
    pages      = extract_text_from_pdf(pdf_path)
    all_text   = " ".join(p["text"] for p in pages)
    doc_chunks = chunk_text(all_text)
    word_count = len(all_text.split())

    session.docs.append({
        "filename": file.filename,
        "path":     str(pdf_path),
        "pages":    len(pages),
        "chunks":   doc_chunks,
        "size":     file_size,
        "words":    word_count,
    })
    session.chunks.extend(doc_chunks)
    for i in range(len(doc_chunks)):
        session.chunk_meta.append({"filename": file.filename, "page": i + 1})

    build_index(session, new_chunks=doc_chunks)
    session.save_meta()
    logging.info(f"[{session_id[:8]}] Indexed {len(doc_chunks)} chunks from '{file.filename}'")

    return {
        "filename": file.filename,
        "pages":    len(pages),
        "chunks":   len(doc_chunks),
        "size":     file_size,
        "words":    word_count,
    }


@app.get("/sessions/{session_id}/documents")
def list_documents(session_id: str):
    session = get_session(session_id)
    return {
        "documents": [
            {
                "filename": d["filename"],
                "pages":    d["pages"],
                "chunks":   len(d["chunks"]),
                "size":     d.get("size", 0),
                "words":    d.get("words", 0),
            }
            for d in session.docs
        ]
    }


@app.get("/sessions/{session_id}/pdf/{filename}")
async def serve_pdf(session_id: str, filename: str):
    session  = get_session(session_id)
    pdf_path = session.folder / filename
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(str(pdf_path), media_type="application/pdf")

# ── History ───────────────────────────────────────────────────────────────────

@app.get("/sessions/{session_id}/history")
def get_history(session_id: str):
    session   = get_session(session_id)
    formatted = []
    for entry in session.history:
        if entry.get("role") == "user":
            formatted.append({
                "role":      "user",
                "content":   entry.get("content", entry.get("question", "")),
                "timestamp": entry.get("timestamp", ""),
                "sources":   [],
            })
        elif entry.get("role") == "assistant":
            labels = []
            for s in entry.get("sources", []):
                if isinstance(s, dict):
                    lbl = s.get("filename", "")
                    if s.get("page"):
                        lbl += f" p.{s['page']}"
                    if lbl and lbl not in labels:
                        labels.append(lbl)
            formatted.append({
                "role":        "assistant",
                "content":     entry.get("content", entry.get("answer", "")),
                "sources":     labels,
                "chunks_used": entry.get("chunks_used"),
                "timestamp":   entry.get("timestamp", ""),
            })
    return {"history": formatted}

# ── Query ─────────────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/query")
def query_documents(session_id: str, req: QueryRequest):
    session      = get_session(session_id)
    request_time = datetime.now().isoformat()

    if not session.docs:
        return {"answer": "Please upload documents first.", "sources": []}

    detail_level = req.detail_level or "standard"
    top_k = {
        "quick":    min(3, len(session.chunks)),
        "standard": min(8, len(session.chunks)),
        "deep":     min(20, len(session.chunks)),
    }.get(detail_level, 5)

    context_chunks = retrieve_context(session, req.question, top_k=top_k)
    raw_context    = "\n\n".join(c["text"] for c in context_chunks)

    if detail_level == "deep":
        context_text = optimize_context_text(raw_context, max_chars=9000)
    else:
        context_text = optimize_context_text(raw_context)

    complexity = estimate_question_complexity(req.question)

    if detail_level == "quick":
        prompt = build_prompt_quick(req.question, context_text)
    else:
        is_list_question = any(word in req.question.lower() for word in [
            "list", "enumerate", "name all", "show all", "what are the",
            "methods", "applications", "give all", "all the"
        ])
        prompt = build_prompt(req.question, context_text, is_list_question)

    try:
        answer = ask_ollama(prompt, complexity, detail_level=detail_level)
        logging.info(f"[{session_id[:8]}] Answered in '{complexity}' mode ({len(answer)} chars)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not answer.strip():
        answer = "The topic you asked about is not covered in the uploaded document. I can only answer based on the document's content."

    source_labels = []
    for c in context_chunks:
        lbl = f"{c['filename']} p.{c['page']}" if c.get("page") else c["filename"]
        if lbl not in source_labels:
            source_labels.append(lbl)

    if session.title == "New Chat" and req.question:
        session.title = req.question[:50] + ("…" if len(req.question) > 50 else "")

    session.history.append({"role": "user", "content": req.question, "timestamp": request_time})
    session.history.append({
        "role":        "assistant",
        "content":     answer,
        "sources":     [{"filename": c["filename"], "page": int(c["page"])} for c in context_chunks],
        "chunks_used": len(context_chunks),
        "timestamp":   datetime.now().isoformat(),
    })
    session.save_meta()

    return {
        "answer":       answer,
        "sources":      source_labels,
        "detail_level": req.detail_level,
        "chunks_used":  len(context_chunks),
        "complexity":   complexity,
    }


@app.post("/sessions/{session_id}/query_stream")
def query_documents_stream(session_id: str, req: QueryRequest):
    session      = get_session(session_id)
    request_time = datetime.now().isoformat()

    if not session.docs:
        def empty():
            yield "Please upload documents first."
        return StreamingResponse(empty(), media_type="text/plain")

    detail_level = req.detail_level or "standard"
    top_k = {
        "quick":    min(3, len(session.chunks)),
        "standard": min(8, len(session.chunks)),
        "deep":     min(20, len(session.chunks)),
    }.get(detail_level, 5)

    context_chunks = retrieve_context(session, req.question, top_k=top_k)
    raw_context    = "\n\n".join(c["text"] for c in context_chunks)

    if detail_level == "deep":
        context_text = optimize_context_text(raw_context, max_chars=9000)
    else:
        context_text = optimize_context_text(raw_context)

    complexity = estimate_question_complexity(req.question)

    if detail_level == "quick":
        prompt = build_prompt_quick(req.question, context_text)
    else:
        is_list_question = any(word in req.question.lower() for word in [
            "list", "enumerate", "name all", "show all", "what are the",
            "methods", "applications", "give all", "all the"
        ])
        prompt = build_prompt(req.question, context_text, is_list_question)

    def stream():
        full_answer = ""

        for token in stream_ollama(prompt, complexity, detail_level):
            full_answer += token
            # ✅ KEY FIX: Encode \n as \\n so SSE protocol does not break
            # SSE uses \n\n as event separator — raw newlines in data break parsing
            safe_token = token.replace("\n", "\\n")
            yield f"event: token\ndata: {safe_token}\n\n"

        # ✅ Empty response fallback
        if not full_answer.strip():
            fallback = "The topic you asked about is not covered in the uploaded document. I can only answer based on the document's content."
            yield f"event: token\ndata: {fallback}\n\n"
            full_answer = fallback

        sources_payload = json.dumps([
            {"filename": c["filename"], "page": c["page"]}
            for c in context_chunks
        ])
        yield f"event: sources\ndata: {sources_payload}\n\n"
        yield "event: done\ndata: ok\n\n"

        # Save cleaned version to history
        cleaned_answer = clean_streaming_tokens(full_answer)
        session.history.append({"role": "user", "content": req.question, "timestamp": request_time})
        session.history.append({
            "role":      "assistant",
            "content":   cleaned_answer,
            "sources":   [{"filename": c["filename"], "page": c["page"]} for c in context_chunks],
            "timestamp": datetime.now().isoformat()
        })
        session.save_meta()

    return StreamingResponse(stream(), media_type="text/event-stream")

# ── Summary ───────────────────────────────────────────────────────────────────

@app.get("/sessions/{session_id}/summary")
def get_document_summary(session_id: str, detail_level: str = "standard"):
    session = get_session(session_id)
    if not session.docs:
        raise HTTPException(status_code=404, detail="No documents uploaded yet")

    top_k = {
        "quick":    min(3, len(session.chunks)),
        "standard": min(8, len(session.chunks)),
        "deep":     min(20, len(session.chunks)),
    }.get(detail_level, 5)

    query          = "overview main topics key points conclusions findings"
    context_chunks = retrieve_context(session, query, top_k=top_k)
    raw_context    = "\n\n".join(c["text"] for c in context_chunks)

    if detail_level == "deep":
        context_text = optimize_context_text(raw_context, max_chars=9000)
    else:
        context_text = optimize_context_text(raw_context)

    source_labels = []
    for c in context_chunks:
        lbl = f"{c['filename']} p.{c['page']}" if c.get("page") else c["filename"]
        if lbl not in source_labels:
            source_labels.append(lbl)

    if detail_level == "deep":
        prompt = f"""You are a document summarizer. Summarize ONLY what is in the document below.
Do not add any outside knowledge.

Document content:
{context_text}

Provide a comprehensive summary covering all major topics, key findings, and important details:"""
    else:
        prompt = f"""You are a document summarizer. Summarize ONLY what is in the document below.
Do not add any outside knowledge.

Document content:
{context_text}

Summary of main points:"""

    request_time = datetime.now().isoformat()
    try:
        summary = ask_ollama(prompt, complexity="detailed", detail_level=detail_level)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not summary.strip():
        summary = "Could not generate a summary. Please try again."

    session.history.append({"role": "user", "content": "📋 Summarize this document", "timestamp": request_time})
    session.history.append({
        "role":        "assistant",
        "content":     summary,
        "sources":     [{"filename": c["filename"], "page": int(c["page"])} for c in context_chunks],
        "chunks_used": len(context_chunks),
        "timestamp":   datetime.now().isoformat(),
    })
    session.save_meta()

    return {
        "summary":        summary,
        "sources":        source_labels,
        "chunks_used":    len(context_chunks),
        "document_count": len(session.docs),
        "total_pages":    sum(d["pages"] for d in session.docs),
    }

# ── TTS ───────────────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/tts")
def text_to_speech(session_id: str, req: TTSRequest):
    try:
        engine     = pyttsx3.init()
        audio_path = DATA_DIR / session_id / f"tts_{int(time.time())}.wav"
        engine.save_to_file(req.text, str(audio_path))
        engine.runAndWait()
        with open(audio_path, "rb") as f:
            audio_data = f.read()
        return Response(content=audio_data, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

# ─────────────────────────────────────────────────────────────────────────────
# 13. STARTUP
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("  TellMe.ai Backend v2.0 — Production Ready")
    print("  http://localhost:8000")
    print("  ✅ Strict document-only answers (no hallucination)")
    print("  ✅ Quick mode = fast short prompt + 150 tokens")
    print("  ✅ Newlines encoded properly in SSE stream")
    print("  ✅ Empty response fallback added")
    print("  ✅ Offline model support (./models/all-MiniLM-L6-v2)")
    print("  Pre-warming model... ", end="", flush=True)
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": "Hi", "stream": False},
            timeout=30,
        )
        print("✓ Ready!" if resp.status_code == 200 else "⚠ Check Ollama")
    except:
        print("⚠  Run:  ollama run phi3:mini")
    print("=" * 60 + "\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        timeout_keep_alive=720,
        timeout_graceful_shutdown=60
    )