import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './i18n'
import { ToastProvider } from './components/toast'
import { AuthProvider } from './lib/auth'
import { applyBrandColors, refreshBrandTheme } from './lib/brand'
import { getPublishedTheme } from './lib/api'
import { loadTheme } from './lib/theme'
import { captureSource } from './lib/share'
import { isNative } from './lib/platform'
import { initTracking } from './lib/track'
import { registerSW } from 'virtual:pwa-register'
// fonts are bundled (the APK works offline): Anek for headings, Mukta for text — both cover Hindi + English
import '@fontsource-variable/anek-latin/wght.css'
import '@fontsource-variable/anek-devanagari/wght.css'
import '@fontsource/mukta/400.css'
import '@fontsource/mukta/500.css'
import '@fontsource/mukta/600.css'
import '@fontsource/mukta/700.css'
import './styles.css'

applyBrandColors()
// the Android app keeps touch sizes even on a big tablet (desktop density is for the web only)
if (isNative) document.documentElement.dataset.native = '1'
// invite link from a bulk-import SMS / WhatsApp (…/?inv=driver): remember the role before any redirect
try {
  const inv = new URLSearchParams(window.location.search).get('inv')
  if (inv === 'driver' || inv === 'owner') sessionStorage.setItem('vz-inv', inv)
} catch { /* storage blocked: the person just picks the role */ }
// job share / friend's invite / QR poster: remember the first link (sent with the first login)
captureSource()
void loadTheme()
// brand colours published by an admin: applied from the device cache at once, then checked with the server
// (on start and when the app comes back to the front, at most every 5 minutes) — no new build needed
void refreshBrandTheme(getPublishedTheme)
let themeCheckedAt = Date.now()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - themeCheckedAt > 5 * 60_000) {
    themeCheckedAt = Date.now()
    void refreshBrandTheme(getPublishedTheme)
  }
})
void initTracking()
// offline cache (web): when a new version is deployed the new service worker takes over at once and the
// page reloads by itself; it also checks for a new version every 30 minutes while the app stays open.
// In the APK build this registers a worker that removes itself (the APK ships its own files).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (reg) window.setInterval(() => { if (navigator.onLine) void reg.update() }, 30 * 60_000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
