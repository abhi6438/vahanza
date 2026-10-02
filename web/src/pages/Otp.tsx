import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BigButton, H, Screen, Sub, TopBar } from '../components/ui'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { trackScreen } from '../lib/track'

const RESEND_AFTER = 30

export default function Otp() {
  const { t } = useTranslation()
  const { verifyOtp, sendOtp } = useAuth()
  const nav = useNavigate()
  const phone: string | undefined = useLocation().state?.phone
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(RESEND_AFTER)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { trackScreen('otp') }, [])
  useEffect(() => {
    if (left <= 0) return
    const id = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])

  if (!phone) return <Navigate to="/login" replace />

  async function submit(value = code) {
    if (value.length !== 6) return
    setBusy(true)
    setError('')
    try {
      await verifyOtp(phone!, value)
      nav('/home', { replace: true })
    } catch (e) {
      // Wrong OTP comes from Supabase; ApiError / TypeError mean our API could not be reached or failed.
      if (e instanceof ApiError || e instanceof TypeError) {
        setError(e instanceof ApiError && e.status < 500 ? `${t('error.generic')} (${e.status})` : t('error.server'))
      } else {
        setError(t('otp.wrong'))
        setCode('')
        input.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError('')
    try {
      await sendOtp(phone!)
      setLeft(RESEND_AFTER)
    } catch (e) {
      setError((e as Error).message || t('error.generic'))
    }
  }

  const shown = `${phone.slice(0, 5)} ${phone.slice(5)}`
  return (
    <>
      <TopBar title={t('otp.title')} />
      <Screen footer={<BigButton disabled={code.length !== 6 || busy} onClick={() => submit()}>{t('otp.verify')}</BigButton>}>
        <H>{t('otp.title')}</H>
        <Sub>{t('otp.sentTo', { phone: shown })}</Sub>
        {/* One real input (works with SMS auto-fill), drawn as 6 boxes */}
        <label className="relative block">
          <input
            ref={input}
            id="otp"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(v)
              if (v.length === 6) void submit(v)
            }}
            className="absolute inset-0 opacity-0"
            aria-label={t('otp.title')}
          />
          <div className="grid grid-cols-6 gap-2" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={`grid h-14 place-items-center rounded-xl border-2 bg-card text-2xl font-bold ${i === code.length ? 'border-brand' : 'border-line'}`}>
                {code[i] || ''}
              </div>
            ))}
          </div>
        </label>
        <div className="mt-3 flex items-center justify-between text-sm">
          {left > 0 ? <span className="text-muted">{t('otp.resendIn', { s: left })}</span> : <button onClick={resend} className="font-bold text-brand">{t('otp.resend')}</button>}
          <button onClick={() => nav('/login', { replace: true })} className="font-bold text-brand">{t('otp.change')}</button>
        </div>
        {error && <p className="mt-4 text-danger">{error}</p>}
      </Screen>
    </>
  )
}
