import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useBookmarkStore from '../lib/store'

export default function BookmarkCard({ bookmark, viewMode = 'grid', isSelected = false, onSelect = null, isSelectionMode = false, onToggleSelect = null }) {
  const { deleteBookmark, toggleFavorite, toggleReadLater, updateBookmark } = useBookmarkStore()
  const isList = viewMode === 'list'

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bookmark.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 99 : 'auto',
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    flexDirection: isList ? 'row' : 'column',
    alignItems: isList ? 'center' : 'stretch',
    gap: '0.875rem',
    textDecoration: 'none',
    position: 'relative',
    padding: isList ? '0.75rem 1.25rem' : '1.5rem',
    border: isSelected ? '2px solid var(--accent-primary)' : ''
  }

  const stopProp = (e, fn) => { e.preventDefault(); e.stopPropagation(); fn && fn() }

  const domain = useMemo(() => {
    if (bookmark.domain) return bookmark.domain
    try { return new URL(bookmark.url).hostname } catch { return bookmark.url }
  }, [bookmark.domain, bookmark.url])
  const favicon = bookmark.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  const timeAgo = (isoString) => {
    if (!isoString) return ''
    const diff = Date.now() - new Date(isoString).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return new Date(isoString).toLocaleDateString()
  }

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, scale: 0.92, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -15 }}
      whileHover={{ scale: 1.015, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      ref={setNodeRef}
      style={style}
      className={`glass-card bookmark-card group ${isList ? 'list-mode' : ''}`}
      onClick={(e) => {
        if (e.target.closest('a, button, input, .drag-handle')) return
        // Bug #9: Prevent accidental navigation if the user is dragging the card
        if (isDragging) {
          e.preventDefault()
          return
        }
        if (isSelectionMode) {
          e.preventDefault()
          onToggleSelect(bookmark.id)
        } else {
          window.open(bookmark.url, '_blank')
        }
      }}
    >
      {/* Drag Handle */}
      <div 
        {...attributes} 
        {...listeners} 
        className="drag-handle"
        style={{ 
          position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 10, cursor: 'grab', 
          opacity: isList ? 1 : 0, color: 'var(--text-muted)' 
        }}
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </div>

      {/* Checkbox overlay */}
      {onSelect && (
        <div 
          onClick={(e) => stopProp(e, () => onToggleSelect(bookmark.id))}
          style={{
            position: 'absolute', top: isList ? '50%' : '1rem', right: isList ? 'auto' : '1rem',
            left: isList ? '1rem' : 'auto', transform: isList ? 'translateY(-50%)' : 'none',
            zIndex: 10, cursor: 'pointer',
            background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.8)',
            border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-glass)'}`,
            borderRadius: '4px', width: '20px', height: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-glass)',
            opacity: isSelected ? 1 : 0.6,
          }}
          className="bookmark-checkbox"
        >
          {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
        </div>
      )}
      {/* OG Image strip */}
      {bookmark.ogImage && (
        <img
          src={bookmark.ogImage}
          alt=""
          onError={(e) => { e.target.style.display = 'none' }}
          style={{
            margin: isList ? '0 0.5rem 0 2rem' : '-1.5rem -1.5rem 0',
            height: isList ? '48px' : '100px',
            width: isList ? '48px' : 'calc(100% + 3rem)',
            objectFit: 'cover',
            borderRadius: isList ? 'var(--radius-sm)' : 'var(--radius-md) var(--radius-md) 0 0',
            opacity: 0.9,
            display: 'block',
            flexShrink: 0
          }}
        />
      )}

      {/* Content wrapper for list mode */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isList ? 'row' : 'column', gap: '0.875rem', minWidth: 0, alignItems: isList ? 'center' : 'stretch', justifyContent: isList ? 'space-between' : 'flex-start' }}>
        
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isList ? 'center' : 'flex-start', gap: '0.5rem', flex: isList ? 1 : 'none', marginLeft: isList && !bookmark.ogImage ? '2rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <img
            src={favicon}
            alt=""
            style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'white', padding: '2px', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div style={{ minWidth: 0 }}>
            <h3 className="bookmark-title" style={{
              fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)',
              marginBottom: '0.2rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {bookmark.title}
            </h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              {domain} · {timeAgo(bookmark.dateAdded)}
              {bookmark.isBroken && (
                <button
                  title="Mark as working"
                  onClick={(e) => stopProp(e, () => updateBookmark(bookmark.id, { isBroken: false }))}
                  className="broken-badge"
                  style={{ cursor: 'pointer' }}
                >
                  ⚠ Broken
                </button>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
          <button
            title={bookmark.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            onClick={(e) => stopProp(e, () => toggleFavorite(bookmark.id))}
            style={{ padding: '4px 6px', borderRadius: '6px', color: bookmark.isFavorite ? '#fbbf24' : 'var(--text-muted)', background: 'transparent', transition: 'color 0.2s' }}
          >
            {bookmark.isFavorite ? '★' : '☆'}
          </button>
          <button
            title={bookmark.isReadLater ? 'Remove from Read Later' : 'Add to Read Later'}
            onClick={(e) => stopProp(e, () => toggleReadLater(bookmark.id))}
            style={{ padding: '4px 6px', borderRadius: '6px', color: bookmark.isReadLater ? '#34d399' : 'var(--text-muted)', background: 'transparent', transition: 'color 0.2s' }}
          >
            {bookmark.isReadLater ? '⊕' : '⊙'}
          </button>
          <button
            title="Delete bookmark"
            onClick={(e) => stopProp(e, () => deleteBookmark(bookmark.id))}
            style={{ padding: '4px 6px', borderRadius: '6px', color: 'var(--text-muted)', background: 'transparent', transition: 'color 0.2s' }}
            className="delete-btn"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Description & Tags */}
      {!isList && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flexGrow: 1 }}>
          {bookmark.description && (
            <p className="card-description" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {bookmark.description}
            </p>
          )}

          {bookmark.tags && bookmark.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
              {bookmark.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category (Always visible) */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: isList ? 0 : 'auto', minWidth: isList ? '100px' : 'auto' }}>
        {bookmark.category && bookmark.category !== 'Other' && (
          <span style={{
            padding: '0.2rem 0.6rem',
            background: 'rgba(139,92,246,0.12)',
            color: '#c4b5fd',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.7rem', fontWeight: 600,
            border: '1px solid rgba(139,92,246,0.2)',
          }}>
            {bookmark.category}
          </span>
        )}
      </div>
      </div>
    </motion.article>
  )
}
