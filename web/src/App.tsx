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
import MyInterests from './pages/MyInterests'
import MyPosts from './pages/MyPosts'
import PostNew from './pages/PostNew'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Soon from './pages/Soon'
import Setup from './pages/Setup'
import Splash from './pages/Splash'

const PUBLIC = ['/language', '/role', '/login', '/otp']
const OPEN = ['/legal'] // reachable in any state

export default function App() {
  const { status, profile } = useAuth()
  const { t } = useTranslation()
  const loc = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  if (status === 'loading') return <Splash />
  if (status === 'blocked') return <div className="grid h-full place-items-center p-6 text-center text-lg">{t('error.blocked')}</div>
  if (OPEN.includes(loc.pathname)) return <Routes><Route path="/legal" element={<Legal />} /></Routes>
  if (status === 'needsRole' && loc.pathname !== '/role') return <Navigate to="/role" replace />
  if (status === 'signedOut' && !PUBLIC.includes(loc.pathname)) return <Navigate to="/language" replace />
  if (status === 'ready' && PUBLIC.includes(loc.pathname)) return <Navigate to="/home" replace />
  // First-time setup comes before everything else (settings stay reachable, e.g. to log out).
  if (status === 'ready' && profile && !profile.setup_done && !['/setup', '/settings'].includes(loc.pathname)) return <Navigate to="/setup" replace />

  return (
    <Routes>
      <Route path="/language" element={<Language />} />
      <Route path="/role" element={<Role />} />
      <Route path="/login" element={<Login />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/home" element={<Home />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/soon" element={<Soon />} />
      <Route path="/posts" element={<MyPosts />} />
      <Route path="/posts/new" element={<PostNew />} />
      <Route path="/interests" element={<MyInterests />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
