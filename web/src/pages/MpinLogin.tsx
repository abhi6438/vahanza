import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { PinDots, PinPad } from '../components/pinpad'
import { H, Sub } from '../components/ui'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { trackScreen } from '../lib/track'

/** Sprint 11: log in with the 6-digit MPIN. "Forgot MPIN" = log in with an OTP and make a new one. */
export default function MpinLogin() {
  const { t, i18n } = useTranslation()
  const { loginWithPin, sendOtp } = useAuth()
  const nav = useNavigate()
  const phone: string | undefined = useLocation().state?.phone
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [locked, setLocked] = useState<string | null>(null)
  useEffect(() => { trackScreen('mpin_login') }, [])

  useEffect(() => {
    if (pin.length === 6 && !busy) void submit(pin)
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!phone) return <Navigate to="/login" replace />

  async function submit(value: string) {
    setBusy(true)
    setError('')
    try {
      await loginWithPin(phone!, value)
      nav('/home', { replace: true })
    } catch (e) {
      setPin('')
      if (e instanceof ApiError && e.code === 'wrong_pin') {
        const d = e.detail as { left: number; locked_until: string | null }
        if (d.locked_until) setLocked(d.locked_until)
        else setError(t('pin.wrongLeft', { n: d.left }))
        setShake(true)
        window.setTimeout(() => setShake(false), 400)
      } else if (e instanceof ApiError && e.code === 'pin_locked') {
        setLocked((e.detail as { locked_until: string }).locked_until)
      } else if (e instanceof ApiError && e.status === 429) {
        setError(t('pin.tooMany'))
      } else if (e instanceof ApiError && (e.code === 'pin_login_unavailable' || e.code === 'no_pin')) {
        void goOtp()          // MPIN login not switched on (or MPIN removed by admin): OTP as before
      } else {
        setError(navigator.onLine ? t('error.server') : t('error.network'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function goOtp(resetPin = false) {
    setError('')
    try {
      await sendOtp(phone!)
      nav('/otp', { state: { phone, resetPin }, replace: true })
    } catch (e) {
      setError((e as Error).message || t('error.generic'))
    }
  }

  const until = locked ? new Date(locked).toLocaleTimeString(i18n.language === 'en' ? 'en-IN' : 'hi-IN', { hour: 'numeric', minute: '2-digit' }) : ''
  const shown = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
  return (
    <AuthLayout title={t('pin.loginTitle')}>
      <H>{t('pin.loginTitle')}</H>
      <Sub>
        {t('pin.loginSub', { phone: shown })}{' '}
        <button type="button" onClick={() => nav('/login', { replace: true })} className="font-semibold text-primary underline">{t('otp.change')}</button>
      </Sub>
      {locked ? (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-card text-center">
          <p className="font-semibold">{t('pin.lockedTitle')}</p>
          <p className="mt-1 text-sm text-text-2">{t('pin.lockedBody', { time: until })}</p>
          <button type="button" onClick={() => void goOtp(true)} className="mt-3 inline-flex min-h-ctl-md items-center rounded-md bg-primary px-4 font-semibold text-on-primary">{t('pin.useOtp')}</button>
        </div>
      ) : (
        <>
          <div className="mb-2 mt-2"><PinDots n={pin.length} error={shake} /></div>
          <p role="alert" className="mb-4 min-h-6 text-center text-sm text-error">{error}</p>
          <PinPad value={pin} onChange={setPin} disabled={busy} />
          <div className="mt-6 flex flex-col items-center gap-1 text-sm">
            <button type="button" onClick={() => void goOtp(true)} className="min-h-ctl-sm font-semibold text-primary underline">{t('pin.forgot')}</button>
            <button type="button" onClick={() => void goOtp(false)} className="min-h-ctl-sm text-text-2 underline">{t('pin.otpInstead')}</button>
          </div>
        </>
      )}
    </AuthLayout>
  )
}
