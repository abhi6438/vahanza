import type { Source } from './api'
import { isNative } from './platform'
import { track } from './track'

/**
 * Sprint 8: short public links, "where did this person come from", and sharing to WhatsApp.
 *   /j/<code> a job · /r/<code> an invite from a friend · /q/<code> a QR poster (see api/vz/routes/share.py)
 */

/** Address people can open from WhatsApp. The APK runs on https://localhost, so it uses the live server. */
export function publicBase() {
  const env = import.meta.env.VITE_PUBLIC_URL || (isNative ? import.meta.env.VITE_API_URL : '')
  return String(env || window.location.origin).replace(/\/$/, '')
}
export const jobLink = (code: string) => `${publicBase()}/j/${code}`
export const refLink = (code: string) => `${publicBase()}/r/${code}`
export const posterLink = (code: string) => `${publicBase()}/q/${code}`

// ---------------------------------------------------------------- attribution
const SRC = 'vz-src'
const INVITE = 'vz-invite-code'
const NEXT = 'vz-next'

const get = (k: string, session = false) => { try { return (session ? sessionStorage : localStorage).getItem(k) } catch { return null } }
const set = (k: string, v: string, session = false) => { try { (session ? sessionStorage : localStorage).setItem(k, v) } catch { /* storage blocked */ } }
const del = (k: string, session = false) => { try { (session ? sessionStorage : localStorage).removeItem(k) } catch { /* storage blocked */ } }
const clean = (c: string | null) => (c || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16)

/** Called once at start-up, before any redirect: remembers the first link this phone came from. */
export function captureSource(loc: Location = window.location) {
  const q = new URLSearchParams(loc.search)
  const job = loc.pathname.match(/^\/jobs\/([A-Za-z0-9]{4,16})$/)
  let src: Source | null = null
  if (q.get('ref')) src = { via: 'ref', code: clean(q.get('ref')).toUpperCase() }
  else if (q.get('poster')) src = { via: 'poster', code: clean(q.get('poster')) }
  else if (q.get('inv') && q.get('p')) src = { via: 'invite', code: clean(q.get('p')) }
  else if (job && q.get('s') === 'share') src = { via: 'share', code: job[1] }
  if (src?.via === 'invite' && src.code) set(INVITE, src.code, true)
  if (!src?.code) return
  if (!get(SRC)) set(SRC, JSON.stringify(src))   // first link wins
  track('attributed', { via: src.via, code: src.code })
}

export function getSource(): Source | null {
  try { return JSON.parse(get(SRC) || 'null') } catch { return null }
}
export const clearSource = () => del(SRC)
export const inviteCode = () => get(INVITE, true)
export const clearInvite = () => del(INVITE, true)
export const referralCode = () => { const s = getSource(); return s?.via === 'ref' ? s.code || null : null }

/** Where to go after login (e.g. back to the job whose "Call" was tapped). */
export const setNext = (path: string) => set(NEXT, path, true)
export function takeNext() { const n = get(NEXT, true); del(NEXT, true); return n && n.startsWith('/') ? n : null }

// ---------------------------------------------------------------- sharing
/** Opens WhatsApp with the text (people pick a chat or a group). Works on web and in the APK. */
export function shareWhatsApp(text: string, kind: 'job_share' | 'card_share' | 'ref_share', props: Record<string, unknown> = {}) {
  track(kind, { via: 'whatsapp', ...props })
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

/** The phone's own share sheet (Telegram, SMS, Facebook...). Falls back to WhatsApp. */
export async function shareOther(text: string, kind: 'job_share' | 'card_share' | 'ref_share', props: Record<string, unknown> = {}) {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ text })
    } else if (navigator.share) {
      await navigator.share({ text })
    } else {
      return shareWhatsApp(text, kind, props)
    }
    track(kind, { via: 'sheet', ...props })
  } catch { /* closed the sheet */ }
}

export const canShareSheet = () => isNative || typeof navigator.share === 'function'

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Shares an image (the driver's card) so it can be put on WhatsApp Status.
 * APK: saved to the app cache, then the Android share sheet. Phone browser: share sheet with the file.
 * Elsewhere (computer): downloaded. Returns what happened.
 */
export async function shareImage(blob: Blob, name: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    if (isNative) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
      const file = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache })
      await Share.share({ files: [file.uri], text })
      return 'shared'
    }
    const file = new File([blob], name, { type: blob.type || 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || /cancel/i.test(String((e as Error)?.message))) return 'cancelled'
  }
  downloadBlob(blob, name)
  return 'downloaded'
}
