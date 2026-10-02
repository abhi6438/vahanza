import { Preferences } from '@capacitor/preferences'
import { isNative } from './platform'

/**
 * Key-value storage used for the login session and small settings.
 * Android app: Capacitor Preferences (app-private storage, survives restarts).
 * Web: localStorage, with a memory fallback when the browser blocks storage.
 */
const memory = new Map<string, string>()

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isNative) return (await Preferences.get({ key })).value
    try {
      return window.localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isNative) return Preferences.set({ key, value })
    try {
      window.localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  async removeItem(key: string): Promise<void> {
    if (isNative) return Preferences.remove({ key })
    try {
      window.localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  },
}
