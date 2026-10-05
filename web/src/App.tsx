import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './lib/auth'
import { closeTopOverlay } from './lib/layout'
import { isNative } from './lib/platform'
import { listenNativeTaps } from './lib/push'
import Notifications from './pages/Notifications'
import Home from './pages/Home'
import Language from './pages/Language'
import Legal from './pages/Legal'
import Blocked from './pages/Blocked'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminQueue from './pages/admin/AdminQueue'
import AdminUsers from './pages/admin/AdminUsers'
import AdminImport from './pages/admin/AdminImport'
import AdminPosters from './pages/admin/AdminPosters'
import Invite from './pages/Invite'
import PublicJobs from './pages/PublicJobs'
import { inviteCode, takeNext } from './lib/share'
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

const PUBLIC = ['/language', '/login', '/otp']
// no login needed: live jobs and one shared job (Sprint 8)
const isPublicJobs = (p: string) => p === '/jobs' || /^\/jobs\/[A-Za-z0-9]{4,16}$/.test(p)
const OPEN = ['/legal'] // reachable in any state

export default function App() {
  const { status, profile, langChosen } = useAuth()
  const { t } = useTranslation()
  const loc = useLocation()

  const nav = useNavigate()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // a tapped push opens its screen (web: message from push-sw.js; Android app: Capacitor listener)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'vz-open' && typeof e.data.url === 'string') nav(new URL(e.data.url).pathname + new URL(e.data.url).search)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    void listenNativeTaps((url) => nav(url))
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [nav])
  // Android back button: close an open sheet first, then go back, and leave the app from a main tab.
  useEffect(() => {
    if (!isNative) return
    let remove: (() => void) | undefined
    void import('@capacitor/app').then(({ App: Cap }) => {
      void Cap.addListener('backButton', ({ canGoBack }) => {
        if (closeTopOverlay()) return
        const root = ['/home', '/admin', '/language', '/role'].includes(window.location.pathname)
        if (root || !canGoBack) void Cap.exitApp()
        else window.history.back()
      }).then((h) => { remove = () => void h.remove() })
    })
    return () => remove?.()
  }, [])

  // after login, go back to what they tapped (e.g. "Call" on a shared job)
  // (waits until the first setup screen is done, so a new user lands on the job right after it)
  useEffect(() => {
    if (status !== 'ready' || !profile?.setup_done) return
    const next = takeNext()
    if (next && next !== loc.pathname) nav(next, { replace: true })
  }, [status, profile?.setup_done]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') return <Splash />
  if (status === 'blocked') return <div className="grid h-full place-items-center p-6 text-center text-lg">{t('error.blocked')}</div>
  if (OPEN.includes(loc.pathname)) return <Routes><Route path="/legal" element={<Legal />} /></Routes>
  if (status === 'needsRole' && loc.pathname !== '/role') return <Navigate to="/role" replace />
  // signed out: language first only the very first time; then the live jobs (no login), or the
  // number straight away when they came from a personal invite
  if (status === 'signedOut') {
    if (isPublicJobs(loc.pathname)) return <Routes><Route path="/jobs" element={<PublicJobs />} /><Route path="/jobs/:code" element={<PublicJobs />} /></Routes>
    if (!PUBLIC.includes(loc.pathname)) return <Navigate to={!langChosen ? '/language' : inviteCode() ? '/login' : '/jobs'} replace />
  }
  if (status === 'ready' && loc.pathname === '/role') return <Navigate to="/home" replace />
  if (status === 'ready' && PUBLIC.includes(loc.pathname)) return <Navigate to="/home" replace />
  // Admins get the admin panel only (and settings, to log out).
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  if (status === 'ready' && isAdmin) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/queue" element={<AdminQueue />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/import" element={<AdminImport />} />
        <Route path="/admin/posters" element={<AdminPosters />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }
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
      <Route path="/blocked" element={<Blocked />} />
      <Route path="/soon" element={<Soon />} />
      <Route path="/posts" element={<MyPosts />} />
      <Route path="/posts/new" element={<PostNew />} />
      <Route path="/interests" element={<MyInterests />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/invite" element={<Invite />} />
      <Route path="/jobs" element={<Navigate to="/home" replace />} />
      <Route path="/jobs/:code" element={<PublicJobs />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
