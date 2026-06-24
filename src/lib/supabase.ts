import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether Supabase is configured. The app runs without it (offline/demo shell)
 * but auth + sync are disabled until env vars are set. See .env.example.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Singleton Supabase client, or null when not configured. Callers must handle
 * the null case so the app still loads for first-run / offline scenarios.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
