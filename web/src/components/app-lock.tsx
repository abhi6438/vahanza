import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { bioAvailable, bioEnabled, bioVerify, checkLocalPin, clearLocalPin, hasLocalPin, localPinStale, LOCAL_MAX_FAILS, LOCK_AFTER_MS, LOCK_EVENT, lockEnabled, pinApi, saveLocalPin } from '../lib/pin'
import { track } from '../lib/track'
import { FingerprintIcon, PinDots, PinPad } from './pinpad'
import { BrandMark } from './shell'
import { useToast } from './toast'

/**
 * Sprint 11 (APK only): lock screen when the app is opened, and after 5 minutes in the background.
 * Fingerprint / face first (Android's own sheet), MPIN as the fallback (checked on the phone, so it
 * works without internet). 5 wrong MPINs or "forgot MPIN" = log out → log in again with an OTP.
 * Only shown when the person has an MPIN (without one there is nothing to fall back to).
 */
export function AppLock() {
  const { t } = useTranslation()
  const { status, session, profile, logout } = useAuth()
  const toast = useToast()
  const uid = session?.user?.id
  const [armed, setArmed] = useState(false)        // this person has an MPIN and the lock is on
  const [locked, setLocked] = useState(false)
  const [bio, setBio] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const fails = useRef(0)
  const freshLogin = useRef(false)                 // logged in during this run: don't lock straight away
  const hiddenAt = useRef<number | null>(null)
  const prompted = useRef(false)

  const [checking, setChecking] = useState(true)     // first look at the settings: cover the screen meanwhile
  const firstLook = useRef(true)
  const [changed, setChanged] = useState(0)
  useEffect(() => {
    const on = () => setChanged((n) => n + 1)
    window.addEventListener(LOCK_EVENT, on)
    return () => window.removeEventListener(LOCK_EVENT, on)
  }, [])

  useEffect(() => { if (status === 'signedOut') { freshLogin.current = true; setChecking(false) } }, [status])

  // is the lock on for this person? (local copy of the MPIN, or an MPIN made on another phone)
  useEffect(() => {
    if (status !== 'ready' || !uid) { setArmed(false); setLocked(false); return }
    let alive = true
    ;(async () => {
      const on = await lockEnabled()
      // the server knows best (MPIN changed on another phone / removed by an admin); offline: the copy here
      const server = await pinApi.mine().catch(() => null)
      if (server && (await localPinStale(uid, server.has_pin ? server.set_at : null))) await clearLocalPin()
      const has = on && (server ? server.has_pin : await hasLocalPin(uid))
      const useBio = has && (await bioEnabled()) && (await bioAvailable())
      if (!alive) return
      setArmed(has)
      setBio(useBio)
      if (!has) setLocked(false)
      // only when the app was opened with a saved login (not right after logging in, not on a settings change)
      if (firstLook.current && has && !freshLogin.current) setLocked(true)
      firstLook.current = false
      setChecking(false)
    })()
    return () => { alive = false }
  }, [status, uid, changed])

  // background for more than 5 minutes → lock again
  useEffect(() => {
    if (!armed) return
    let remove: (() => void) | undefined
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { hiddenAt.current = Date.now(); return }
      if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) { prompted.current = false; setLocked(true) }
      hiddenAt.current = null
    })).then((h) => { remove = () => void h.remove() })
    return () => remove?.()
  }, [armed])

  const unlock = useCallback((via: 'bio' | 'pin') => {
    fails.current = 0
    setPin('')
    setError('')
    setLocked(false)
    track('app_unlock', { via })
  }, [])

  const tryBio = useCallback(async () => {
    const ok = await bioVerify({ title: t('lock.bioTitle'), subtitle: t('lock.bioSub'), cancel: t('lock.usePin') })
    if (ok) unlock('bio')
  }, [t, unlock])

  // show the fingerprint sheet as soon as the lock appears
  useEffect(() => {
    if (locked && bio && !prompted.current) { prompted.current = true; void tryBio() }
  }, [locked, bio, tryBio])

  const wrong = useCallback((left: number) => {
    setPin('')
    setShake(true)
    window.setTimeout(() => setShake(false), 400)
    if (left <= 0) {
      toast(t('lock.tooMany'), { tone: 'error' })
      void logout(false)
      return
    }
    setError(t('pin.wrongLeft', { n: left }))
  }, [logout, t, toast])

  useEffect(() => {
    if (pin.length !== 6 || !uid || busy) return
    void (async () => {
      setBusy(true)
      try {
        const local = await checkLocalPin(uid, pin)
        if (local === true) return unlock('pin')
        if (local === false) { fails.current += 1; return wrong(LOCAL_MAX_FAILS - fails.current) }
        // MPIN made on another phone: check online once, then keep a copy here
        try {
          await pinApi.verify(pin)
          await saveLocalPin(uid, pin)
          unlock('pin')
        } catch (e) {
          if (e instanceof ApiError && e.code === 'wrong_pin') wrong((e.detail as { left: number }).left)
          else if (e instanceof ApiError && e.code === 'pin_locked') wrong(0)
          else { setPin(''); setError(t('lock.needNet')) }
        }
      } finally {
        setBusy(false)
      }
    })()
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking && status === 'ready' && !freshLogin.current) return <div className="fixed inset-0 z-[100] bg-bg" aria-hidden />
  if (!armed || !locked) return null
  const name = (profile?.name || '').split(' ')[0]
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto bg-bg px-6 pb-8 anim-fade"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3rem)' }} role="dialog" aria-modal="true" aria-label={t('lock.title')}>
      <BrandMark size={48} />
      <p className="mt-4 font-display text-2xl font-bold">{name ? t('lock.hello', { name }) : t('lock.title')}</p>
      <p className="mt-1 text-center text-text-2">{t(bio ? 'lock.subBio' : 'lock.sub')}</p>
      <div className="mb-2 mt-8"><PinDots n={pin.length} error={shake} /></div>
      <p role="alert" className="mb-4 min-h-6 text-center text-sm text-error">{error}</p>
      <PinPad value={pin} onChange={setPin} disabled={busy}
        extra={bio ? { icon: FingerprintIcon, label: t('lock.bioTitle'), onClick: () => void tryBio() } : undefined} />
      <button type="button" onClick={() => void logout(false)} className="mt-8 min-h-ctl-sm text-sm font-semibold text-primary underline">{t('pin.forgot')}</button>
    </div>
  )
}
