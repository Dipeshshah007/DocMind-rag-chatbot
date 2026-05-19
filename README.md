# DocMind – RAG Powered Intelligent Document Chatbot

DocMind is an AI-powered Retrieval-Augmented Generation (RAG) chatbot designed to interact with documents and provide accurate, context-aware answers. Instead of relying solely on pretrained knowledge, the system retrieves relevant information from uploaded documents and generates precise responses using Large Language Models.

This project demonstrates how modern LLM + vector search architectures can be used to build intelligent knowledge assistants for enterprise documents, research papers, technical manuals, and internal knowledge bases.

# Problem Statement

Organizations and individuals often work with large volumes of documents such as research papers, manuals, reports, and knowledge bases. Extracting specific insights from these documents manually can be time-consuming and inefficient.

Traditional chatbots cannot access private documents or domain-specific knowledge effectively.

# Solution

DocMind implements a Retrieval-Augmented Generation (RAG) architecture that allows users to ask questions about their documents.

The system:

Processes and chunks documents
Converts text into vector embeddings
Stores embeddings in a vector database
Retrieves the most relevant context based on user queries
Uses an LLM to generate accurate answers grounded in the retrieved information

This approach significantly improves accuracy, explainability, and reliability compared to standard LLM chatbots.

# Tech Stack
Backend
Python
LangChain
Vector Embeddings
LLM APIs
FastAPI / Flask (depending on your implementation)

Frontend
JavaScript
HTML
CSS

AI / NLP
Retrieval-Augmented Generation (RAG)
Semantic Search
Vector Databases
Large Language Models

# ▶️ How to Run the Notebook
1.  Clone the repository:
git clone https://github.com/Dipeshshah007/DocMind-rag-chatbot.git
cd DocMind-rag-chatbot

2. Install Dependencies:
pip install -r requirements.txt

3. Configure environment variables:
Create a .env file and add your API keys.
OPENAI_API_KEY=your_api_key

4. Run the backend:
cd backend
python main.py

5. Run the frontend:
cd frontend
npm run dev


