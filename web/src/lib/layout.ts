import { useSyncExternalStore } from 'react'
import { isNative } from './platform'

/**
 * Layout mode drives STRUCTURE (which navigation, how many columns), not just sizes.
 *   mobile  < 768px            bottom tabs, one column
 *   tablet  768–1023px          bottom tabs, wider page, 2-column grids
 *   desktop ≥ 1024px            sidebar + top bar, multi-column pages
 * The Android app is always mobile/tablet (never the desktop shell), whatever the screen size.
 */
export type Layout = 'mobile' | 'tablet' | 'desktop'

const DESKTOP = '(min-width: 1024px)'
const TABLET = '(min-width: 768px)'

function read(): Layout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'mobile'
  const wide = window.matchMedia(TABLET).matches
  if (isNative) return wide ? 'tablet' : 'mobile'
  if (window.matchMedia(DESKTOP).matches) return 'desktop'
  return wide ? 'tablet' : 'mobile'
}

function subscribe(cb: () => void) {
  const mqs = [window.matchMedia(DESKTOP), window.matchMedia(TABLET)]
  mqs.forEach((m) => m.addEventListener('change', cb))
  return () => mqs.forEach((m) => m.removeEventListener('change', cb))
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, read, () => 'mobile')
}

export const useIsDesktop = () => useLayout() === 'desktop'

/**
 * Open overlays (dialogs / sheets) register here so the Android back button closes the
 * top-most one before navigating back.
 */
const overlays: (() => void)[] = []
export function pushOverlay(close: () => void) {
  overlays.push(close)
  return () => {
    const i = overlays.lastIndexOf(close)
    if (i >= 0) overlays.splice(i, 1)
  }
}
export function closeTopOverlay(): boolean {
  const close = overlays[overlays.length - 1]
  if (!close) return false
  close()
  return true
}
