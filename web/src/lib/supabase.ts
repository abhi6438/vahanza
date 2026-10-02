import { createClient } from '@supabase/supabase-js'
import { brand } from './brand'
import { storage } from './storage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing: login will not work until they are set')
}

// Supabase is used ONLY for login here. All data goes through our FastAPI (/api/v1).
// persistSession + autoRefreshToken keep the user logged in until they log out.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: {
    storage,
    storageKey: `${brand.id}-auth`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/** Indian 10-digit mobile → E.164 (+91XXXXXXXXXX). */
export const toE164 = (tenDigits: string) => `+91${tenDigits}`

export const isValidIndianMobile = (v: string) => /^[6-9]\d{9}$/.test(v)
