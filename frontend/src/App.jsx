import { useState, useRef, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'

const API = 'http://localhost:8000'

const SUGGESTIONS = [
  'Summarize the key points of the document',
  'What are the main topics covered?',
  'What conclusions does the document reach?',
  'List any data or statistics mentioned',
]

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const timestamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null
  return (
    <div>
      <button className="sources-toggle" onClick={() => setOpen(o => !o)}>
        📎 {sources.length} source{sources.length > 1 ? 's' : ''} retrieved
        <span style={{ marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="sources-panel">
          {sources.map((src, i) => (
            <div className="source-chip" key={i}>
              <div className="source-chip-label">📄 {src.source}</div>
              <div className="source-chip-text">{src.snippet}…</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  return (
    <div className={`message ${msg.role}`}>
      <div className="message-avatar">
        {msg.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-body">
        <div className="message-bubble">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
        <div className="message-meta">
          <span>{msg.time}</span>
          {msg.responseTime && (
            <span style={{ color: '#00d4b8' }}>⚡ {msg.responseTime}s</span>
          )}
        </div>
        {msg.role === 'assistant' && <SourcesPanel sources={msg.sources} />}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="message assistant">
      <div className="message-avatar">🤖</div>
      <div className="typing-indicator">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  )
}

export default function App() {
  const [pendingFiles, setPendingFiles] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [docsInfo, setDocsInfo] = useState([])
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [uploading, setUploading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({ questions: 0, pages: 0 })
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const onDrop = useCallback((accepted) => {
    setPendingFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !names.has(f.name))]
    })
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'] },
    maxSize: 20 * 1024 * 1024,
  })

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return
    setUploading(true)
    setError(null)
    const formData = new FormData()
    pendingFiles.forEach(f => formData.append('files', f))
    try {
      const { data } = await axios.post(`${API}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSessionId(data.session_id)
      setDocsInfo(data.documents)
      setPendingFiles([])
      setStats(s => ({ ...s, pages: data.total_pages }))
      setMessages([{
        role: 'assistant',
        content: `✅ **Knowledge base ready!** I've indexed **${data.total_pages} pages** from **${data.documents.length} document(s)**.\n\nAsk me anything about your documents!`,
        time: timestamp(),
        sources: [],
      }])
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Check the backend server.')
    } finally {
      setUploading(false)
    }
  }

  const handleAsk = async (q) => {
    const text = (q || question).trim()
    if (!text || !sessionId || thinking) return
    const userMsg = { role: 'user', content: text, time: timestamp() }
    setMessages(prev => [...prev, userMsg])
    setQuestion('')
    setThinking(true)
    setError(null)
    try {
      const { data } = await axios.post(`${API}/ask`, {
        session_id: sessionId,
        question: text,
        chat_history: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
      })
      const aiMsg = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        responseTime: data.response_time,
        time: timestamp(),
      }
      setMessages(prev => [...prev, aiMsg])
      setStats(s => ({ ...s, questions: s.questions + 1 }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not get an answer. Try again.')
    } finally {
      setThinking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  const isReady = !!sessionId

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🧠</div>
          <div className="logo-text">Doc<span>Mind</span></div>
        </div>

        <div>
          <div className="sidebar-section-title">📂 Knowledge Base</div>
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps()} />
            <div className="dropzone-icon">{isDragActive ? '📥' : '📤'}</div>
            <div className="dropzone-label">
              {isDragActive
                ? <strong>Drop files here</strong>
                : <><strong>Drag & drop</strong> PDF or TXT files<br />or click to browse</>}
            </div>
          </div>

          {pendingFiles.length > 0 && (
            <div className="file-list" style={{ marginTop: 12 }}>
              {pendingFiles.map((f, i) => (
                <div className="file-item" key={i}>
                  <span className="file-item-icon">{f.name.endsWith('.pdf') ? '📄' : '📝'}</span>
                  <span className="file-item-name">{f.name}</span>
                  <span className="file-item-size">{formatSize(f.size)}</span>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="upload-spinner" style={{ marginTop: 12 }}>
              <div className="spinner" />
              Indexing documents…
            </div>
          )}

          {error && (
            <div className="alert-error" style={{ marginTop: 12 }}>⚠️ {error}</div>
          )}

          {pendingFiles.length > 0 && !uploading && (
            <button className="btn-upload" style={{ marginTop: 12 }} onClick={handleUpload}>
              ⚡ Index {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {docsInfo.length > 0 && (
          <div>
            <div className="sidebar-section-title">✅ Indexed Documents</div>
            <div className="file-list">
              {docsInfo.map((d, i) => (
                <div className="file-item" key={i}>
                  <span className="file-item-icon">📄</span>
                  <span className="file-item-name">{d.filename}</span>
                  <span className="file-item-pages">{d.pages}p</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isReady && (
          <div>
            <div className="sidebar-section-title">📊 Session Stats</div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.pages}</div>
                <div className="stat-label">Pages</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.questions}</div>
                <div className="stat-label">Questions</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="main">
        <div className="chat-header">
          <div>
            <div className="chat-header-title">RAG Q&A Chatbot</div>
            <div className="chat-header-sub">Powered by Gemini · FAISS · LangChain</div>
          </div>
          <div className={`status-badge ${isReady ? 'ready' : 'idle'}`}>
            <div className="status-dot" />
            {isReady ? 'Ready' : 'Awaiting Documents'}
          </div>
        </div>

        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-glyph">🧠</div>
              <h1 className="welcome-title">Ask Anything About Your Docs</h1>
              <p className="welcome-sub">
                Upload PDFs or text files on the left. DocMind will index them
                and answer your questions with precise, source-cited responses.
              </p>
              <div className="feature-chips">
                {[
                  ['📄', 'PDF & TXT Support'],
                  ['🔍', 'Semantic Search'],
                  ['💬', 'Multi-turn Memory'],
                  ['📎', 'Source Citations'],
                  ['⚡', 'Fast Retrieval'],
                  ['🔒', 'Free with Gemini'],
                ].map(([icon, label]) => (
                  <div className="feature-chip" key={label}>{icon} {label}</div>
                ))}
              </div>
              {isReady && (
                <div className="suggested-questions">
                  <div className="sidebar-section-title" style={{ marginBottom: 4 }}>Try asking:</div>
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="suggestion-btn" onClick={() => handleAsk(s)}>
                      {s}
                      <span className="suggestion-arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {thinking && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="input-bar">
          <div className="input-row">
            <textarea
              className="chat-input"
              rows={1}
              placeholder={isReady
                ? 'Ask a question about your documents… (Enter to send)'
                : 'Upload documents first to start asking questions…'}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isReady || thinking}
            />
            <button
              className="btn-send"
              onClick={() => handleAsk()}
              disabled={!isReady || !question.trim() || thinking}
            >
              ➤
            </button>
          </div>
          <div className="input-hint">
            Shift+Enter for new line · Enter to send · Answers grounded in your documents
          </div>
        </div>
      </main>
    </div>
  )
}
