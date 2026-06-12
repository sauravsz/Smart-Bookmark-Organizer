'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useBookmarkStore from '../lib/store'
import Toast from './Toast'

export default function AddBookmarkModal({ isOpen, onClose }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'checking' | 'fetching' | 'analyzing' | 'done'
  const [toast, setToast] = useState(null)
  const [duplicate, setDuplicate] = useState(null) // existing bookmark if URL is a dupe

  const { addBookmark, apiKeys, bookmarks, updateBookmark } = useBookmarkStore()

  const showToast = (message, type = 'success') =>
    setToast({ message, type, key: Date.now() })

  const handleClose = () => {
    setUrl('')
    setStatus('idle')
    setDuplicate(null)
    
    // Clear URL query param if it exists
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.has('add')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
    
    onClose()
  }

  // Pre-fill URL from query parameter (Bookmarklet/Extension)
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const addUrl = params.get('add')
      if (addUrl) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUrl(addUrl)
      }
    }
  }, [isOpen])

  const normalizeUrl = (raw) => {
    let u = raw.trim()
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    const parsed = new URL(u)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
    return u
  }

  // Check for duplicate on URL blur
  const handleUrlBlur = () => {
    if (!url.trim()) return
    try {
      const clean = normalizeUrl(url)
      new URL(clean)
      const existing = bookmarks.find(
        (b) => b.url.toLowerCase().trim() === clean.toLowerCase()
      )
      setDuplicate(existing || null)
    } catch {
      setDuplicate(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    let cleanUrl
    try {
      cleanUrl = normalizeUrl(url)
      new URL(cleanUrl)
    } catch {
      showToast('Please enter a valid URL.', 'error')
      return
    }

    // Block if duplicate and user hasn't confirmed
    if (duplicate && status !== 'merge') {
      return
    }

    setStatus('fetching')
    setDuplicate(null)

    // Step 1: Fetch metadata (Tavily if key available, else cheerio)
    let metadata = {
      title: new URL(cleanUrl).hostname,
      description: '',
      favicon: '',
      domain: new URL(cleanUrl).hostname,
      ogImage: null,
      pageContent: '',
    }

    try {
      const params = new URLSearchParams({ url: cleanUrl })
      if (apiKeys.tavily) params.set('tavilyKey', apiKeys.tavily)
      const metaRes = await fetch(`/api/fetch-metadata?${params}`)
      if (metaRes.ok) metadata = { ...metadata, ...(await metaRes.json()) }
    } catch {
      // continue with fallback metadata
    }

    // Determine AI provider
    const activeKey = apiKeys.openai || apiKeys.groq
    const activeProvider = apiKeys.openai ? 'openai' : 'groq'
    let aiResult = {
      summary: metadata.description || 'No summary available.',
      tags: [],
      category: 'Other',
    }

    // Step 2: AI Analysis
    if (activeKey) {
      setStatus('analyzing')
      try {
        const aiRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: cleanUrl,
            title: metadata.title,
            description: metadata.description,
            pageContent: metadata.pageContent,
            apiKey: activeKey,
            provider: activeProvider,
          }),
        })
        const aiData = await aiRes.json()
        if (aiRes.ok) {
          aiResult = aiData
        } else {
          if (aiRes.status === 429 && aiData.retryAfter) {
            showToast(`Rate limit reached. Please wait ${aiData.retryAfter} seconds.`, 'error')
          } else {
            showToast(`AI: ${aiData.error}`, 'error')
          }
        }
      } catch (err) {
        showToast(err.message || 'AI analysis failed. Bookmark saved without summary.', 'error')
      }
    }

    // Step 3: Save or Merge
    if (status === 'merge' && duplicate) {
      updateBookmark(duplicate.id, {
        description: aiResult.summary || duplicate.description,
        tags: Array.from(new Set([...(duplicate.tags || []), ...(aiResult.tags || [])])),
        category: aiResult.category && aiResult.category !== 'Other' ? aiResult.category : duplicate.category,
      })
      showToast('Bookmark updated and merged!', 'success')
    } else {
      addBookmark({
        id: Date.now().toString(),
        url: cleanUrl,
        title: aiResult.title || metadata.title,
        description: aiResult.summary || metadata.description,
        favicon: metadata.favicon,
        ogImage: metadata.ogImage,
        domain: metadata.domain,
        tags: aiResult.tags || [],
        category: aiResult.category || 'Other',
        isFavorite: false,
        isReadLater: false,
        isBroken: false,
        dateAdded: new Date().toISOString(),
        source: metadata.source || 'manual',
      })
      showToast('Bookmark saved!', 'success')
    }

    setStatus('done')
    setTimeout(handleClose, 800)
  }

  const isLoading = ['fetching', 'analyzing'].includes(status)
  const statusText = {
    fetching:  apiKeys.tavily ? '🔍 Extracting page with Tavily…' : '🌐 Fetching page info…',
    analyzing: '✦ Analyzing with AI…',
  }[status] || ''

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          id="add-bookmark-overlay"
          onClick={handleClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '460px', padding: '2rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add Bookmark</h2>
              <button onClick={handleClose} style={{ color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="bookmark-url" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  URL
                </label>
                <input
                  id="bookmark-url"
                  type="text"
                  className="glass-input"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setDuplicate(null) }}
                  onBlur={handleUrlBlur}
                  autoFocus
                  disabled={isLoading}
                />
              </div>

              {/* Duplicate warning */}
              {duplicate && (
                <div style={{
                  padding: '0.875rem 1rem',
                  background: 'rgba(251,191,36,0.07)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: '10px',
                  fontSize: '0.825rem',
                }}>
                  <p style={{ color: '#fbbf24', fontWeight: 600, marginBottom: '0.35rem' }}>
                    ⚠ Already saved
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    You already have <strong>&quot;{duplicate.title}&quot;</strong> in your collection.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <a
                      href={duplicate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1, textAlign: 'center', padding: '0.45rem',
                        background: 'rgba(251,191,36,0.1)',
                        border: '1px solid rgba(251,191,36,0.2)',
                        borderRadius: '8px', fontSize: '0.78rem', color: '#fbbf24',
                      }}
                    >
                      Open existing →
                    </a>
                    <button
                      type="submit"
                      onClick={() => setStatus('merge')}
                      style={{
                        flex: 1, padding: '0.45rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Merge & Update AI Info
                    </button>
                  </div>
                </div>
              )}

              {/* Status indicator */}
              {isLoading && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(99,102,241,0.07)',
                  border: '1px solid rgba(99,102,241,0.18)',
                  borderRadius: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)',
                }}>
                  <span style={{
                    display: 'inline-block', width: '14px', height: '14px',
                    border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  {statusText}
                </div>
              )}

              {/* No API key notice */}
              {!apiKeys.openai && !apiKeys.groq && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'var(--bg-glass)', borderRadius: '6px' }}>
                  💡 No AI key set — bookmark saved without smart summary. Add one in Settings.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button type="button" id="add-bookmark-cancel" className="btn-secondary" onClick={handleClose} disabled={isLoading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  id="add-bookmark-submit"
                  className="btn-primary"
                  disabled={isLoading || !url.trim() || (duplicate && status !== 'merge')}
                >
                  {isLoading ? 'Saving…' : 'Save Bookmark'}
                </button>
              </div>
            </form>
          </motion.div>
          {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
