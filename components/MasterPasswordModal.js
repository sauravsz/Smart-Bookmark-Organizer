import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CryptoJS from 'crypto-js'
import useBookmarkStore from '../lib/store'

export default function MasterPasswordModal() {
  const { encryptedApiKeys, setEncryptedApiKeys, setApiKeys, setVaultUnlocked, isVaultUnlocked } = useBookmarkStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isVisible, setIsVisible] = useState(false)

  // Determine if we need to show the modal (either to set a password or unlock)
  // If the user has never set keys, they don't *need* a password until they try to save keys.
  // But to keep it secure, we prompt for unlock if encryptedApiKeys exists and vault is locked.
  useEffect(() => {
    if (encryptedApiKeys && !isVaultUnlocked) {
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }, [encryptedApiKeys, isVaultUnlocked])

  const handleUnlock = (e) => {
    e.preventDefault()
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedApiKeys, password)
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8)
      
      if (!decryptedString) throw new Error('Invalid password')
      
      const keys = JSON.parse(decryptedString)
      setApiKeys(keys)
      setVaultUnlocked(true)
      setIsVisible(false)
      setError('')
      // Store the password temporarily in sessionStorage so if they update keys in Settings,
      // we can re-encrypt without asking again during this session.
      window.sessionStorage.setItem('osmo_vault_pwd', password)
    } catch (err) {
      setError('Incorrect master password.')
    }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--bg-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitBackdropFilter: 'blur(10px)'
          }}
        >
          <motion.div 
            initial={{ y: "100%", opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass-card" 
            style={{ width: '100%', maxWidth: '400px', padding: '2rem', textAlign: 'center' }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Vault Locked</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Enter your Master Password to decrypt your API keys.
            </p>

            <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="password"
                autoFocus
                className="glass-input"
                placeholder="Master Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '1rem' }}
              />
              {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'left' }}>{error}</p>}
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', padding: '0.75rem' }}
              >
                Unlock Vault
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
