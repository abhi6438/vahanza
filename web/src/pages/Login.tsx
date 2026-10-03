import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { BigButton, H, Sub } from '../components/ui'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { isValidIndianMobile } from '../lib/supabase'
import { trackScreen } from '../lib/track'

export default function Login() {
  const { t } = useTranslation()
  const { sendOtp } = useAuth()
  const nav = useNavigate()
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { trackScreen('login') }, [])

  const ok = isValidIndianMobile(phone) && consent

  async function submit() {
    setError('')
    setBusy(true)
    try {
      await sendOtp(phone)
      nav('/otp', { state: { phone } })
    } catch (e) {
      const msg = (e as Error).message
      setError(msg === 'invalid-phone' ? t('login.invalid') : navigator.onLine ? msg || t('error.generic') : t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t('login.title')} footer={<BigButton disabled={!ok || busy} onClick={submit}>{t('login.send')}</BigButton>}>
        <H>{t('login.title')}</H>
        <Sub>{t('login.sub')}</Sub>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-brand">
          <span className="text-xl text-text-2">+91</span>
          <input
            id="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder={t('login.placeholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-full bg-transparent py-3 text-2xl font-semibold tracking-wider outline-none"
            aria-label={t('login.title')}
          />
        </label>
        {phone.length === 10 && !isValidIndianMobile(phone) && <p className="mt-2 text-error">{t('login.invalid')}</p>}
        <label className="mt-5 flex items-start gap-2.5 text-sm text-text-2">
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--c-brand)]" />
          <span>
            {t('login.consent', { brand: brand.name })}{' '}
            <Link to="/legal" className="font-semibold text-brand underline">{t('login.terms')}</Link>
          </span>
        </label>
        {error && <p className="mt-4 text-error">{error}</p>}
      </AuthLayout>
  )
}
