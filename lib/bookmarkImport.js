// ─── EXPORT ──────────────────────────────────────────────────────────────────

/**
 * Export bookmarks as a CSV string and trigger download.
 */
export function exportAsCSV(bookmarks) {
  const headers = ['Title', 'URL', 'Description', 'Tags', 'Category', 'Favorite', 'Read Later', 'Date Added']

  const rows = bookmarks.map((b) => [
    csvCell(b.title || ''),
    csvCell(b.url || ''),
    csvCell(b.description || ''),
    csvCell((b.tags || []).join(', ')),
    csvCell(b.category || ''),
    b.isFavorite ? 'Yes' : 'No',
    b.isReadLater ? 'Yes' : 'No',
    csvCell(b.dateAdded ? new Date(b.dateAdded).toISOString() : ''),
  ])

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  downloadFile(csv, `osmo-bookmarks-${dateStamp()}.csv`, 'text/csv;charset=utf-8;')
}

/**
 * Export bookmarks as a Netscape HTML bookmark file (standard browser format).
 */
export function exportAsHTML(bookmarks) {
  const items = bookmarks
    .map((b) => {
      const added = b.dateAdded ? Math.floor(new Date(b.dateAdded).getTime() / 1000) : ''
      const tags = (b.tags || []).join(',')
      return `    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${added}" TAGS="${escapeHtml(tags)}">${escapeHtml(b.title || b.url)}</A>`
    })
    .join('\n')

  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file by Flame Bookmark Organiser -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Flame Bookmarks</H1>
<DL><p>
${items}
</DL><p>`

  downloadFile(html, `osmo-bookmarks-${dateStamp()}.html`, 'text/html;charset=utf-8;')
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into bookmark objects.
 * Supports both Flame-exported CSVs and generic CSVs with at least a URL column.
 */
export function parseCSV(text) {
  const lines = parseCSVRows(text.trim())
  if (lines.length < 2) throw new Error('CSV file appears to be empty or has no data rows.')

  const headers = lines[0].map((h) => h.toLowerCase().trim())

  // Find column indexes
  const idx = {
    title:      findCol(headers, ['title', 'name']),
    url:        findCol(headers, ['url', 'href', 'link', 'uri']),
    description: findCol(headers, ['description', 'summary', 'note', 'notes']),
    tags:       findCol(headers, ['tags', 'tag', 'keywords']),
    category:   findCol(headers, ['category', 'folder', 'group']),
    favorite:   findCol(headers, ['favorite', 'favourited', 'starred']),
    readLater:  findCol(headers, ['read later', 'readlater', 'read_later']),
    dateAdded:  findCol(headers, ['date added', 'dateadded', 'date_added', 'created', 'timestamp']),
  }

  if (idx.url === -1) throw new Error('CSV must have a "URL" column.')

  const bookmarks = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
    if (cols.length === 0 || cols.every(c => c === '')) continue
    const url = cols[idx.url]?.trim()
    if (!url || !isValidUrl(url)) continue

    const domain = safeHostname(url)

    bookmarks.push({
      id: `import-${Date.now()}-${i}`,
      url,
      title: (idx.title !== -1 ? cols[idx.title] : '') || domain,
      description: idx.description !== -1 ? cols[idx.description] || '' : '',
      tags: idx.tags !== -1 ? (cols[idx.tags] || '').split(',').map((t) => t.trim()).filter(Boolean) : [],
      category: idx.category !== -1 ? cols[idx.category] || 'Other' : 'Other',
      isFavorite: idx.favorite !== -1 ? /yes|true|1/i.test(cols[idx.favorite] || '') : false,
      isReadLater: idx.readLater !== -1 ? /yes|true|1/i.test(cols[idx.readLater] || '') : false,
      dateAdded: idx.dateAdded !== -1 && cols[idx.dateAdded] ? cols[idx.dateAdded] : new Date().toISOString(),
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      domain,
    })
  }

  if (bookmarks.length === 0) throw new Error('No valid bookmarks found in the CSV file.')
  return bookmarks
}

/**
 * Parse a Netscape HTML bookmark file into bookmark objects.
 */
export function parseHTML(text) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const anchors = doc.querySelectorAll('a[href]')

  if (anchors.length === 0) throw new Error('No bookmarks found in this HTML file.')

  const bookmarks = []

  anchors.forEach((a, i) => {
    const url = a.getAttribute('href')?.trim()
    if (!url || !isValidUrl(url)) return

    const domain = safeHostname(url)
    const addDate = a.getAttribute('add_date') || a.getAttribute('add_date')
    const tagsAttr = a.getAttribute('tags') || a.getAttribute('shortcuturl') || ''
    const tags = tagsAttr.split(',').map((t) => t.trim()).filter(Boolean)

    let dateAdded = new Date().toISOString()
    if (addDate) {
      // ADD_DATE is usually a Unix timestamp in seconds
      const ts = parseInt(addDate, 10)
      if (!isNaN(ts)) dateAdded = new Date(ts * 1000).toISOString()
    }

    bookmarks.push({
      id: `import-html-${Date.now()}-${i}`,
      url,
      title: a.textContent.trim() || domain,
      description: a.getAttribute('description') || '',
      tags,
      category: 'Other',
      isFavorite: false,
      isReadLater: false,
      dateAdded,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      domain,
    })
  })

  if (bookmarks.length === 0) throw new Error('No valid URLs found in the HTML file.')
  return bookmarks
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function csvCell(value) {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function parseCSVRows(text) {
  const rows = []
  let current = []
  let val = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        val += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      current.push(val.trim())
      val = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++ // skip \r\n
      current.push(val.trim())
      rows.push(current)
      current = []
      val = ''
    } else {
      val += ch
    }
  }

  if (val !== '' || current.length > 0) {
    current.push(val.trim())
    rows.push(current)
  }

  return rows.filter(row => row.some(cell => cell.trim() !== ''))
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c)
    if (idx !== -1) return idx
  }
  return -1
}

function isValidUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function safeHostname(url) {
  try { return new URL(url).hostname } catch { return url }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
