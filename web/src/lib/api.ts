import { brand } from './brand'
import { supabase } from './supabase'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Calls our FastAPI with the current login token and brand header. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Brand', brand.id)
  headers.set('X-App-Version', __APP_VERSION__)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (init.auth !== false) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }
  const res = await fetch(BASE + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = body.detail || body.error?.message || msg
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export interface Profile {
  id: string
  tenant_id: string
  role: 'driver' | 'owner' | 'admin' | 'super_admin' | null
  name: string | null
  phone: string | null
  photo_url: string | null
  lang: 'hi' | 'en'
  city: string | null
  pincode: string | null
  verified: boolean
}

export const getMe = () => api<{ exists: boolean; profile: Profile | null }>('/me')
export const startMe = (role: 'driver' | 'owner', lang: 'hi' | 'en') =>
  api<{ exists: boolean; profile: Profile }>('/me', { method: 'POST', json: { role, lang } })
export const heartbeat = () => api<void>('/me/seen', { method: 'POST' })
