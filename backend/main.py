"""
RAG Q&A Chatbot - Backend
FastAPI + LangChain + Gemini + FAISS
"""

import os
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_community.document_loaders import PyMuPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

import tempfile
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="RAG Q&A Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store sessions in memory
sessions = {}


class QuestionRequest(BaseModel):
    session_id: str
    question: str
    chat_history: list


class AnswerResponse(BaseModel):
    answer: str
    sources: list
    session_id: str
    response_time: float


def build_rag_components(documents):
    """
    Builds retriever and LLM separately.
    Works with latest LangChain versions.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")

    # Split documents into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
    )
    chunks = splitter.split_documents(documents)
    logger.info(f"Created {len(chunks)} chunks")

    # Embed and store in FAISS
    embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=api_key,
    )
    vectorstore = FAISS.from_documents(chunks, embeddings)
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 5},
    )

    # Gemini Flash LLM
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.2,
        google_api_key=api_key,
    )

    return retriever, llm


@app.post("/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    """
    Upload PDF or TXT files and build the knowledge base.
    Returns a session_id for subsequent questions.
    """
    all_documents = []
    docs_info = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        for file in files:
            suffix = Path(file.filename).suffix.lower()
            if suffix not in {".pdf", ".txt"}:
                raise HTTPException(status_code=400, detail="Only PDF and TXT supported.")

            tmp_path = os.path.join(tmp_dir, file.filename)
            content = await file.read()
            with open(tmp_path, "wb") as f:
                f.write(content)

            if suffix == ".pdf":
                loader = PyMuPDFLoader(tmp_path)
            else:
                loader = TextLoader(tmp_path, encoding="utf-8")

            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = file.filename

            all_documents.extend(docs)
            docs_info.append({
                "filename": file.filename,
                "size_kb": round(len(content) / 1024, 1),
                "pages": len(docs),
            })

        try:
            retriever, llm = build_rag_components(all_documents)
        except ValueError as e:
            raise HTTPException(status_code=500, detail=str(e))

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "retriever": retriever,
        "llm": llm,
        "docs_info": docs_info,
        "chat_history": [],
    }

    return {
        "session_id": session_id,
        "documents": docs_info,
        "total_pages": len(all_documents),
    }


@app.post("/ask", response_model=AnswerResponse)
async def ask_question(request: QuestionRequest):
    """
    Ask a question against the uploaded documents.
    Retrieves relevant chunks and returns a grounded answer.
    """
    session = sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Upload documents first.")

    retriever = session["retriever"]
    llm = session["llm"]
    chat_history = session["chat_history"]

    # Retrieve relevant chunks
    docs = retriever.invoke(request.question)
    context = "\n\n".join([doc.page_content for doc in docs])

    # Build prompt with chat history
    history_text = ""
    for msg in chat_history[-6:]:  # Last 3 exchanges
        history_text += f"Human: {msg['human']}\nAssistant: {msg['assistant']}\n\n"

    prompt = f"""You are a helpful assistant that answers questions based strictly on the provided document context.
If the answer is not in the context, say "I couldn't find that information in the uploaded documents."

Previous conversation:
{history_text}

Document context:
{context}

Question: {request.question}

Answer:"""

    start = time.time()
    try:
        response = llm.invoke(prompt)
        answer = response.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    elapsed = round(time.time() - start, 2)

    # Save to chat history
    session["chat_history"].append({
        "human": request.question,
        "assistant": answer,
    })

    # Extract source snippets
    sources = []
    seen = set()
    for doc in docs:
        snippet = doc.page_content[:300].strip()
        src = doc.metadata.get("source", "Unknown")
        key = (src, snippet[:80])
        if key not in seen:
            seen.add(key)
            sources.append({"source": src, "snippet": snippet})

    return AnswerResponse(
        answer=answer,
        sources=sources,
        session_id=request.session_id,
        response_time=elapsed,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "sessions_active": len(sessions)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)