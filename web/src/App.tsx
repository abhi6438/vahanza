import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './lib/auth'
import Home from './pages/Home'
import Language from './pages/Language'
import Legal from './pages/Legal'
import Login from './pages/Login'
import Otp from './pages/Otp'
import Role from './pages/Role'
import Settings from './pages/Settings'
import Splash from './pages/Splash'

const PUBLIC = ['/language', '/role', '/login', '/otp']
const OPEN = ['/legal'] // reachable in any state

export default function App() {
  const { status } = useAuth()
  const { t } = useTranslation()
  const loc = useLocation()

  useEffect(() => window.scrollTo(0, 0), [loc.pathname])

  if (status === 'loading') return <Splash />
  if (status === 'blocked') return <div className="grid h-full place-items-center p-6 text-center text-lg">{t('error.blocked')}</div>
  if (OPEN.includes(loc.pathname)) return <Routes><Route path="/legal" element={<Legal />} /></Routes>
  if (status === 'needsRole' && loc.pathname !== '/role') return <Navigate to="/role" replace />
  if (status === 'signedOut' && !PUBLIC.includes(loc.pathname)) return <Navigate to="/language" replace />
  if (status === 'ready' && PUBLIC.includes(loc.pathname)) return <Navigate to="/home" replace />

  return (
    <Routes>
      <Route path="/language" element={<Language />} />
      <Route path="/role" element={<Role />} />
      <Route path="/login" element={<Login />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/home" element={<Home />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
