import CryptoJS from 'crypto-js'

/**
 * Encrypts a bookmark object into a secure ciphertext string.
 * We encrypt the sensitive fields: title, url, description, tags, summary, content, category.
 * We leave non-sensitive structural fields (like ID, dates) unencrypted for basic DB syncing.
 */
export const encryptBookmarkData = (bookmark, masterPassword) => {
  if (!masterPassword) throw new Error('Master password required for encryption')
  
  // Extract sensitive fields
  const sensitiveData = {
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    category: bookmark.category,
    tags: bookmark.tags,
    summary: bookmark.summary,
    content: bookmark.content,
    embedding: bookmark.embedding,
    ogImage: bookmark.ogImage
  }

  const jsonStr = JSON.stringify(sensitiveData)
  const ciphertext = CryptoJS.AES.encrypt(jsonStr, masterPassword).toString()

  // Return a new object with the ciphertext and the non-sensitive fields
  return {
    id: bookmark.id,
    dateAdded: bookmark.dateAdded,
    isFavorite: bookmark.isFavorite,
    isReadLater: bookmark.isReadLater,
    favicon: bookmark.favicon, // Favicon URLs are generally not strictly sensitive, but can be moved to encrypted if needed
    domain: bookmark.domain,
    encrypted_data: ciphertext // This is what goes to Supabase
  }
}

/**
 * Decrypts a secure ciphertext string back into a partial bookmark object.
 */
export const decryptBookmarkData = (encryptedBookmark, masterPassword) => {
  if (!masterPassword) throw new Error('Master password required for decryption')
  
  if (!encryptedBookmark.encrypted_data) {
    // Legacy plaintext bookmark
    return encryptedBookmark
  }

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedBookmark.encrypted_data, masterPassword)
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8)
    
    if (!decryptedString) throw new Error('Decryption failed')
    
    const sensitiveData = JSON.parse(decryptedString)
    
    // Reconstruct the full bookmark
    return {
      ...encryptedBookmark,
      ...sensitiveData
    }
  } catch (err) {
    console.error('Failed to decrypt bookmark data for ID:', encryptedBookmark.id, err)
    // Return a locked stub so the UI doesn't crash, but shows it's locked
    return {
      ...encryptedBookmark,
      title: '🔒 Encrypted Bookmark',
      url: '#',
      description: 'Unable to decrypt. Check your master password.',
      isLocked: true
    }
  }
}
