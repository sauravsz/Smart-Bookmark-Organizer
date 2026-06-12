import { createClient } from '@supabase/supabase-js'
import useBookmarkStore from './store'

let supabaseInstance = null
let currentConfigStr = ''

/**
 * Returns a Supabase client instance dynamically configured 
 * with the user's URL and Anon Key from the store.
 */
export const getSupabaseClient = () => {
  const { supabaseConfig } = useBookmarkStore.getState()
  
  if (!supabaseConfig?.url || !supabaseConfig?.key) {
    return null
  }

  const configStr = `${supabaseConfig.url}-${supabaseConfig.key}`

  // Re-initialize only if credentials changed
  if (configStr !== currentConfigStr || !supabaseInstance) {
    try {
      supabaseInstance = createClient(supabaseConfig.url, supabaseConfig.key)
      currentConfigStr = configStr
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err)
      return null
    }
  }

  return supabaseInstance
}
