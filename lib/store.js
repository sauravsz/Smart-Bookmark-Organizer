import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'

// Custom IndexedDB storage with automatic migration from localStorage
const idbStorage = {
  getItem: async (name) => {
    try {
      const val = await get(name)
      if (val !== undefined && val !== null) return val

      // Fallback/Migrate from localStorage if IndexedDB is empty
      if (typeof window !== 'undefined') {
        const localVal = window.localStorage.getItem(name)
        if (localVal) {
          await set(name, localVal) // Migrate to IDB for future
          return localVal
        }
      }
      return null
    } catch (e) {
      console.error('IDB getItem error', e)
      return null
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value)
    } catch (e) {
      console.error('IDB setItem error', e)
    }
  },
  removeItem: async (name) => {
    try {
      await del(name)
    } catch (e) {
      console.error('IDB removeItem error', e)
    }
  },
}

const useBookmarkStore = create(
  persist(
    (set, get) => ({
      // --- State ---
      bookmarks: [],
      apiKeys: {
        openai: '',
        groq: '',
        tavily: '',
      },
      encryptedApiKeys: null, // Stores the AES ciphertext
      isVaultUnlocked: false, // In-memory flag
      supabaseConfig: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      customCategoryIcons: {}, // user-defined emoji mappings
      smartFolders: [
        { id: '1', name: 'Code & Tools', query: 'github react tailwind', icon: '🛠️' },
        { id: '2', name: 'Articles', query: 'blog post reading', icon: '📝' }
      ],
      activeView: 'all',   // 'all' | 'favorites' | 'read-later' | 'category:<name>' | 'smart:<id>'
      searchQuery: '',
      theme: 'system',     // 'system' | 'dark' | 'light'

      setSearchQuery: (query) => set({ searchQuery: query }),

      // --- Theme ---
      setTheme: (theme) => set({ theme }),

      // --- Config Actions ---
      setApiKeys: (keys) => set({ apiKeys: { ...get().apiKeys, ...keys } }),
      setEncryptedApiKeys: (ciphertext) => set({ encryptedApiKeys: ciphertext }),
      setVaultUnlocked: (unlocked) => set({ isVaultUnlocked: unlocked }),
      setSupabaseConfig: (config) => set({ supabaseConfig: { ...get().supabaseConfig, ...config } }),
      setCustomCategoryIcon: (category, icon) => set({ customCategoryIcons: { ...get().customCategoryIcons, [category]: icon } }),

      // --- Bookmark Actions ---
      addBookmark: (bookmark) =>
        set((state) => ({
          bookmarks: [bookmark, ...state.bookmarks],
        })),

      addBookmarks: (newBookmarks) =>
        set((state) => ({
          bookmarks: [...newBookmarks, ...state.bookmarks],
        })),

      deleteBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        })),

      deleteBookmarks: (ids) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => !ids.includes(b.id)),
        })),

      toggleFavorite: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, isFavorite: !b.isFavorite } : b
          ),
        })),

      // Patch a bookmark's fields in-place (used by AI batch enrichment & link checker)
      updateBookmark: (id, patch) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, ...patch } : b
          ),
        })),

      updateBookmarks: (ids, patch) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            ids.includes(b.id) ? { ...b, ...patch } : b
          ),
        })),

      reorderBookmarks: (activeId, overId) =>
        set((state) => {
          const oldIndex = state.bookmarks.findIndex(b => b.id === activeId)
          const newIndex = state.bookmarks.findIndex(b => b.id === overId)
          if (oldIndex === -1 || newIndex === -1) return state
          const newBookmarks = [...state.bookmarks]
          const [moved] = newBookmarks.splice(oldIndex, 1)
          newBookmarks.splice(newIndex, 0, moved)
          return { bookmarks: newBookmarks }
        }),

      toggleReadLater: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, isReadLater: !b.isReadLater } : b
          ),
        })),

      // --- View & Search Actions ---
      setActiveView: (view) => set({ activeView: view }),

      addSmartFolder: (folder) => set((state) => ({ smartFolders: [...state.smartFolders, folder] })),
      deleteSmartFolder: (id) => set((state) => ({ smartFolders: state.smartFolders.filter(f => f.id !== id) })),

      // --- Derived / Selectors ---
      getFilteredBookmarks: () => {
        const { bookmarks, activeView } = get()
        if (activeView === 'favorites') return bookmarks.filter((b) => b.isFavorite)
        if (activeView === 'read-later') return bookmarks.filter((b) => b.isReadLater)
        if (activeView.startsWith('category:')) {
          const cat = activeView.replace('category:', '').toLowerCase()
          return bookmarks.filter((b) => b.category?.toLowerCase() === cat)
        }
        return bookmarks
      },

      getFavoritesCount: () => get().bookmarks.filter((b) => b.isFavorite).length,
      getReadLaterCount: () => get().bookmarks.filter((b) => b.isReadLater).length,

      // Unique categories that have at least 1 bookmark
      getCategories: () => {
        const counts = {}
        get().bookmarks.forEach((b) => {
          if (b.category && b.category.toLowerCase() !== 'other') {
            const norm = b.category.charAt(0).toUpperCase() + b.category.slice(1).toLowerCase()
            counts[norm] = (counts[norm] || 0) + 1
          }
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }))
      },
    }),
    {
      name: 'osmo-bookmarks',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => {
        // Do not persist raw apiKeys or the unlock state
        const { apiKeys, isVaultUnlocked, ...rest } = state
        return rest
      },
    }
  )
)

export default useBookmarkStore
