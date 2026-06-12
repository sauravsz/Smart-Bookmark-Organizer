'use client'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import './globals.css'
import SettingsModal from '../components/SettingsModal'
import AIChatPanel from '../components/AIChatPanel'
import useBookmarkStore from '../lib/store'
import MasterPasswordModal from '../components/MasterPasswordModal'

const NavBtn = ({ id, label, icon, count, activeView, setActiveView }) => {
  const active = activeView === id
  return (
    <motion.button
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.96 }}
      id={`nav-${id}`}
      onClick={() => setActiveView(id)}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--active-nav-bg)' : 'transparent',
        border: active ? '1px solid var(--active-nav-border)' : '1px solid transparent',
        color: active ? 'var(--active-nav-text)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400, fontSize: '0.875rem',
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span>{icon}</span>{label}
      </span>
      {count > 0 && (
        <span style={{
          fontSize: '0.7rem', fontWeight: 700,
          background: active ? 'var(--active-count-bg)' : 'var(--bg-btn-secondary)',
          color: active ? 'var(--active-count-text)' : 'var(--text-muted)',
          padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)',
          minWidth: '20px', textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </motion.button>
  )
}

const CATEGORY_ICONS = {
  Technology: '💻', Design: '🎨', Business: '💼', Science: '🔬',
  News: '📰', Entertainment: '🎬', Education: '📚', Finance: '💰',
  Health: '🏥', Other: '📌',
}

export default function RootLayout({ children }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)
  const [smartFoldersExpanded, setSmartFoldersExpanded] = useState(true)
  const isDraggingSidebar = useRef(false)

  // Register PWA Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service Worker registration failed: ', err)
      })
    }
  }, [])

  // Background Semantic Embedding Generator
  useEffect(() => {
    const worker = new Worker(new URL('../lib/embeddingWorker.js', import.meta.url), { type: 'module' })
    let isProcessing = false

    worker.addEventListener('message', (e) => {
      if (e.data.status === 'complete' && e.data.id.startsWith('embed_')) {
        const bookmarkId = e.data.id.replace('embed_', '')
        useBookmarkStore.getState().updateBookmark(bookmarkId, { embedding: e.data.embedding })
        isProcessing = false
      } else if (e.data.status === 'error') {
        isProcessing = false
      }
    })

    const interval = setInterval(() => {
      if (isProcessing) return
      const { bookmarks, isVaultUnlocked } = useBookmarkStore.getState()
      if (!isVaultUnlocked) return // Bug #6: Don't run background processes if vault is locked

      const pending = bookmarks.find(b => !b.embedding && b.description && !b._embedFailed)
      if (pending) {
        isProcessing = true
        // Bug #5: Avoid 'undefined' literal by safely falling back to empty strings
        const textToEmbed = `${pending.title || ''} ${pending.description || ''} ${(pending.tags || []).join(' ')}`.trim()
        worker.postMessage({ text: textToEmbed, id: `embed_${pending.id}` })
      }
    }, 2000)

    return () => {
      clearInterval(interval)
      worker.terminate()
    }
  }, [])

  // Background Auto-Tagging (Process one untagged bookmark every 15 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      const { apiKeys, isVaultUnlocked, bookmarks, updateBookmark } = useBookmarkStore.getState()
      if (!isVaultUnlocked) return // Bug #6
      const activeKey = apiKeys?.openai || apiKeys?.groq
      if (!activeKey) return

      // Bug #4: Ignore bookmarks that previously failed to prevent infinite API spam
      const pending = bookmarks.find(b => (!b.tags || b.tags.length === 0) && !b.description && !b._tagFailed)
      if (pending) {
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: pending.url, 
              title: pending.title, 
              apiKey: activeKey, 
              provider: apiKeys.openai ? 'openai' : 'groq' 
            })
          })
          if (res.ok) {
            const data = await res.json()
            updateBookmark(pending.id, { 
              title: data.title || pending.title,
              description: data.summary, 
              tags: data.tags, 
              category: data.category 
            })
          } else {
            // Bug #4: Mark as failed so we don't spam
            updateBookmark(pending.id, { _tagFailed: true })
          }
        } catch(e) {
          updateBookmark(pending.id, { _tagFailed: true })
        }
      }
    }, 15000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingSidebar.current) return
      const newWidth = Math.max(200, Math.min(e.clientX, 600))
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (isDraggingSidebar.current) {
        isDraggingSidebar.current = false
        document.body.style.cursor = 'default'
      }
    }
    const handleMouseLeave = () => {
      if (isDraggingSidebar.current) {
        isDraggingSidebar.current = false
        document.body.style.cursor = 'default'
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mouseleave', handleMouseLeave)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  const {
    activeView, setActiveView,
    bookmarks, getFavoritesCount, getReadLaterCount, getCategories,
    theme, setTheme, smartFolders, deleteSmartFolder, setSearchQuery,
    customCategoryIcons, setCustomCategoryIcon
  } = useBookmarkStore()

  const favCount = isMounted ? getFavoritesCount() : 0
  const readLaterCount = isMounted ? getReadLaterCount() : 0
  const categories = isMounted ? getCategories() : []

  // Apply data-theme to <html> whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const navItems = [
    { id: 'all',        label: 'All Bookmarks', icon: '🔖', count: isMounted ? bookmarks.length : 0 },
    { id: 'favorites',  label: 'Favorites',     icon: '★',  count: favCount },
    { id: 'read-later', label: 'Read Later',     icon: '⊕',  count: readLaterCount },
  ]

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <title>Flame Bookmark Organiser</title>
        <meta name="description" content="Flame Bookmark Organiser — Save, organize, and understand your bookmarks with AI-powered summaries and smart tagging." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ed6f5c" />
        <link rel="apple-touch-icon" href="/globe.svg" />
      </head>
      <body>
        <MasterPasswordModal />
        <div className="app-container">
          {/* ── Sidebar ── */}
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            {/* Resize handle */}
            <div
              style={{
                position: 'absolute', right: -4, top: 0, bottom: 0, width: 8,
                cursor: 'col-resize', zIndex: 10
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                isDraggingSidebar.current = true
                document.body.style.cursor = 'col-resize'
              }}
            />
            {/* Logo */}
            <div>
              <h1 className="text-gradient logo-text" style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                Flame
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Smart Bookmarks</p>
            </div>

            {/* Main Nav */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {navItems.map((item) => <NavBtn key={item.id} {...item} activeView={activeView} setActiveView={setActiveView} />)}
            </nav>

            {/* Smart Collections */}
            {categories.length > 0 && (
              <div>
                <button
                  onClick={() => setCategoriesExpanded((v) => !v)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '0.25rem 0.25rem',
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--text-muted)',
                    background: 'transparent', cursor: 'pointer',
                  }}
                >
                  Collections
                  <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: categoriesExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>

                {categoriesExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem' }}>
                    {categories.map(({ name, count }) => {
                      const viewId = `category:${name}`
                      const active = activeView === viewId
                      return (
                        <button
                          key={name}
                          id={`nav-cat-${name.toLowerCase()}`}
                          onClick={() => setActiveView(viewId)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            const newIcon = prompt(`Enter a new emoji for category "${name}":`, customCategoryIcons[name] || CATEGORY_ICONS[name] || '📌')
                            if (newIcon) setCustomCategoryIcon(name, newIcon.trim())
                          }}
                          style={{
                            width: '100%', textAlign: 'left',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)',
                            background: active ? 'var(--active-nav-bg)' : 'transparent',
                            border: active ? '1px solid var(--active-nav-border)' : '1px solid transparent',
                            color: active ? 'var(--active-nav-text)' : 'var(--text-secondary)',
                            fontSize: '0.825rem', cursor: 'pointer', transition: 'all 0.15s ease',
                          }}
                          title="Right-click to change emoji"
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem' }}>{customCategoryIcons[name] || CATEGORY_ICONS[name] || '📌'}</span>
                            {name}
                          </span>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 600,
                            background: 'var(--bg-btn-secondary)',
                            color: 'var(--text-muted)',
                            padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                          }}>{count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Smart Folders Section */}
            {smartFolders.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{
                  padding: '0.25rem', fontSize: '0.72rem', fontWeight: 700, 
                  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)'
                }}>
                  Smart Folders
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem' }}>
                  {(() => {
                    // Build a tree
                    const roots = []
                    const map = {}
                    smartFolders.forEach(f => { map[f.id] = { ...f, children: [] } })
                    smartFolders.forEach(f => {
                      if (f.parentId && map[f.parentId]) {
                        map[f.parentId].children.push(map[f.id])
                      } else {
                        roots.push(map[f.id])
                      }
                    })

                    const renderFolder = (folder, depth = 0, visited = new Set()) => {
                      // Bug #1: Circular dependency loop prevention
                      if (visited.has(folder.id) || depth > 10) return null
                      const newVisited = new Set(visited).add(folder.id)

                      const viewId = `smart:${folder.id}`
                      const active = activeView === viewId
                      return (
                        <div key={folder.id}>
                          <button
                            onClick={() => {
                              setActiveView(viewId)
                              setSearchQuery(folder.query)
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              if (confirm(`Delete Smart Folder "${folder.name}"?`)) deleteSmartFolder(folder.id)
                            }}
                            style={{
                              width: '100%', textAlign: 'left',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: `0.45rem 0.75rem 0.45rem ${0.75 + depth * 1.5}rem`, borderRadius: 'var(--radius-sm)',
                              background: active ? 'var(--active-nav-bg)' : 'transparent',
                              border: active ? '1px solid var(--active-nav-border)' : '1px solid transparent',
                              color: active ? 'var(--active-nav-text)' : 'var(--text-secondary)',
                              fontSize: '0.825rem', cursor: 'pointer', transition: 'all 0.15s ease',
                            }}
                            title={`Right-click to delete. Query: "${folder.query}"`}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.9rem', width: '16px', display: 'inline-block' }}>{folder.icon}</span>
                              {folder.name}
                            </span>
                          </button>
                          {folder.children.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', marginTop: '0.1rem' }}>
                              {folder.children.map(child => renderFolder(child, depth + 1, newVisited))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return roots.map(root => renderFolder(root))
                  })()}
                </div>
              </div>
            )}

            <div style={{ height: '1px', background: 'var(--border-glass)' }} />

            {/* Stats */}
            <div style={{
              padding: '0.875rem',
              background: 'var(--bg-glass)',
              borderRadius: '10px',
              border: '1px solid var(--border-glass)',
              fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.9,
            }}>
              {[
                { label: 'Total saved',  val: bookmarks.length,   color: 'var(--text-secondary)' },
                { label: 'Favorited',    val: favCount,           color: '#fbbf24'              },
                { label: 'Read Later',   val: readLaterCount,     color: '#34d399'              },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{label}</span>
                  <strong style={{ color }}>{val}</strong>
                </div>
              ))}
            </div>

            {/* Bottom buttons */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* AI Chat */}
              <button
                id="open-chat"
                onClick={() => setIsChatOpen(true)}
                style={{
                  width: '100%', padding: '0.65rem',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent-text)', fontWeight: 600, fontSize: '0.875rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                ✦ Ask Flame AI
              </button>

              {/* Theme picker */}
              <div style={{
                display: 'flex', gap: '0.25rem',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px',
              }}>
                {[
                  { id: 'system', label: '⊙', title: 'System theme' },
                  { id: 'dark',   label: '☾', title: 'Dark theme'   },
                  { id: 'light',  label: '☀',  title: 'Light theme'  },
                ].map(({ id, label, title }) => (
                  <button
                    key={id}
                    id={`theme-${id}`}
                    title={title}
                    onClick={() => setTheme(id)}
                    style={{
                      flex: 1, padding: '0.35rem',
                      borderRadius: '6px', fontSize: '0.875rem',
                      background: theme === id ? 'var(--active-nav-bg)' : 'transparent',
                      color: theme === id ? 'var(--active-nav-text)' : 'var(--text-muted)',
                      border: theme === id ? '1px solid var(--active-nav-border)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Settings */}
              <button
                id="open-settings"
                className="btn-secondary"
                onClick={() => setIsSettingsOpen(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                ⚙ Settings
              </button>
            </div>
            {/* Smart Folders Section */}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.25rem 0.25rem'
              }}>
                <button
                  onClick={() => setSmartFoldersExpanded((v) => !v)}
                  style={{
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--text-muted)',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.25rem'
                  }}
                >
                  Smart Folders
                  <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: smartFoldersExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>
                <button
                  onClick={() => {
                    const query = window.prompt("Enter a topic for your new Smart Folder (e.g. 'React UI Libraries'):")
                    if (query && query.trim()) {
                      useBookmarkStore.getState().addSmartFolder({
                        id: Date.now().toString(),
                        name: query.trim(),
                        query: query.trim(),
                        icon: '✨'
                      })
                    }
                  }}
                  style={{
                    fontSize: '1rem', color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px'
                  }}
                  title="Create Smart Folder"
                >
                  +
                </button>
              </div>

              {smartFoldersExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem' }}>
                  {smartFolders.map((folder) => {
                    const viewId = `smart:${folder.id}`
                    const active = activeView === viewId
                    return (
                      <button
                        key={folder.id}
                        onClick={() => {
                          setActiveView(viewId)
                          setSearchQuery(folder.query)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          if (window.confirm(`Delete Smart Folder "${folder.name}"?`)) {
                            deleteSmartFolder(folder.id)
                            if (active) setActiveView('all')
                          }
                        }}
                        style={{
                          width: '100%', textAlign: 'left',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)',
                          background: active ? 'var(--active-nav-bg)' : 'transparent',
                          border: active ? '1px solid var(--active-nav-border)' : '1px solid transparent',
                          color: active ? 'var(--active-nav-text)' : 'var(--text-secondary)',
                          fontSize: '0.825rem', cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                        title={`Query: ${folder.query}\nRight-click to delete`}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem' }}>{folder.icon}</span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                            {folder.name}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  {smartFolders.length === 0 && (
                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Click + to create an AI folder
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main className="main-content">
            {children}
          </main>
        </div>

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <AIChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </body>
    </html>
  )
}
