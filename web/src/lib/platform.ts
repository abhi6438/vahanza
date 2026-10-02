import { Capacitor } from '@capacitor/core'

export type Platform = 'android_app' | 'ios_app' | 'web_mobile' | 'web_desktop' | 'ios_web'

export const isNative = Capacitor.isNativePlatform()

export function platform(): Platform {
  if (isNative) return Capacitor.getPlatform() === 'ios' ? 'ios_app' : 'android_app'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios_web'
  if (/Android|Mobile/i.test(ua)) return 'web_mobile'
  return 'web_desktop'
}

/** True when the web app was opened from the home screen (installed PWA). */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function browserName(): string {
  const ua = navigator.userAgent
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet'
  if (/UCBrowser/i.test(ua)) return 'UC Browser'
  if (/OPR|Opera/i.test(ua)) return 'Opera'
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox'
  if (/CriOS|Chrome/i.test(ua)) return 'Chrome'
  if (/Safari/i.test(ua)) return 'Safari'
  return 'Other'
}

export function osName(): string {
  const ua = navigator.userAgent
  const a = ua.match(/Android\s([\d.]+)/i)
  if (a) return `Android ${a[1].split('.')[0]}`
  const i = ua.match(/OS (\d+)_/i)
  if (/iPhone|iPad/i.test(ua) && i) return `iOS ${i[1]}`
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Other'
}
