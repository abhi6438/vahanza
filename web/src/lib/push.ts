import { notifications } from './api'
import { isNative } from './platform'
import { storage } from './storage'
import { track } from './track'

/**
 * Phone push.
 * Web / PWA: browser push with our VAPID key (service worker: public/push-sw.js).
 * Android APK: Firebase (FCM) through @capacitor/push-notifications.
 * The in-app bell works without any of this.
 */
export type PushState = 'on' | 'off' | 'denied' | 'unsupported'
const KEY = 'vz-push-endpoint'

function webSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  try {
    const cfg = await notifications.pushConfig()
    if (isNative) {
      if (!cfg.fcm) return 'unsupported'
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const p = await PushNotifications.checkPermissions()
      if (p.receive === 'denied') return 'denied'
      return p.receive === 'granted' && (await storage.getItem(KEY)) ? 'on' : 'off'
    }
    if (!cfg.webpush || !webSupported()) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub && Notification.permission === 'granted' ? 'on' : 'off'
  } catch {
    return 'unsupported'
  }
}

/** Asks the phone for permission and registers this device. Returns the new state. */
export async function enablePush(from: string): Promise<PushState> {
  track('push_ask', { from })
  try {
    if (isNative) return await enableNative()
    const cfg = await notifications.pushConfig()
    if (!cfg.webpush || !cfg.vapid_public_key || !webSupported()) return 'unsupported'
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      track('push_result', { result: perm })
      return perm === 'denied' ? 'denied' : 'off'
    }
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapid_public_key) }))
    const json = sub.toJSON()
    await notifications.subscribe('webpush', sub.endpoint, (json.keys || {}) as Record<string, string>)
    await storage.setItem(KEY, sub.endpoint)
    track('push_result', { result: 'granted' })
    return 'on'
  } catch {
    track('push_result', { result: 'error' })
    return 'off'
  }
}

async function enableNative(): Promise<PushState> {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  let p = await PushNotifications.checkPermissions()
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions()
  if (p.receive !== 'granted') return p.receive === 'denied' ? 'denied' : 'off'
  // the API sends to channel "default" with high priority so it pops up like a call/SMS alert
  await PushNotifications.createChannel({ id: 'default', name: 'Alerts', importance: 4, visibility: 1 }).catch(() => {})
  const token = await new Promise<string>((resolve, reject) => {
    void PushNotifications.addListener('registration', (t) => resolve(t.value))
    void PushNotifications.addListener('registrationError', (e) => reject(new Error(e.error)))
    void PushNotifications.register()
    setTimeout(() => reject(new Error('timeout')), 15000)
  })
  await notifications.subscribe('fcm', token)
  await storage.setItem(KEY, token)
  track('push_result', { result: 'granted' })
  return 'on'
}

/** Stop push on this device (also used on logout so the next person on this phone gets nothing). */
export async function disablePush(): Promise<void> {
  try {
    const endpoint = await storage.getItem(KEY)
    if (endpoint) await notifications.unsubscribe(endpoint).catch(() => {})
    await storage.removeItem(KEY)
    if (!isNative && webSupported()) {
      const reg = await navigator.serviceWorker.getRegistration()
      await (await reg?.pushManager.getSubscription())?.unsubscribe()
    }
  } catch {
    /* best effort */
  }
}

/** Android app: open the right screen when a push is tapped. Call once at start. */
export async function listenNativeTaps(go: (url: string) => void) {
  if (!isNative) return
  const { PushNotifications } = await import('@capacitor/push-notifications')
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = (a.notification.data as { url?: string } | undefined)?.url
    if (url) go(url)
  })
}
