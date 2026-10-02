import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import i18n from '../i18n'
import { ApiError, getMe, heartbeat, startMe, type Profile } from './api'
import { storage } from './storage'
import { isValidIndianMobile, supabase, toE164 } from './supabase'
import { track } from './track'

export type Role = 'driver' | 'owner'
export type Lang = 'hi' | 'en'
type Status = 'loading' | 'signedOut' | 'needsRole' | 'ready' | 'blocked'

interface AuthState {
  status: Status
  session: Session | null
  profile: Profile | null
  lang: Lang
  pendingRole: Role | null
  setLang: (l: Lang) => Promise<void>
  setPendingRole: (r: Role) => void
  sendOtp: (phone10: string) => Promise<void>
  verifyOtp: (phone10: string, code: string) => Promise<void>
  chooseRole: (r: Role) => Promise<void>
  logout: (everywhere?: boolean) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [lang, setLangState] = useState<Lang>('hi')
  const [pendingRole, setPendingRoleState] = useState<Role | null>(null)

  const loadProfile = useCallback(async () => {
    try {
      const me = await getMe()
      if (me.exists && me.profile?.role) {
        setProfile(me.profile)
        setStatus('ready')
      } else setStatus('needsRole')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await supabase.auth.signOut({ scope: 'local' })
        setStatus('signedOut')
      } else if (e instanceof ApiError && e.status === 403) setStatus('blocked')
      else throw e
    }
  }, [])

  // Start-up: restore language, role choice and the saved login session.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const l = ((await storage.getItem('lang')) as Lang | null) || 'hi'
      setLangState(l)
      await i18n.changeLanguage(l)
      const r = (await storage.getItem('pending-role')) as Role | null
      if (r) setPendingRoleState(r)
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      setSession(data.session)
      if (data.session) {
        try {
          await loadProfile()
        } catch {
          setStatus('needsRole') // API unreachable: let the user continue, profile reloads later
        }
      } else setStatus('signedOut')
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setStatus('signedOut')
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  // "Online now": heartbeat every 3 minutes while the app is open and logged in.
  useEffect(() => {
    if (status !== 'ready') return
    void heartbeat().catch(() => {})
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void heartbeat().catch(() => {})
    }, 180_000)
    return () => window.clearInterval(id)
  }, [status])

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l)
    await i18n.changeLanguage(l)
    document.documentElement.lang = l
    await storage.setItem('lang', l)
    track('language_set', { lang: l })
  }, [])

  const setPendingRole = useCallback((r: Role) => {
    setPendingRoleState(r)
    void storage.setItem('pending-role', r)
    track('role_picked', { role: r })
  }, [])

  const sendOtp = useCallback(async (phone10: string) => {
    if (!isValidIndianMobile(phone10)) throw new Error('invalid-phone')
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone10), options: { shouldCreateUser: true } })
    if (error) throw error
    track('otp_requested')
  }, [])

  const verifyOtp = useCallback(
    async (phone10: string, code: string) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(phone10), token: code, type: 'sms' })
      if (error || !data.session) throw error || new Error('no-session')
      setSession(data.session)
      track('otp_verified')
      const me = await getMe()
      if (me.exists && me.profile?.role) {
        setProfile(me.profile)
        setStatus('ready')
        return
      }
      if (pendingRole) {
        const res = await startMe(pendingRole, lang)
        setProfile(res.profile)
        setStatus('ready')
        track('signup_complete', { role: pendingRole })
        await storage.removeItem('pending-role')
      } else setStatus('needsRole')
    },
    [pendingRole, lang],
  )

  const chooseRole = useCallback(
    async (r: Role) => {
      const res = await startMe(r, lang)
      setProfile(res.profile)
      setStatus('ready')
      track('signup_complete', { role: r })
    },
    [lang],
  )

  const logout = useCallback(async (everywhere = false) => {
    track(everywhere ? 'logout_all' : 'logout')
    await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' })
    setProfile(null)
    setStatus('signedOut')
  }, [])

  const value = useMemo(
    () => ({ status, session, profile, lang, pendingRole, setLang, setPendingRole, sendOtp, verifyOtp, chooseRole, logout }),
    [status, session, profile, lang, pendingRole, setLang, setPendingRole, sendOtp, verifyOtp, chooseRole, logout],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
