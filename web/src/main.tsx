import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './i18n'
import { AuthProvider } from './lib/auth'
import { applyBrandColors } from './lib/brand'
import { loadTheme } from './lib/theme'
import { initTracking } from './lib/track'
import './styles.css'

applyBrandColors()
void loadTheme()
void initTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
