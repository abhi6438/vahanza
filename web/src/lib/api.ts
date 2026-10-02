import { brand } from './brand'
import { supabase } from './supabase'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api/v1'

export class ApiError extends Error {
  status: number
  /** Machine-readable reason from the API, e.g. "name_has_number" or "incomplete". */
  code?: string
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
    if (detail && typeof detail === 'object' && 'code' in detail) this.code = String((detail as { code: unknown }).code)
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
    let detail: unknown
    try {
      const body = await res.json()
      detail = body.detail
      msg = typeof body.detail === 'string' ? body.detail : body.error?.message || (detail as { code?: string })?.code || msg
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg, detail)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export interface Profile {
  id: string
  tenant_id: string
  role: 'driver' | 'owner' | 'admin' | 'super_admin' | null
  name: string | null
  business_name: string | null
  phone: string | null
  photo_url: string | null
  lang: 'hi' | 'en'
  city: string | null
  district: string | null
  state: string | null
  pincode: string | null
  verified: boolean
  setup_done: boolean
  /** Number is in the test list: hidden from real users, left out of analytics. */
  is_test?: boolean
}

export interface DriverDetails {
  vehicles: string[]
  max_wheels: number | null
  licence_type: 'LMV' | 'HMV' | 'Transport' | null
  licence_last4?: string | null
  experience_years: number | null
  savings_wanted: number | null
  savings_negotiable: boolean
  pay_prefs: string[]
  work_type: 'full' | 'day' | 'trip' | null
  area: 'local' | 'dist' | 'state' | 'india' | null
  languages: string[]
  available_from: 'now' | 'w1' | 'd15' | 'm1' | null
  is_available?: boolean
}

export interface FleetGroup {
  id?: string
  vehicle_type: string
  wheels: number | null
  vehicle_count: number
  base_cities: string[]
}

export interface PlaceIn { district: string; state: string; pincode?: string | null; lat?: number | null; lng?: number | null }
export interface Me { exists: boolean; profile: Profile | null; driver?: DriverDetails | null; fleet?: FleetGroup[] | null }
export interface ProfileBody {
  name: string
  business_name?: string | null
  place: PlaceIn
  driver?: DriverDetails & { licence_number?: string | null }
  fleet?: FleetGroup[]
  finish?: boolean
}
export interface PlaceHit { value: string; en: string; hi: string | null; state: string; state_hi?: string | null; pincode?: string; lat?: number | null; lng?: number | null }

/** Resolves a photo URL from the API: dev uploads come back as a path on our API. */
export const photoSrc = (url: string | null | undefined) =>
  !url ? null : url.startsWith('/') ? (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + url : url

export const getMe = () => api<Me>('/me')
export const startMe = (role: 'driver' | 'owner', lang: 'hi' | 'en') => api<Me>('/me', { method: 'POST', json: { role, lang } })
export const saveProfile = (body: ProfileBody) => api<Me>('/me/profile', { method: 'PUT', json: body })
export const uploadPhoto = (jpeg: Blob) =>
  api<{ photo_url: string }>('/me/photo', { method: 'POST', body: jpeg, headers: { 'Content-Type': jpeg.type || 'image/jpeg' } })
export const removePhoto = () => api<void>('/me/photo', { method: 'DELETE' })
export const heartbeat = () => api<void>('/me/seen', { method: 'POST' })

export const geo = {
  pincode: (pin: string) => api<PlaceHit>(`/geo/pincode/${pin}`, { auth: false }),
  reverse: (lat: number, lng: number) => api<PlaceHit>(`/geo/reverse?lat=${lat}&lng=${lng}`, { auth: false }),
  places: (q: string) => api<PlaceHit[]>(`/geo/places?q=${encodeURIComponent(q)}`, { auth: false }),
}

export interface DriverListItem extends DriverDetails {
  id: string
  name: string | null
  photo_url: string | null
  district: string | null
  state: string | null
  verified: boolean
  distance_km: number | null
  last_seen_at: string | null
}
export const listDrivers = (q: { vehicle?: string | null; verified?: boolean; offset?: number }) => {
  const p = new URLSearchParams()
  if (q.vehicle) p.set('vehicle', q.vehicle)
  if (q.verified) p.set('verified', 'true')
  if (q.offset) p.set('offset', String(q.offset))
  return api<{ items: DriverListItem[]; has_more: boolean }>(`/drivers?${p}`)
}
export const contactDriver = (id: string, via: 'call' | 'whatsapp') =>
  api<{ phone: string }>(`/drivers/${id}/contact`, { method: 'POST', json: { via } })
export const setAvailability = (is_available: boolean) =>
  api<{ is_available: boolean }>('/me/availability', { method: 'PATCH', json: { is_available } })

// ---- posts / jobs ----
export interface PostGroup { fleet_group_id: string; vehicle_type: string; wheels: number | null; drivers_needed: number }
export interface Post {
  id: string
  status: 'live' | 'under_check' | 'paused' | 'filled' | 'closed'
  savings_monthly: number
  savings_negotiable: boolean
  pay_mix: Record<string, number>
  base_cities: string[]
  coverage: 'local' | 'state' | 'near' | 'india' | null
  often_cities: string[]
  licence_type: 'LMV' | 'HMV' | 'Transport' | null
  min_experience: number | null
  work_type: 'full' | 'day' | 'trip' | null
  facilities: string[]
  check_flags: string[]
  created_at: string
  expires_at: string
  groups: PostGroup[]
}
export interface MyPost extends Post { interested: number; new_interested: number }
export interface Job extends Post {
  owner_id?: string
  owner_name: string | null
  business_name: string | null
  owner_photo?: string | null
  owner_district: string | null
  owner_state: string | null
  owner_verified: boolean
  distance_km: number | null
  interested: boolean
  interest_status?: 'sent' | 'seen' | 'not_suitable'
}
export interface PostIn {
  groups: { fleet_group_id: string; drivers_needed: number }[]
  work_type: 'full' | 'day' | 'trip'
  savings_monthly: number
  savings_negotiable: boolean
  pay_mix: Record<string, number>
  base_cities: string[]
  coverage: Post['coverage']
  often_cities: string[]
  licence_type: Post['licence_type']
  min_experience: number
  facilities: string[]
}
export interface InterestedDriver extends DriverListItem { interest_status: string; interested_at: string }

const qs = (q: { vehicle?: string | null; verified?: boolean; offset?: number }) => {
  const p = new URLSearchParams()
  if (q.vehicle) p.set('vehicle', q.vehicle)
  if (q.verified) p.set('verified', 'true')
  if (q.offset) p.set('offset', String(q.offset))
  return p.toString()
}
export const createPost = (body: PostIn) => api<{ id: string; status: Post['status']; check_flags: string[] }>('/posts', { method: 'POST', json: body })
export const myPosts = () => api<{ items: MyPost[] }>('/posts/mine')
export const setPostStatus = (id: string, status: 'live' | 'paused' | 'filled' | 'closed') => api<{ status: string }>(`/posts/${id}`, { method: 'PATCH', json: { status } })
export const postInterests = (id: string) => api<{ items: InterestedDriver[] }>(`/posts/${id}/interests`)
export const listJobs = (q: { vehicle?: string | null; verified?: boolean; offset?: number }) => api<{ items: Job[]; has_more: boolean }>(`/jobs?${qs(q)}`)
export const showInterest = (id: string) => api<{ interested: boolean }>(`/jobs/${id}/interest`, { method: 'POST' })
export const removeInterest = (id: string) => api<void>(`/jobs/${id}/interest`, { method: 'DELETE' })
export const contactOwner = (id: string, via: 'call' | 'whatsapp') => api<{ phone: string }>(`/jobs/${id}/contact`, { method: 'POST', json: { via } })
export const myInterests = () => api<{ items: Job[] }>('/me/interests')
