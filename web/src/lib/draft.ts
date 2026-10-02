import { storage } from './storage'

/** Unfinished setup is kept on the phone, so closing the app does not lose answers. */
export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.getItem(`draft:${key}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveDraft(key: string, value: unknown) {
  void storage.setItem(`draft:${key}`, JSON.stringify(value)).catch(() => {})
}

export function clearDraft(key: string) {
  void storage.removeItem(`draft:${key}`).catch(() => {})
}
