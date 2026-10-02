import { Device } from '@capacitor/device'
import { api } from './api'
import { browserName, isNative, isStandalone, osName, platform } from './platform'
import { storage } from './storage'

/**
 * Analytics: events are queued on the phone and sent in one batch every 30 s
 * (and when the app goes to the background). Never put phone numbers or names in props.
 */
type Ev = { name: string; screen?: string; props?: Record<string, unknown>; ts: string }

const queue: Ev[] = []
const sessionId = crypto.randomUUID()
let anonId = ''
let context: Record<string, unknown> | null = null
let timer: number | undefined
let currentScreen = ''

async function getContext() {
  if (context) return context
  let device: string | undefined
  let os = osName()
  if (isNative) {
    const info = await Device.getInfo()
    device = `${info.manufacturer} ${info.model}`
    os = `${info.operatingSystem} ${info.osVersion}`
  }
  context = {
    platform: platform(),
    os,
    browser: isNative ? 'App' : browserName(),
    device,
    app_version: __APP_VERSION__,
    standalone: isNative ? true : isStandalone(),
  }
  return context
}

export async function initTracking() {
  anonId = (await storage.getItem('anon-id')) || crypto.randomUUID()
  await storage.setItem('anon-id', anonId)
  track('app_open')
  timer = window.setInterval(flush, 30_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      track('app_hidden')
      void flush()
    } else track('app_visible')
  })
}

export function track(name: string, props: Record<string, unknown> = {}) {
  queue.push({ name, screen: currentScreen || undefined, props, ts: new Date().toISOString() })
  if (queue.length >= 50) void flush()
}

export function trackScreen(screen: string) {
  currentScreen = screen
  track('screen_view')
}

export async function flush() {
  if (!queue.length || !anonId) return
  const events = queue.splice(0, 100)
  try {
    await api('/events', { method: 'POST', json: { anon_id: anonId, session_id: sessionId, context: await getContext(), events } })
  } catch {
    queue.unshift(...events.slice(-200)) // keep for the next try (weak network)
  }
}

export function stopTracking() {
  if (timer) window.clearInterval(timer)
}
