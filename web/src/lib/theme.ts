import { storage } from './storage'

export type ThemePref = 'system' | 'light' | 'dark'

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

export async function loadTheme(): Promise<ThemePref> {
  const v = (await storage.getItem('theme')) as ThemePref | null
  const pref = v === 'light' || v === 'dark' ? v : 'system'
  applyTheme(pref)
  return pref
}

export async function saveTheme(pref: ThemePref) {
  applyTheme(pref)
  await storage.setItem('theme', pref)
}

export function isDarkNow(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
