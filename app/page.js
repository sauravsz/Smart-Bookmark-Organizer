'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Fuse from 'fuse.js'
import useBookmarkStore from '../lib/store'
import BookmarkCard from '../components/BookmarkCard'
import AddBookmarkModal from '../components/AddBookmarkModal'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'

// Cosine similarity helper
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

const FUSE_OPTIONS = {
  keys: [
    { name: 'title',       weight: 0.4 },
    { name: 'description', weight: 0.3 },
    { name: 'tags',        weight: 0.2 },
    { name: 'url',         weight: 0.05 },
    { name: 'category',    weight: 0.05 },
  ],
  threshold: 0.35,
  includeScore: true,
  ignoreLocation: true,
}

const VIEW_LABELS = {
  all: 'All Bookmarks',
  favorites: 'Favorites',
  'read-later': 'Read Later',
}

export default function Home() {
  const [isMounted, setIsMounted] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [visibleLimit, setVisibleLimit] = useState(50)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [semanticResults, setSemanticResults] = useState(null)
  const [isSemanticLoading, setIsSemanticLoading] = useState(false)
  const workerRef = useRef(null)
  const { deleteBookmarks, updateBookmarks, reorderBookmarks } = useBookmarkStore()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      reorderBookmarks(active.id, over.id)
    }
  }

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedIds.size} bookmarks?`)) {
      deleteBookmarks(Array.from(selectedIds))
      setSelectedIds(new Set())
    }
  }

  const handleBulkFavorite = () => {
    updateBookmarks(Array.from(selectedIds), { isFavorite: true })
    setSelectedIds(new Set())
  }

  useEffect(() => {
    setIsMounted(true)

    // Initialize Embedding Worker
    workerRef.current = new Worker(new URL('../lib/embeddingWorker.js', import.meta.url), { type: 'module' })
    workerRef.current.addEventListener('message', (e) => {
      if (e.data.status === 'complete' && e.data.id === 'search_query') {
        const queryEmbedding = e.data.embedding
        // Compute cosine similarity against all bookmarks
        const { getFilteredBookmarks } = useBookmarkStore.getState()
        const all = getFilteredBookmarks()
        const scored = all.map(b => ({
          ...b,
          similarity: b.embedding ? cosineSimilarity(queryEmbedding, b.embedding) : 0
        })).filter(b => b.similarity > 0.4).sort((a, b) => b.similarity - a.similarity)
        
        setSemanticResults(scored)
        setIsSemanticLoading(false)
      } else if (e.data.status === 'error') {
        setIsSemanticLoading(false)
        console.error('Semantic search error:', e.data.error)
      }
    })

    // Handle Bookmarklet / Extension incoming URL
    const params = new URLSearchParams(window.location.search)
    const addUrl = params.get('add')
    if (addUrl) {
      setIsAddModalOpen(true)
      // Bug #3: Strip ?add= from URL so it doesn't pop up again on refresh
      const newUrl = window.location.pathname + window.location.search.replace(/[\?&]add=[^&]+/, '').replace(/^&/, '?')
      window.history.replaceState({}, document.title, newUrl || window.location.pathname)
    }

    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K for Search Focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('bookmark-search')?.focus()
      }
      // Cmd/Ctrl + N for Add Bookmark
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setIsAddModalOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // Bug #8: Terminate semantic search worker on unmount to prevent memory leaks
      workerRef.current?.terminate()
    }
  }, [])

  const { getFilteredBookmarks, activeView, searchQuery, setSearchQuery, smartFolders, addSmartFolder } = useBookmarkStore()
  
  // Reset semantic results if search clears
  useEffect(() => {
    if (!searchQuery) {
      setSemanticResults(null)
      setIsSemanticLoading(false)
    }
  }, [searchQuery])

  const filtered = useMemo(() => {
    let result = getFilteredBookmarks()
    if (searchQuery) {
      const fuse = new Fuse(result, FUSE_OPTIONS)
      const fuzzyMatches = fuse.search(searchQuery).map((res) => res.item)
      
      // If fuzzy returns nothing, trigger semantic search (if not already triggered)
      if (fuzzyMatches.length === 0 && workerRef.current) {
        if (!semanticResults && !isSemanticLoading) {
          setIsSemanticLoading(true)
          workerRef.current.postMessage({ text: searchQuery, id: 'search_query' })
        }
        return semanticResults || [] // Show semantic matches or empty while loading
      }
      return fuzzyMatches
    }
    return result
  }, [getFilteredBookmarks, searchQuery, semanticResults, isSemanticLoading])

  const viewLabel = activeView.startsWith('category:')
    ? activeView.replace('category:', '')
    : VIEW_LABELS[activeView] || 'All Bookmarks'

  if (!isMounted) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>

  return (
    <div>
      <header className="header">
        <div>
          <h2 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 700 }}>{viewLabel}</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            {filtered.length} {filtered.length === 1 ? 'link' : 'links'}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Fuzzy search */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '0.85rem',
            }}>🔍</span>
            <input
              id="bookmark-search"
              type="text"
              className="glass-input"
              placeholder="Search (Cmd+K)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.25rem', width: '220px', fontSize: '0.875rem', height: '42px' }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ×
              </button>
            )}
          </div>
          {searchQuery && !smartFolders.some(f => f.query === searchQuery) && (
            <button 
              className="btn-secondary" 
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', height: '42px' }}
              onClick={() => {
                const folderName = prompt('Enter smart folder name:')
                if (!folderName) return
                const parentIdStr = prompt('Enter parent folder ID (or leave blank for root):')
                addSmartFolder({
                  // Bug #10: Append random string to prevent key collisions if created too fast
                  id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                  name: folderName,
                  query: searchQuery,
                  parentId: parentIdStr || null
                })
              }}
              title="Save this search as a Smart Folder"
            >
              Save Search
            </button>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-btn-secondary)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
            <button 
              onClick={() => setViewMode('grid')}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', background: viewMode === 'grid' ? 'var(--bg-glass)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              title="Grid View"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', background: viewMode === 'list' ? 'var(--bg-glass)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              title="List View"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
          </div>

          <button id="open-add-bookmark" className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
            + Add Bookmark <span style={{opacity: 0.7, fontSize: '0.75em', marginLeft: '4px'}}>(Cmd+N)</span>
          </button>
        </div>
      </header>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)' }}>
          {searchQuery ? (
            <>
              {isSemanticLoading ? (
                <>
                  <div className="spinner" style={{ margin: '0 auto 1rem', width: '40px', height: '40px', border: '3px solid var(--border-glass)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Analyzing concepts...</p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>Running local machine learning model</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                  <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>No results for "{searchQuery}"</p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>No fuzzy or conceptual matches found.</p>
                  <button onClick={() => setSearchQuery('')} className="btn-secondary" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                    Clear search
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                {activeView === 'favorites' ? '★' : activeView === 'read-later' ? '⊕' : activeView.startsWith('category:') ? '📂' : '🔖'}
              </div>
              <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {activeView === 'favorites' ? 'No favorites yet' : activeView === 'read-later' ? 'No read-later items' : activeView.startsWith('category:') ? `No ${viewLabel} bookmarks yet` : 'No bookmarks yet'}
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {activeView === 'all' ? 'Click "+ Add Bookmark" to save your first link.' : 'Star or mark bookmarks from your collection.'}
              </p>
              {activeView === 'all' && (
                <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => setIsAddModalOpen(true)}>
                  Add Your First Bookmark
                </button>
              )}
            </>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <motion.div layout className={viewMode === 'list' ? 'bookmarks-list' : 'bookmarks-grid'}>
              <AnimatePresence mode="popLayout">
                {filtered.slice(0, visibleLimit).map((b) => (
                  <BookmarkCard 
                    key={b.id} 
                    bookmark={b} 
                    viewMode={viewMode}
                    isSelectionMode={selectedIds.size > 0}
                    isSelected={selectedIds.has(b.id)}
                    onToggleSelect={toggleSelection}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </SortableContext>
        </DndContext>
      )}
      
      {filtered.length > visibleLimit && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn-secondary" onClick={() => setVisibleLimit(prev => prev + 50)}>
            Load More Bookmarks
          </button>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 100, opacity: 0, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: '2rem', left: '50%',
              background: 'var(--bg-sidebar)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)',
              boxShadow: 'var(--shadow-glass)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', gap: '1.5rem', zIndex: 100,
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)'
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {selectedIds.size} selected
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={handleBulkFavorite}>
                ★ Favorite
              </button>
              <button className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', color: '#ef4444' }} onClick={handleBulkDelete}>
                🗑 Delete
              </button>
              <button className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => setSelectedIds(new Set())}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddBookmarkModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  )
}
