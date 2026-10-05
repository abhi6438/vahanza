import { api } from './api'
import { isNative } from './platform'
import { storage } from './storage'

/**
 * Sprint 11: MPIN (6 digits) + the APK app lock.
 *
 * Server: the real MPIN check (login without OTP, 5 wrong tries = 30 min lock).
 * Phone (APK only): a slow hash of the MPIN so the lock screen also works without internet,
 * plus the lock settings. Fingerprint / face unlock comes from Android itself.
 */
export type PinSession = { access_token: string; refresh_token: string }
export type MyPin = { has_pin: boolean; set_at: string | null; locked_until: string | null; can_reset: boolean; required: boolean }

export const pinApi = {
  check: (phone10: string) => api<{ has_pin: boolean; locked_until: string | null }>('/auth/pin/check', { method: 'POST', json: { phone: phone10 }, auth: false }),
  login: (phone10: string, pin: string) => api<PinSession>('/auth/pin/login', { method: 'POST', json: { phone: phone10, pin }, auth: false }),
  mine: () => api<MyPin>('/me/pin'),
  set: (pin: string, old_pin?: string) => api<{ ok: boolean }>('/me/pin', { method: 'PUT', json: { pin, old_pin } }),
  verify: (pin: string) => api<{ ok: boolean }>('/me/pin/verify', { method: 'POST', json: { pin } }),
  adminReset: (userId: string) => api<{ ok: boolean }>(`/admin/users/${userId}/pin`, { method: 'DELETE' }),
}

/** Same rule as the API: no 111111 / 123456 / 654321 / 121212. */
/** MPIN length (4 digits; any number is allowed). */
export const PIN_LEN = 4

/** Kept for reference: easy numbers are allowed (decided 5 Oct 2026). */
export function tooSimple(pin: string) {
  if (new Set(pin).size <= 2) return true
  const d = [...pin].map(Number)
  const steps = new Set(d.slice(1).map((v, i) => v - d[i]))
  return steps.size === 1 && (steps.has(1) || steps.has(-1))
}

// ---------------------------------------------------------------- what to show after login
/** 'new' = offer to create an MPIN, 'reset' = forgot MPIN (just verified by OTP). Cleared when done or skipped. */
const ASK = 'vz-pin-ask'
export const setPinAsk = (v: 'new' | 'reset') => storage.setItem(ASK, v)
export const getPinAsk = async () => (await storage.getItem(ASK)) as 'new' | 'reset' | null
export const clearPinAsk = () => storage.removeItem(ASK)
const SKIPPED = 'vz-pin-skipped'
export const setPinSkipped = () => storage.setItem(SKIPPED, String(Date.now()))
export const pinSkipped = async () => !!(await storage.getItem(SKIPPED))
export const clearPinSkipped = () => storage.removeItem(SKIPPED)

/** Number typed last time on this phone (returning users don't type it again). */
export const LAST_PHONE = 'vz-last-phone'

// ---------------------------------------------------------------- APK lock (local)
const LOCAL = 'vz-lock-pin'      // { uid, salt, hash } — PBKDF2 of the MPIN, never the MPIN itself
const LOCK_ON = 'vz-lock-on'     // '0' = the person turned the lock off
const BIO_ON = 'vz-lock-bio'     // '0' = don't offer fingerprint
export const LOCK_AFTER_MS = 5 * 60_000
export const LOCAL_MAX_FAILS = 5

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 150_000 }, key, 256)
}

/** Keeps a hash of the MPIN on this phone (APK only) so the lock screen works offline. */
export async function saveLocalPin(uid: string, pin: string) {
  if (!isNative || !crypto?.subtle) return
  const salt = crypto.getRandomValues(new Uint8Array(16))
  await storage.setItem(LOCAL, JSON.stringify({ uid, salt: b64(salt), hash: b64(await derive(pin, salt)), at: Date.now() }))
  lockChanged()
}

/** Tells the lock screen to look at its settings again (MPIN made, lock switched on/off). */
export const LOCK_EVENT = 'vz-lock-changed'
const lockChanged = () => window.dispatchEvent(new Event(LOCK_EVENT))

/** true / false, or null when this phone has no copy (MPIN set on another phone: check online). */
export async function checkLocalPin(uid: string, pin: string): Promise<boolean | null> {
  try {
    const v = JSON.parse((await storage.getItem(LOCAL)) || 'null') as { uid: string; salt: string; hash: string } | null
    if (!v || v.uid !== uid) return null
    return b64(await derive(pin, unb64(v.salt))) === v.hash
  } catch {
    return null
  }
}

export async function hasLocalPin(uid: string) {
  try { return (JSON.parse((await storage.getItem(LOCAL)) || 'null') as { uid: string } | null)?.uid === uid } catch { return false }
}

/** The MPIN was changed on another phone (or removed by an admin) after this phone saved its copy. */
export async function localPinStale(uid: string, serverSetAt: string | null) {
  try {
    const v = JSON.parse((await storage.getItem(LOCAL)) || 'null') as { uid: string; at?: number } | null
    if (!v || v.uid !== uid) return false
    return !serverSetAt || new Date(serverSetAt).getTime() > (v.at || 0) + 120_000   // 2 min for clock differences
  } catch {
    return false
  }
}

export const clearLocalPin = () => storage.removeItem(LOCAL)
export const lockEnabled = async () => (await storage.getItem(LOCK_ON)) !== '0'
export const setLockEnabled = async (on: boolean) => { await storage.setItem(LOCK_ON, on ? '1' : '0'); lockChanged() }
export const bioEnabled = async () => (await storage.getItem(BIO_ON)) !== '0'
export const setBioEnabled = async (on: boolean) => { await storage.setItem(BIO_ON, on ? '1' : '0'); lockChanged() }

// ---------------------------------------------------------------- fingerprint / face (Android)
export async function bioAvailable(): Promise<boolean> {
  if (!isNative) return false
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    return (await NativeBiometric.isAvailable()).isAvailable
  } catch {
    return false
  }
}

/** Shows Android's fingerprint / face sheet. true = it was the owner of the phone. */
export async function bioVerify(texts: { title: string; subtitle: string; cancel: string }): Promise<boolean> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    await NativeBiometric.verifyIdentity({ title: texts.title, subtitle: texts.subtitle, negativeButtonText: texts.cancel, maxAttempts: 3 })
    return true
  } catch {
    return false
  }
}
