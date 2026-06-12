'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useBookmarkStore from '../lib/store'

const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0
  let dotProduct = 0, normA = 0, normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

const SUGGESTIONS = [
  'What technology bookmarks do I have?',
  'Find me bookmarks about AI or machine learning',
  'Which links might be good for learning design?',
  'Summarize my Finance bookmarks',
]

export default function AIChatPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRagLoading, setIsRagLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const workerRef = useRef(null)

  const { bookmarks, apiKeys } = useBookmarkStore()
  const activeKey = apiKeys.openai || apiKeys.groq || process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  const activeProvider = (apiKeys.openai || process.env.NEXT_PUBLIC_OPENAI_API_KEY) ? 'openai' : 'groq'

  const [panelWidth, setPanelWidth] = useState(380)
  const isDragging = useRef(false)

  useEffect(() => {
    workerRef.current = new Worker(new URL('../lib/embeddingWorker.js', import.meta.url), { type: 'module' })
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return
      const newWidth = Math.max(300, Math.min(window.innerWidth - e.clientX, 800))
      setPanelWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = 'default'
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, isRagLoading])

  const sendMessage = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    if (!activeKey) {
      setError('Please add an API key in Settings first.')
      return
    }

    setError(null)
    setInput('')
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)

    try {
      setIsRagLoading(true)
      const queryEmbedding = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Embedding timeout')), 10000)
        const handleMessage = (e) => {
          if (e.data.status === 'complete' && e.data.id === 'chat_query') {
            clearTimeout(timeout)
            workerRef.current.removeEventListener('message', handleMessage)
            resolve(e.data.embedding)
          }
        }
        workerRef.current.addEventListener('message', handleMessage)
        workerRef.current.postMessage({ text: userText, id: 'chat_query' })
      })
      setIsRagLoading(false)

      const scoredBookmarks = bookmarks.map(b => ({
        ...b,
        similarity: b.embedding ? cosineSimilarity(queryEmbedding, b.embedding) : 0
      })).sort((a, b) => b.similarity - a.similarity)
      
      const relevantBookmarks = scoredBookmarks.slice(0, 15)

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          bookmarks: relevantBookmarks,
          apiKey: activeKey,
          provider: activeProvider,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429 && data.retryAfter) {
          throw new Error(`Rate limit reached. Please wait ${data.retryAfter} seconds.`)
        }
        throw new Error(data.error || 'Chat failed')
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setError(err.message)
      setMessages(newMessages)
    } finally {
      setIsRagLoading(false)
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const parseMarkdownLinks = (text) => {
    if (typeof text !== 'string') return text
    const regex = /\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))+)\)/g
    const parts = []
    let lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      parts.push(
        <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline', fontWeight: 500 }}>
          {match[1]}
        </a>
      )
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts.length ? parts : text
  }

  return (
    <>
      <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="chat-overlay"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 30,
            background: 'rgba(0,0,0,0.1)',
            display: 'block',
          }}
        />
      )}
    </AnimatePresence>

      <motion.div 
        initial={false}
        animate={{ x: isOpen ? 0 : "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="chat-panel" 
        style={{ width: panelWidth }}
      >
        <div
          style={{
            position: 'absolute', left: -4, top: 0, bottom: 0, width: 8,
            cursor: 'col-resize', zIndex: 10
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            isDragging.current = true
            document.body.style.cursor = 'col-resize'
          }}
        />
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>✦</span> Flame AI
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Ask anything about your {bookmarks.length} saved bookmarks
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError(null) }}
                title="Clear chat"
                style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-btn-secondary)' }}
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', fontSize: '1.25rem', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
                borderRadius: '50%',
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{
                textAlign: 'center', padding: '1.5rem 1rem',
                background: 'rgba(99,102,241,0.06)',
                borderRadius: '14px',
                border: '1px solid rgba(99,102,241,0.12)',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✦</div>
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Hi! I know all your bookmarks.
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Ask me to find, summarize, or explore your saved links.
                </p>
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Try asking
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    textAlign: 'left', padding: '0.625rem 0.875rem',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    borderRadius: '10px', fontSize: '0.825rem', color: 'var(--text-secondary)',
                    transition: 'all 0.15s ease', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '0.75rem 1rem',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  : 'var(--bg-glass)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-glass)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                boxShadow: msg.role === 'user' ? '0 4px 15px rgba(99,102,241,0.2)' : 'var(--shadow-glass)',
              }}>
                {parseMarkdownLinks(msg.content)}
              </div>
            </div>
          ))}

          {(loading || isRagLoading) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ padding: '0.85rem 1rem', borderRadius: '14px', background: 'var(--bg-glass)', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-glass)' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  {isRagLoading ? 'Searching memory...' : 'Thinking...'}
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <div style={{
              padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
              fontSize: '0.825rem', color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border-glass)',
        }}>
          {!activeKey && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center' }}>
              ⚠️ Add an API key in Settings to enable chat
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              id="chat-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your bookmarks…"
              disabled={loading || !activeKey}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-glass)',
                borderRadius: '10px',
                padding: '0.625rem 0.875rem',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'none',
                maxHeight: '120px',
                overflowY: 'auto',
                transition: 'border-color 0.15s ease',
                fontFamily: 'inherit',
              }}
            />
            <button
              id="chat-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !activeKey}
              style={{
                width: '38px', height: '38px',
                background: 'var(--accent-gradient)',
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                opacity: (!input.trim() || !activeKey || loading) ? 0.4 : 1,
                transition: 'opacity 0.15s ease',
                fontSize: '1rem',
              }}
            >
              ↑
            </button>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </motion.div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  )
}
