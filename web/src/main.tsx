import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './i18n'
import { ToastProvider } from './components/toast'
import { AuthProvider } from './lib/auth'
import { applyBrandColors } from './lib/brand'
import { loadTheme } from './lib/theme'
import { captureSource } from './lib/share'
import { isNative } from './lib/platform'
import { initTracking } from './lib/track'
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
void initTracking()

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
