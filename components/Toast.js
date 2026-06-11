'use client'
import { useEffect, useState } from 'react'

export default function Toast({ message, type = 'success', onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss after 3.5s
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, 3500)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onDismiss])

  const colors = {
    success: { border: 'rgba(52, 211, 153, 0.4)', icon: '✓', iconColor: '#34d399', bg: 'rgba(52, 211, 153, 0.08)' },
    error:   { border: 'rgba(239, 68, 68, 0.4)',  icon: '✕', iconColor: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)'  },
    loading: { border: 'rgba(99, 102, 241, 0.4)', icon: '⟳', iconColor: '#818cf8', bg: 'rgba(99, 102, 241, 0.08)' },
  }

  const style = colors[type] || colors.success

  return (
    <div style={{
      position: 'fixed',
      bottom: '2rem',
      right: '2rem',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.875rem 1.25rem',
      background: `rgba(18, 18, 22, 0.95)`,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${style.border}`,
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      background: style.bg,
      color: '#fff',
      fontSize: '0.9rem',
      fontWeight: 500,
      maxWidth: '360px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      pointerEvents: 'none',
    }}>
      <span style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: style.iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        color: '#000',
        fontWeight: 700,
        flexShrink: 0,
        animation: type === 'loading' ? 'spin 1s linear infinite' : 'none',
      }}>
        {style.icon}
      </span>
      {message}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
