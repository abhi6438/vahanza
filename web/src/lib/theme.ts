import { storage } from './storage'

export type ThemePref = 'system' | 'light' | 'dark'

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

// The person's own choice wins; without one, the brand's default mode (Admin → Appearance) is used.
let userPref: ThemePref | null = null
let brandMode: ThemePref = 'system'

export function setBrandMode(mode: ThemePref) {
  brandMode = mode
  if (!userPref) applyTheme(mode)
}

export async function loadTheme(): Promise<ThemePref> {
  const v = (await storage.getItem('theme')) as ThemePref | null
  userPref = v === 'light' || v === 'dark' || v === 'system' ? v : null
  const pref = userPref ?? brandMode
  applyTheme(pref)
  return pref
}

export async function saveTheme(pref: ThemePref) {
  userPref = pref
  applyTheme(pref)
  await storage.setItem('theme', pref)
}

export function isDarkNow(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
