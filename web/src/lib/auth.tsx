import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import i18n from '../i18n'
import { ApiError, getMe, heartbeat, startMe, type DriverDetails, type FleetGroup, type Me, type Profile } from './api'
import { clearLocalPin, clearPinAsk, LAST_PHONE, pinApi, saveLocalPin, setPinAsk } from './pin'
import { clearInvite, clearSource, getSource } from './share'
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
  driver: DriverDetails | null
  fleet: FleetGroup[]
  lang: Lang
  /** The person has picked a language before on this phone (returning users skip that screen). */
  langChosen: boolean
  pendingRole: Role | null
  /** A new number that was imported earlier (bulk import): the role it was imported as. */
  suggestedRole: Role | null
  setLang: (l: Lang) => Promise<void>
  setPendingRole: (r: Role) => void
  sendOtp: (phone10: string) => Promise<void>
  /** resetPin: "forgot MPIN" — after the OTP, ask for a new MPIN. */
  verifyOtp: (phone10: string, code: string, resetPin?: boolean) => Promise<void>
  /** Sprint 11: log in with the 6-digit MPIN instead of an OTP. */
  loginWithPin: (phone10: string, pin: string) => Promise<void>
  chooseRole: (r: Role) => Promise<void>
  logout: (everywhere?: boolean) => Promise<void>
  /** Puts a fresh /me response (e.g. after saving the profile) into app state. */
  applyMe: (me: Me) => void
  setPhotoUrl: (url: string | null) => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [driver, setDriver] = useState<DriverDetails | null>(null)
  const [fleet, setFleet] = useState<FleetGroup[]>([])
  const [lang, setLangState] = useState<Lang>('hi')
  const [langChosen, setLangChosen] = useState(false)
  const [pendingRole, setPendingRoleState] = useState<Role | null>(null)
  const [suggestedRole, setSuggestedRole] = useState<Role | null>(null)

  const applyMe = useCallback((me: Me) => {
    setProfile(me.profile)
    setDriver(me.driver ?? null)
    setFleet(me.fleet ?? [])
  }, [])

  const setPhotoUrl = useCallback((url: string | null) => {
    setProfile((p) => (p ? { ...p, photo_url: url } : p))
  }, [])

  const loadProfile = useCallback(async () => {
    try {
      const me = await getMe()
      if (me.exists && me.profile?.role) {
        applyMe(me)
        setStatus('ready')
      } else {
        setSuggestedRole(me.suggested_role ?? null)
        setStatus('needsRole')
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await supabase.auth.signOut({ scope: 'local' })
        setStatus('signedOut')
      } else if (e instanceof ApiError && e.status === 403) setStatus('blocked')
      else throw e
    }
  }, [applyMe])

  // Start-up: restore language, role choice and the saved login session.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const saved = (await storage.getItem('lang')) as Lang | null
      const l = saved || 'hi'
      setLangChosen(!!saved)
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
    setLangChosen(true)
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

  /** After any login (OTP or MPIN): load the profile, or ask "who are you?" for a new number. */
  const finishLogin = useCallback(
    async (s: Session, phone10: string) => {
      setSession(s)
      void storage.setItem(LAST_PHONE, phone10)
      const me = await getMe()
      if (me.exists && me.profile?.role) {
        applyMe(me)
        setStatus('ready')
        return
      }
      // new number: ask "who are you?" now (only once, ever)
      setSuggestedRole(me.suggested_role ?? null)
      await storage.removeItem('pending-role')
      setStatus('needsRole')
    },
    [applyMe],
  )

  const verifyOtp = useCallback(
    async (phone10: string, code: string, resetPin = false) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(phone10), token: code, type: 'sms' })
      if (error || !data.session) throw error || new Error('no-session')
      track('otp_verified')
      // no MPIN yet: offer one after login (so next time no OTP is needed); forgot MPIN: a new one
      if (resetPin) await setPinAsk('reset')
      else await pinApi.check(phone10).then((r) => (r.has_pin ? clearPinAsk() : setPinAsk('new'))).catch(() => {})
      await finishLogin(data.session, phone10)
    },
    [finishLogin],
  )

  const loginWithPin = useCallback(
    async (phone10: string, pin: string) => {
      const res = await pinApi.login(phone10, pin)
      const { data, error } = await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token })
      if (error || !data.session) throw error || new Error('no-session')
      track('pin_login')
      await clearPinAsk()
      if (data.session.user?.id) await saveLocalPin(data.session.user.id, pin)
      await finishLogin(data.session, phone10)
    },
    [finishLogin],
  )

  const chooseRole = useCallback(
    async (r: Role) => {
      const source = getSource()
      const res = await startMe(r, lang, source)
      applyMe(res)
      setStatus('ready')
      clearSource()
      clearInvite()
      track('signup_complete', { role: r, via: source?.via || 'direct' })
    },
    [lang, applyMe],
  )

  const logout = useCallback(async (everywhere = false) => {
    track(everywhere ? 'logout_all' : 'logout')
    // this phone should stop getting this person's alerts
    await (await import('./push')).disablePush()
    // the next person on this phone must not unlock with this MPIN
    await clearLocalPin()
    await clearPinAsk()
    await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' })
    applyMe({ exists: false, profile: null })
    setStatus('signedOut')
  }, [applyMe])

  const value = useMemo(
    () => ({ status, session, profile, driver, fleet, lang, langChosen, pendingRole, suggestedRole, setLang, setPendingRole, sendOtp, verifyOtp, loginWithPin, chooseRole, logout, applyMe, setPhotoUrl }),
    [status, session, profile, driver, fleet, lang, langChosen, pendingRole, suggestedRole, setLang, setPendingRole, sendOtp, verifyOtp, loginWithPin, chooseRole, logout, applyMe, setPhotoUrl],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
