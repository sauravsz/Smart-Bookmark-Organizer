'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useBookmarkStore from '../lib/store'
import { exportAsCSV, exportAsHTML, parseCSV, parseHTML } from '../lib/bookmarkImport'
import Toast from './Toast'

const SectionHeading = ({ children }) => (
  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
    {children}
  </h3>
)

const KeyField = ({ id, label, placeholder, value, onChange, active, note }) => (
  <div>
    <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      {active && <span style={{ color: '#34d399', fontSize: '0.72rem' }}>● Active</span>}
    </label>
    <input id={id} type="password" className="glass-input" placeholder={placeholder} value={value} onChange={onChange} />
    {note && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{note}</p>}
  </div>
)

const TABS = [
  { id: 'ai',         label: '✦ AI',          title: 'AI Providers'    },
  { id: 'appearance', label: '🎨 Appearance', title: 'Theme Settings'  },
  { id: 'data',       label: '📂 Data',       title: 'Import / Export' },
  { id: 'links',      label: '🔗 Links',      title: 'Link Checker'    },
  { id: 'sync',       label: '🌐 Ext',        title: 'Browser Sync'    },
  { id: 'cloud',      label: '☁️ Cloud',      title: 'Cloud Sync'      },
]

export default function SettingsModal({ isOpen, onClose }) {
  const { apiKeys, setApiKeys, bookmarks, addBookmarks, updateBookmark, theme, setTheme } = useBookmarkStore()

  const [activeTab, setActiveTab] = useState('ai')
  const [openaiKey, setOpenaiKey]     = useState('')
  const [groqKey, setGroqKey]         = useState('')
  const [tavilyKey, setTavilyKey]     = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [toast, setToast]             = useState(null)

  // Import state
  const [importDragOver, setImportDragOver] = useState(false)
  const [importStatus, setImportStatus]     = useState(null)
  const fileInputRef = useRef(null)

  // Link checker state
  const [linkChecking, setLinkChecking]   = useState(false)
  const [linkResults, setLinkResults]     = useState(null) // { checked, broken }
  const [linkProgress, setLinkProgress]   = useState(0)

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenaiKey(apiKeys?.openai || '')
      setGroqKey(apiKeys?.groq || '')
      setTavilyKey(apiKeys?.tavily || '')
      setSupabaseUrl(useBookmarkStore.getState().supabaseConfig?.url || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
      setSupabaseKey(useBookmarkStore.getState().supabaseConfig?.key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
      setImportStatus(null)
      setLinkResults(null)
      setLinkProgress(0)
      setActiveTab('ai')
    }
  }, [isOpen, apiKeys])

  const showToast = (msg, type = 'success') => setToast({ message: msg, type, key: Date.now() })

  // ─── AI & Cloud Settings ──────────────────────────────────────────────────
  const handleSaveAI = async () => {
    let pwd = window.sessionStorage.getItem('osmo_vault_pwd')
    if (!pwd) {
      pwd = prompt('Enter a Master Password to encrypt your keys:')
      if (!pwd) {
        showToast('Save cancelled. Master Password required.', 'error')
        return
      }
      window.sessionStorage.setItem('osmo_vault_pwd', pwd)
      useBookmarkStore.getState().setVaultUnlocked(true)
    }

    const keysObj = { openai: openaiKey.trim(), groq: groqKey.trim(), tavily: tavilyKey.trim() }
    setApiKeys(keysObj)
    
    // Encrypt
    const { default: CryptoJS } = await import('crypto-js')
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(keysObj), pwd).toString()
    useBookmarkStore.getState().setEncryptedApiKeys(ciphertext)
    
    useBookmarkStore.getState().setSupabaseConfig({ url: supabaseUrl.trim(), key: supabaseKey.trim() })
    showToast('Settings saved securely!', 'success')
    setTimeout(onClose, 900)
  }

  const handleCloudBackup = async () => {
    let config = useBookmarkStore.getState().supabaseConfig
    if (!config?.url || !config?.key) {
      config = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
    }
    if (!config?.url || !config?.key) return showToast('Please enter Supabase credentials first.', 'error')
    showToast('Backing up to Supabase...', 'info')
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(config.url, config.key)
      const currentBookmarks = useBookmarkStore.getState().bookmarks
      
      const { error } = await supabase.from('bookmarks').upsert(currentBookmarks.map(b => ({
        id: b.id,
        url: b.url,
        title: b.title,
        description: b.description,
        category: b.category,
        tags: b.tags,
        domain: b.domain,
        date_added: new Date(b.dateAdded).toISOString(),
        is_favorite: b.isFavorite || false,
        is_read_later: b.isReadLater || false,
        og_image: b.ogImage
      })))
      
      if (error) throw error
      showToast(`Successfully backed up ${currentBookmarks.length} bookmarks!`, 'success')
    } catch (err) {
      showToast(`Backup failed: ${err.message}`, 'error')
    }
  }

  const handleCloudRestore = async () => {
    let config = useBookmarkStore.getState().supabaseConfig
    if (!config?.url || !config?.key) {
      config = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
    }
    if (!config?.url || !config?.key) return showToast('Please enter Supabase credentials first.', 'error')
    showToast('Restoring from Supabase...', 'info')
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(config.url, config.key)
      
      const { data, error } = await supabase.from('bookmarks').select('*')
      if (error) throw error
      
      if (data && data.length > 0) {
        const mapped = data.map(b => ({
          id: b.id,
          url: b.url,
          title: b.title,
          description: b.description,
          category: b.category,
          tags: b.tags,
          domain: b.domain,
          dateAdded: new Date(b.date_added).getTime(),
          isFavorite: b.is_favorite,
          isReadLater: b.is_read_later,
          ogImage: b.og_image
        }))
        // Merge with local avoiding duplicates
        const existingIds = new Set(useBookmarkStore.getState().bookmarks.map(b => b.id))
        const newOnes = mapped.filter(b => !existingIds.has(b.id))
        if (newOnes.length > 0) {
          useBookmarkStore.getState().addBookmarks(newOnes)
        }
        showToast(`Restored ${newOnes.length} new bookmarks from cloud!`, 'success')
      } else {
        showToast('No bookmarks found in cloud.', 'info')
      }
    } catch (err) {
      showToast(`Restore failed: ${err.message}`, 'error')
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────
  const handleExportCSV  = () => { 
    if (!bookmarks.length) { showToast('No bookmarks to export.', 'error'); return } 
    // Bug #2: Strip heavy embeddings before export
    const cleanBookmarks = bookmarks.map(({ embedding, ...rest }) => rest)
    exportAsCSV(cleanBookmarks);  
    showToast(`Exported ${cleanBookmarks.length} bookmarks as CSV`)  
  }
  const handleExportHTML = () => { 
    if (!bookmarks.length) { showToast('No bookmarks to export.', 'error'); return } 
    // Bug #2: Strip heavy embeddings before export
    const cleanBookmarks = bookmarks.map(({ embedding, ...rest }) => rest)
    exportAsHTML(cleanBookmarks); 
    showToast(`Exported ${cleanBookmarks.length} bookmarks as HTML`) 
  }

  // ─── Import ──────────────────────────────────────────────────────────────
  const processFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'html', 'htm'].includes(ext)) { showToast('Please upload a .csv or .html file.', 'error'); return }
    setImportStatus('loading')
    try {
      const text = await file.text()
      const parsed = ext === 'csv' ? parseCSV(text) : parseHTML(text)
      const existingUrls = new Set(bookmarks.map((b) => b.url.toLowerCase().trim()))
      const newOnes = parsed.filter((b) => !existingUrls.has(b.url.toLowerCase().trim()))
      const dupes = parsed.length - newOnes.length
      if (newOnes.length > 0) {
        addBookmarks(newOnes)
      }
      setImportStatus({ count: newOnes.length, dupes })
      showToast(`Imported ${newOnes.length} bookmark${newOnes.length !== 1 ? 's' : ''}${dupes ? ` (${dupes} duplicate${dupes !== 1 ? 's' : ''} skipped)` : ''}!`)
    } catch (err) {
      setImportStatus(null)
      showToast(err.message || 'Import failed.', 'error')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = (e) => processFile(e.target.files?.[0])
  const handleDrop = (e) => { e.preventDefault(); setImportDragOver(false); processFile(e.dataTransfer.files?.[0]) }

  // ─── Link Checker ─────────────────────────────────────────────────────────
  const handleCheckLinks = async () => {
    if (!bookmarks.length) { showToast('No bookmarks to check.', 'error'); return }
    setLinkChecking(true)
    setLinkResults(null)
    setLinkProgress(0)

    // Process in batches of 10 to avoid overwhelming the server
    const BATCH = 10
    let broken = 0

    for (let i = 0; i < bookmarks.length; i += BATCH) {
      const batch = bookmarks.slice(i, i + BATCH).map((b) => ({ id: b.id, url: b.url }))
      try {
        const res = await fetch('/api/check-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: batch }),
        })
        const data = await res.json()
        data.results?.forEach(({ id, broken: isBroken, archivedUrl }) => {
          if (archivedUrl) {
            // Wayback Machine recovery successful
            updateBookmark(id, { url: archivedUrl, isBroken: false, tags: ['Recovered'] })
          } else {
            updateBookmark(id, { isBroken })
            if (isBroken) broken++
          }
        })
      } catch {
        // batch failed — skip
      }
      setLinkProgress(Math.min(i + BATCH, bookmarks.length))
    }

    setLinkChecking(false)
    setLinkResults({ checked: bookmarks.length, broken })
    showToast(`Link check complete — ${broken} broken link${broken !== 1 ? 's' : ''} found.`, broken ? 'error' : 'success')
  }

  const tabStyle = (id) => ({
    flex: 1, padding: '0.55rem 0.25rem', fontSize: '0.78rem', fontWeight: 500,
    borderRadius: '7px', transition: 'all 0.15s ease',
    background: activeTab === id ? 'var(--active-nav-bg)' : 'transparent',
    color: activeTab === id ? 'var(--active-nav-text)' : 'var(--text-muted)',
    border: activeTab === id ? '1px solid var(--active-nav-border)' : '1px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <>
      <AnimatePresence>
        {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose} 
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <motion.div 
            initial={{ y: "100%", opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass-card" 
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '540px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Settings</h2>
            <button id="settings-close" onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1 }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.75rem', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '10px' }}>
            {TABS.map((t) => (
              <button key={t.id} style={tabStyle(t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* ── AI Tab ── */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <SectionHeading>AI Provider Keys</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Keys are stored only in your browser&apos;s local storage.
                  {apiKeys.openai ? ' OpenAI is active (priority).' : apiKeys.groq ? ' Groq is active.' : ' No AI key — bookmarks saved without summaries.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <KeyField id="openai-key" label="OpenAI API Key" placeholder="sk-..." value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} active={!!apiKeys.openai} note="Uses gpt-4o-mini — best quality" />
                  <KeyField id="groq-key"   label="Groq API Key"   placeholder="gsk_..." value={groqKey}   onChange={(e) => setGroqKey(e.target.value)}   active={!!apiKeys.groq && !apiKeys.openai} note="Uses llama-3.1-8b-instant — free tier: 30 req/min" />
                  <div style={{ height: '1px', background: 'var(--border-glass)' }} />
                  <KeyField id="tavily-key" label="Tavily API Key (for web extraction)" placeholder="tvly-..." value={tavilyKey} onChange={(e) => setTavilyKey(e.target.value)} active={!!apiKeys.tavily} note="Enables deep page extraction for richer AI summaries. Falls back to cheerio if not set." />
                </div>
              </div>
              <div style={{ padding: '0.875rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Pipeline:</strong> Tavily extracts full page content → AI summarizes & tags → saved to local storage.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button id="settings-cancel" type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button id="settings-save" type="button" className="btn-primary" onClick={handleSaveAI}>Save Changes</button>
              </div>
            </div>
          )}

          {/* ── Appearance Tab ── */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <SectionHeading>Theme</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Choose how Flame looks. &quot;System&quot; follows your OS setting.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {[
                    { id: 'system', icon: '⊙', label: 'System',   desc: 'Follows OS'     },
                    { id: 'dark',   icon: '☾',  label: 'Dark',     desc: 'Always dark'    },
                    { id: 'light',  icon: '☀',  label: 'Light',    desc: 'Always light'   },
                  ].map(({ id, icon, label, desc }) => (
                    <button
                      key={id}
                      id={`theme-btn-${id}`}
                      onClick={() => setTheme(id)}
                      style={{
                        flex: 1, padding: '1rem 0.75rem',
                        background: theme === id ? 'var(--active-nav-bg)' : 'var(--bg-glass)',
                        border: `1px solid ${theme === id ? 'var(--active-nav-border)' : 'var(--border-glass)'}`,
                        borderRadius: '12px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: theme === id ? 'var(--active-nav-text)' : 'var(--text-primary)' }}>{label}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</span>
                      {theme === id && <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>● Active</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}

          {/* ── Data Tab ── */}
          {activeTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Export */}
              <div>
                <SectionHeading>Export Bookmarks</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
                  Download all <strong style={{ color: 'var(--text-secondary)' }}>{bookmarks.length}</strong> bookmarks.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {[
                    { id: 'export-csv',  icon: '📊', label: 'Export CSV',  sub: 'Spreadsheet-friendly', fn: handleExportCSV  },
                    { id: 'export-html', icon: '🌐', label: 'Export HTML', sub: 'Browser-compatible',    fn: handleExportHTML },
                  ].map(({ id, icon, label, sub, fn }) => (
                    <button key={id} id={id} className="btn-secondary" onClick={fn}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border-glass)' }} />

              {/* Import */}
              <div>
                <SectionHeading>Import Bookmarks</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
                  Supports Flame exports and browser bookmark files from Chrome, Firefox, and Safari.
                </p>
                <div
                  id="import-dropzone"
                  onDragOver={(e) => { e.preventDefault(); setImportDragOver(true) }}
                  onDragLeave={() => setImportDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => importStatus !== 'loading' && fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${importDragOver ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer',
                    background: importDragOver ? 'rgba(99,102,241,0.07)' : 'var(--bg-glass)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {importStatus === 'loading' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Parsing file…</p>
                    </div>
                  ) : importStatus?.count !== undefined ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.75rem' }}>✅</span>
                      <p style={{ color: '#34d399', fontWeight: 600 }}>{importStatus.count} bookmarks imported!</p>
                      {importStatus.dupes > 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{importStatus.dupes} duplicate{importStatus.dupes !== 1 ? 's' : ''} skipped</p>}
                      <button onClick={(e) => { e.stopPropagation(); setImportStatus(null) }} style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>Import another file</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📁</div>
                      <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Drop your file here</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>or click to browse — .csv or .html accepted</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} id="import-file-input" type="file" accept=".csv,.html,.htm" onChange={handleFileChange} style={{ display: 'none' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button id="data-close" type="button" className="btn-secondary" onClick={onClose}>Close</button>
              </div>
            </div>
          )}

          {/* ── Browser Sync Tab ── */}
          {activeTab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <SectionHeading>Browser Extension Companion</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Install the Flame Bookmarklet to save links instantly from any webpage. Drag the button below to your browser&apos;s bookmarks bar.
                </p>
                <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px dashed var(--accent-primary)' }}>
                  <a 
                    href="javascript:window.open('http://localhost:3000/?add='+encodeURIComponent(location.href),'_blank');"
                    style={{
                      display: 'inline-block', padding: '0.75rem 1.5rem', background: 'var(--accent-gradient)',
                      color: 'white', fontWeight: 600, borderRadius: 'var(--radius-full)', textDecoration: 'none',
                      boxShadow: 'var(--shadow-glow)', cursor: 'grab'
                    }}
                    title="Drag me to your bookmarks bar!"
                    onClick={(e) => { e.preventDefault(); alert("Drag this button to your bookmarks bar, don't click it!"); }}
                  >
                    + Save to Flame
                  </a>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                    Clicking the bookmarklet on any site will open Flame and automatically extract the page for AI processing.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}

          {/* ── Cloud Sync Tab ── */}
          {activeTab === 'cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <SectionHeading>Supabase Cloud Sync</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Connect your own Supabase project to backup and restore your bookmarks across devices.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <KeyField id="supabase-url" label="Supabase Project URL" placeholder="https://xxxx.supabase.co" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} />
                  <KeyField id="supabase-key" label="Supabase Anon Key" placeholder="eyJhbG..." value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} />
                </div>
                
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                  <button className="btn-secondary" onClick={handleCloudRestore} style={{ flex: 1 }}>↓ Restore from Cloud</button>
                  <button className="btn-primary" onClick={handleCloudBackup} style={{ flex: 1 }}>↑ Backup to Cloud</button>
                </div>
                
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '10px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflowX: 'auto' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>SQL Schema Required:</strong><br/>
                  <pre style={{ margin: '0.5rem 0 0' }}>
{`CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  tags JSONB,
  domain TEXT,
  date_added TIMESTAMPTZ,
  is_favorite BOOLEAN DEFAULT FALSE,
  is_read_later BOOLEAN DEFAULT FALSE,
  og_image TEXT
);`}
                  </pre>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSaveAI}>Save Configuration</button>
              </div>
            </div>
          )}

          {/* ── Link Checker Tab ── */}
          {activeTab === 'links' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <SectionHeading>Dead-Link Checker</SectionHeading>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Checks all {bookmarks.length} saved links with a HEAD request and flags any that return a 4xx/5xx error or don&apos;t respond. Broken bookmarks will show a red badge on their card.
                </p>

                <button
                  id="check-links-btn"
                  className={linkChecking ? 'btn-secondary' : 'btn-primary'}
                  onClick={handleCheckLinks}
                  disabled={linkChecking || !bookmarks.length}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
                >
                  {linkChecking ? (
                    <>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Checking {linkProgress} / {bookmarks.length}…
                    </>
                  ) : '🔗 Check All Links'}
                </button>

                {/* Progress bar */}
                {linkChecking && (
                  <div style={{ marginTop: '1rem', height: '4px', background: 'var(--border-glass)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '2px',
                      background: 'var(--accent-gradient)',
                      width: `${Math.round((linkProgress / bookmarks.length) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                )}

                {/* Results */}
                {linkResults && !linkChecking && (
                  <div style={{
                    marginTop: '1rem', padding: '1rem',
                    background: linkResults.broken > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(52,211,153,0.07)',
                    border: `1px solid ${linkResults.broken > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}`,
                    borderRadius: '10px',
                  }}>
                    <p style={{ fontWeight: 600, color: linkResults.broken > 0 ? '#f87171' : '#34d399', marginBottom: '0.5rem' }}>
                      {linkResults.broken > 0
                        ? `⚠ ${linkResults.broken} broken link${linkResults.broken !== 1 ? 's' : ''} found`
                        : '✓ All links are working!'}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Checked {linkResults.checked} bookmarks. Broken links show a red badge on their card.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
        )}
      </AnimatePresence>
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  )
}
