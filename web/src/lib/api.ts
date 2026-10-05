import { brand } from './brand'
import { supabase } from './supabase'
import { toParams, type DriverQuery, type JobQuery } from './search'

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

/** Same as api() but returns the raw file (e.g. an Excel template). */
export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers({ 'X-Brand': brand.id, 'X-App-Version': __APP_VERSION__ })
  const { data } = await supabase.auth.getSession()
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  const res = await fetch(BASE + path, { headers })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.blob()
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
  /** YYYY-MM-DD, for the renewal reminder */
  licence_expiry?: string | null
}

export interface FleetGroup {
  id?: string
  vehicle_type: string
  wheels: number | null
  vehicle_count: number
  base_cities: string[]
}

export interface PlaceIn { district: string; state: string; pincode?: string | null; lat?: number | null; lng?: number | null }
export interface Me { exists: boolean; profile: Profile | null; driver?: DriverDetails | null; fleet?: FleetGroup[] | null; suggested_role?: 'driver' | 'owner' | null }
/** The first link this phone opened (job share, referral, QR poster, import invite). */
export interface Source { via: 'direct' | 'share' | 'ref' | 'poster' | 'invite'; code?: string | null }
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
export const startMe = (role: 'driver' | 'owner', lang: 'hi' | 'en', source?: Source | null) => api<Me>('/me', { method: 'POST', json: { role, lang, source: source || null } })
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
  rating_avg: number | null
  rating_count: number
  /** brought friends: shown first for a few days */
  top?: boolean
  /** confirmed jobs through the app */
  jobs_done?: number
}
/** A list page with search + filters: `total` = all matches, `place` = the city the list is centred on. */
export interface ListPage<T> { items: T[]; has_more: boolean; total?: number; place?: string | null }
type Paging = { offset?: number; limit?: number }
export const listDrivers = (q: DriverQuery, page: Paging = {}) => api<ListPage<DriverListItem>>(`/drivers?${toParams(q, page)}`)
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
  /** short code for the public / WhatsApp link (/j/<code>) */
  share_code?: string
}
export interface MyPost extends Post { interested: number; new_interested: number; views?: number; hired?: number }
export interface Job extends Post {
  owner_id?: string
  owner_name: string | null
  business_name: string | null
  owner_photo?: string | null
  owner_district: string | null
  owner_state: string | null
  owner_verified: boolean
  owner_rating_avg?: number | null
  owner_rating_count?: number
  owner_jobs_done?: number
  owner_fast_reply?: boolean
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

export const createPost = (body: PostIn) => api<{ id: string; status: Post['status']; check_flags: string[] }>('/posts', { method: 'POST', json: body })
export const myPosts = () => api<{ items: MyPost[] }>('/posts/mine')
export const setPostStatus = (id: string, status: 'live' | 'paused' | 'filled' | 'closed') => api<{ status: string }>(`/posts/${id}`, { method: 'PATCH', json: { status } })
export const postInterests = (id: string) => api<{ items: InterestedDriver[] }>(`/posts/${id}/interests`)
export const listJobs = (q: JobQuery, page: Paging = {}) => api<ListPage<Job>>(`/jobs?${toParams(q, page)}`)
export const showInterest = (id: string) => api<{ interested: boolean }>(`/jobs/${id}/interest`, { method: 'POST' })
export const removeInterest = (id: string) => api<void>(`/jobs/${id}/interest`, { method: 'DELETE' })
export const contactOwner = (id: string, via: 'call' | 'whatsapp') => api<{ phone: string }>(`/jobs/${id}/contact`, { method: 'POST', json: { via } })
export const myInterests = () => api<{ items: Job[] }>('/me/interests')

// ---- Sprint 8: no-login pages, sharing, referral ----
export interface PublicJob extends Omit<Post, 'check_flags'> {
  owner_district: string | null
  owner_state: string | null
  owner_verified: boolean
  owner_rating_avg: number | null
  owner_rating_count: number
  owner_jobs_done?: number
  owner_fast_reply?: boolean
  /** only on the single-job answer: still taking drivers */
  open?: boolean
}
/** A listed driver as an owner sees them before login: first name + initial, no photo / number / id. */
export interface PublicDriver extends DriverDetails {
  name: string | null; district: string | null; state: string | null; verified: boolean
  rating_avg: number | null; rating_count: number; jobs_done: number; top: boolean
}
export interface PublicStats { posts: number; drivers: number; posts_here: number; drivers_here: number; hired?: number; hired_here?: number; district: string | null }
export const pub = {
  jobs: (q: JobQuery, page: Paging = {}) => api<ListPage<PublicJob>>(`/public/jobs?${toParams(q, page)}`, { auth: false }),
  stats: (district?: string | null) => api<PublicStats>(`/public/stats${district ? `?district=${encodeURIComponent(district)}` : ''}`, { auth: false }),
  job: (code: string) => api<PublicJob>(`/public/jobs/${encodeURIComponent(code)}`, { auth: false }),
  invite: (code: string) => api<{ role: 'driver' | 'owner'; name: string | null; phone: string }>(`/public/invite/${encodeURIComponent(code)}`, { auth: false }),
  drivers: (q: DriverQuery, page: Paging = {}) => api<ListPage<PublicDriver>>(`/public/drivers?${toParams(q, page)}`, { auth: false }),
  driverStats: (district?: string | null) => api<{ drivers: number; drivers_here: number; ready_now: number; district: string | null }>(`/public/driver-stats${district ? `?district=${encodeURIComponent(district)}` : ''}`, { auth: false }),
  ref: (code: string) => api<{ name: string | null; photo_url: string | null; role: string | null }>(`/public/ref/${encodeURIComponent(code)}`, { auth: false }),
}
export interface Growth { ref_code: string; joined: number; completed: number; boost_until: string | null; boost_days: number; views_week: number; views_total: number; looking_due?: boolean }
export const myGrowth = () => api<Growth>('/me/growth')
export const recordView = (driverId: string) => api<void>(`/drivers/${driverId}/view`, { method: 'POST' })

// ---- Sprint 10: "got the job", job views, still looking, verification ----
export interface HireCandidate { id: string; name: string | null; photo_url: string | null; district: string | null; state: string | null; interested: boolean; hire_status: 'pending' | 'confirmed' | 'declined' | null }
export interface Hire { id: number; status: 'pending' | 'confirmed' | 'declined'; created_at: string; post_id: string | null; other_id: string; other_name: string | null; other_business: string | null; other_photo: string | null }
export const work = {
  candidates: (postId: string) => api<{ items: HireCandidate[] }>(`/posts/${postId}/hire-candidates`),
  markHired: (postId: string, driver_ids: string[]) => api<{ asked: number }>(`/posts/${postId}/hires`, { method: 'POST', json: { driver_ids } }),
  mine: () => api<{ items: Hire[] }>('/me/hires'),
  answer: (id: number, confirm: boolean) => api<{ status: string; available: boolean }>(`/hires/${id}/answer`, { method: 'POST', json: { confirm } }),
  viewJob: (postId: string) => api<void>(`/jobs/${postId}/view`, { method: 'POST' }),
  looking: (still: boolean) => api<{ is_available: boolean }>('/me/looking', { method: 'POST', json: { still } }),
}
export type VerifyReason = 'blurry' | 'mismatch' | 'wrong_doc' | 'expired' | 'other'
export interface Verification {
  verified: boolean
  status: 'none' | 'draft' | 'pending' | 'approved' | 'rejected'
  id?: number; kind?: 'driver_licence' | 'owner_business'; reason?: VerifyReason | null
  doc_url?: string | null; selfie_url?: string | null; submitted_at?: string | null; reviewed_at?: string | null
}
export interface VerifyItem { id: number; kind: 'driver_licence' | 'owner_business'; status: string; reason: VerifyReason | null; doc_url: string | null; selfie_url: string | null; submitted_at: string | null; profile_id: string; name: string | null; business_name: string | null; role: 'driver' | 'owner'; phone: string | null; photo_url: string | null; district: string | null; state: string | null }
export const verification = {
  mine: () => api<Verification>('/me/verification'),
  put: (part: 'doc' | 'selfie', jpeg: Blob) => api<Verification>(`/me/verification/${part}`, { method: 'PUT', body: jpeg, headers: { 'Content-Type': jpeg.type || 'image/jpeg' } }),
  submit: () => api<Verification>('/me/verification/submit', { method: 'POST' }),
}

// ---- admin ----
export interface AdminStats {
  days: number
  users: Record<'drivers' | 'owners' | 'new_today' | 'new_period' | 'active_today' | 'active_week' | 'online_now' | 'verified' | 'blocked' | 'drivers_listed', number>
  posts: Record<'live' | 'under_check' | 'filled' | 'drivers_wanted', number>
  interests: number
  contacts: { calls: number; whatsapp: number }
  signups: { day: string; drivers: number; owners: number }[]
  platforms: { platform: string; devices: number }[]
  installs: { pwa: number; apk: number; devices: number }
  funnel: Record<'opened' | 'otp_requested' | 'logged_in' | 'profile_basic' | 'took_action', number>
  time: { avg_minutes: number; sessions: number }
  cities: { district: string; state: string; drivers: number; owners: number }[]
  queue: number
  trust?: {
    hires: number; hires_waiting: number; hires_declined: number; rating_avg: number; ratings: number; ratings_worked: number
    verify_waiting: number; verify_hours: number; verified: number; d7: number; d30: number
  }
  growth?: {
    sources: { via: string; drivers: number; owners: number }[]
    shares: { jobs: number; cards: number; invites: number }
    public: { visitors: number; tapped: number; otp: number; joined: number }
  }
}
export interface Poster { id: number; code: string; place: string; district: string | null; state: string | null; created_at: string; opened: number; joined: number }
export interface QueuePost { id: string; check_flags: string[]; savings_monthly: number; base_cities: string[]; created_at: string; owner_id: string; owner_name: string | null; business_name: string | null; owner_phone: string | null; district: string | null; state: string | null; drivers_needed: number }
export interface QueueProfile { id: string; name: string | null; business_name: string | null; phone: string | null; role: string; district: string | null; state: string | null; check_flags: string[]; created_at: string }
export interface QueueReport { id: string; target_type: 'profile' | 'post'; target_id: string; reason: string; note: string | null; created_at: string; reporter_name: string | null; target_name: string | null; target_business: string | null; target_phone: string | null; target_profile_id: string | null; open_reports: number }
export interface AdminUser { id: string; name: string | null; business_name: string | null; phone: string | null; role: 'driver' | 'owner'; district: string | null; state: string | null; verified: boolean; blocked: boolean; is_test: boolean; setup_done: boolean; created_at: string; last_seen_at: string | null; posts: number; interests: number }

export const admin = {
  stats: (days: number) => api<AdminStats>(`/admin/stats?days=${days}`),
  queue: () => api<{ posts: QueuePost[]; profiles: QueueProfile[]; reports: QueueReport[] }>('/admin/queue'),
  reviewPost: (id: string, action: 'approve' | 'reject') => api(`/admin/posts/${id}/review`, { method: 'POST', json: { action } }),
  reviewReport: (id: string, action: 'dismiss' | 'block_target' | 'close_post') => api(`/admin/reports/${id}/review`, { method: 'POST', json: { action } }),
  reviewProfile: (id: string, action: 'clear' | 'block') => api(`/admin/profiles/${id}/review`, { method: 'POST', json: { action } }),
  users: (q: { q?: string; role?: string | null; flag?: string | null; offset?: number }) => {
    const p = new URLSearchParams()
    if (q.q) p.set('q', q.q)
    if (q.role) p.set('role', q.role)
    if (q.flag) p.set('flag', q.flag)
    if (q.offset) p.set('offset', String(q.offset))
    return api<{ items: AdminUser[]; has_more: boolean }>(`/admin/users?${p}`)
  },
  patchUser: (id: string, patch: { verified?: boolean; blocked?: boolean }) => api<{ verified: boolean; blocked: boolean }>(`/admin/users/${id}`, { method: 'PATCH', json: patch }),
  // bulk import (Sprint 7)
  upload: (role: 'driver' | 'owner', file: File, dryRun: boolean, source = '') => {
    const p = new URLSearchParams({ role, dry_run: String(dryRun), filename: file.name.slice(0, 120), source: source.slice(0, 120) })
    return api<ImportResult>(`/admin/imports?${p}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } })
  },
  imports: () => api<{ items: ImportRow[] }>('/admin/imports'),
  template: (role: 'driver' | 'owner') => apiBlob(`/admin/imports/template?role=${role}`),
  prospects: (q: { status?: ProspectStatus; role?: string | null; q?: string; import_id?: number | null; offset?: number }) => {
    const p = new URLSearchParams()
    if (q.status) p.set('status', q.status)
    if (q.role) p.set('role', q.role)
    if (q.q) p.set('q', q.q)
    if (q.import_id) p.set('import_id', String(q.import_id))
    if (q.offset) p.set('offset', String(q.offset))
    return api<{ items: Prospect[]; counts: Record<ProspectStatus, number>; has_more: boolean }>(`/admin/prospects?${p}`)
  },
  inviteConfig: () => api<{ sms: boolean; sms_dry_run: boolean; app_url: string | null; max_invites: number; gap_days: number }>('/admin/invite-config'),
  inviteSms: (body: { ids?: number[]; role?: string | null; import_id?: number | null }) => api<{ sent: number }>('/admin/prospects/invite-sms', { method: 'POST', json: body }),
  inviteWhatsapp: (id: number) => api<{ url: string; text: string }>(`/admin/prospects/${id}/whatsapp`, { method: 'POST', json: { app_url: window.location.origin } }),
  posters: () => api<{ items: Poster[] }>('/admin/posters'),
  verifications: () => api<{ items: VerifyItem[] }>('/admin/verifications'),
  reviewVerification: (id: number, action: 'approve' | 'reject', reason?: VerifyReason) =>
    api<{ status: string }>(`/admin/verifications/${id}/review`, { method: 'POST', json: { action, reason: reason || null } }),
  newPoster: (body: { place: string; district?: string | null; state?: string | null }) => api<Poster>('/admin/posters', { method: 'POST', json: body }),
  optOut: (id: number, opted_out: boolean) => api<{ opted_out: boolean }>(`/admin/prospects/${id}`, { method: 'PATCH', json: { opted_out } }),
}

export type ProspectStatus = 'all' | 'ready' | 'invited' | 'joined' | 'opted_out'
export interface ImportPreviewRow {
  row: number; status: 'new' | 'update' | 'on_app' | 'bad'; reason?: 'wrong_number' | 'repeated'
  phone: string | null; raw_phone: string; name: string | null; business_name: string | null
  district: string | null; state: string | null; vehicles: string[]; vehicle_count: number | null; warnings: string[]
}
export interface ImportResult {
  id?: number
  columns?: Record<string, string>
  ignored?: string[]
  counts: { new: number; update: number; on_app: number; bad: number; warnings: number; total: number }
  rows?: ImportPreviewRow[]
}
export interface ImportRow { id: number; role: 'driver' | 'owner'; filename: string | null; source: string | null; total: number; added: number; updated: number; on_app: number; bad: number; created_at: string; admin_name: string | null; people: number; invited: number; joined: number }
export interface Prospect {
  id: number; role: 'driver' | 'owner'; phone: string; name: string | null; business_name: string | null; district: string | null; state: string | null
  vehicles: string[]; vehicle_count: number | null; invites: number; last_invited_at: string | null; last_channel: 'sms' | 'whatsapp' | null
  opted_out: boolean; joined_at: string | null; created_at: string; can_invite: boolean
}

// ---- trust: reports, blocks, ratings ----
export type ReportReason = 'asked_money' | 'wrong_number' | 'fake' | 'behaviour' | 'other'
export const sendReport = (target_type: 'profile' | 'post', target_id: string, reason: ReportReason, note?: string) =>
  api<{ reported: boolean }>('/reports', { method: 'POST', json: { target_type, target_id, reason, note: note || null } })
export const blockPerson = (id: string) => api<{ blocked: boolean }>(`/blocks/${id}`, { method: 'POST' })
export const unblockPerson = (id: string) => api<void>(`/blocks/${id}`, { method: 'DELETE' })
export interface BlockedPerson { id: string; name: string | null; business_name: string | null; role: string; photo_url: string | null; created_at: string }
export const myBlocks = () => api<{ items: BlockedPerson[] }>('/me/blocks')
export interface ToRate { id: string; name: string | null; business_name: string | null; role: 'driver' | 'owner'; photo_url: string | null; last_contact: string; worked?: boolean }
export const toRate = () => api<{ items: ToRate[] }>('/me/to-rate')
export const ratePerson = (ratee_id: string, stars: number, tags: string[]) => api<{ rated: boolean }>('/ratings', { method: 'POST', json: { ratee_id, stars, tags } })

// ---------------------------------------------------------------- notifications (Sprint 6)
export type NotifKind = 'new_post' | 'new_interest' | 'interest_seen' | 'post_live' | 'post_rejected' | 'profile_views' | 'licence_expiry' | 'referral_joined'
  | 'hire_confirm' | 'hire_done' | 'verify_result' | 'weekly_jobs' | 'post_views' | 'come_back' | 'still_looking'
export interface Notif {
  id: number
  kind: NotifKind
  data: { post_id?: string; owner?: string; driver?: string; driver_id?: string; vehicles_raw?: string[]; n?: number; savings?: string; days?: number; date?: string; name?: string; ok?: boolean; reason?: string; hire_id?: number }
  read_at: string | null
  created_at: string
}
export type NotifyPrefs = { new_post: boolean; new_interest: boolean; interest_seen: boolean }
export const notifications = {
  list: (before?: number) => api<{ items: Notif[]; unread: number; has_more: boolean }>(`/notifications${before ? `?before=${before}` : ''}`),
  unread: () => api<{ unread: number }>('/notifications/unread'),
  read: (ids?: number[]) => api<void>('/notifications/read', { method: 'POST', json: { ids } }),
  pushConfig: () => api<{ webpush: boolean; fcm: boolean; vapid_public_key: string | null }>('/push/config', { auth: false }),
  subscribe: (kind: 'webpush' | 'fcm', endpoint: string, keys: Record<string, string> = {}) =>
    api<{ subscribed: boolean }>('/push/subscribe', { method: 'POST', json: { kind, endpoint, keys } }),
  unsubscribe: (endpoint: string) => api<void>('/push/unsubscribe', { method: 'POST', json: { endpoint } }),
  prefs: () => api<NotifyPrefs>('/me/notify-prefs'),
  setPrefs: (p: Partial<NotifyPrefs>) => api<NotifyPrefs>('/me/notify-prefs', { method: 'PATCH', json: p }),
}
