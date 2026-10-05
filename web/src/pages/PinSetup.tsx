import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SuccessArt } from '../assets/illustrations'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { PinDots, PinPad } from '../components/pinpad'
import { useToast } from '../components/toast'
import { Button, ErrorState, H, Skeleton, Sub } from '../components/ui'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { bioAvailable, clearPinAsk, clearPinSkipped, getPinAsk, pinApi, saveLocalPin, setLockEnabled, setPinSkipped, PIN_LEN, type MyPin } from '../lib/pin'
import { isNative } from '../lib/platform'
import { track, trackScreen } from '../lib/track'

type Step = 'old' | 'new' | 'confirm' | 'done'

/**
 * Sprint 11: make / change the MPIN.
 *   after login with an OTP (no MPIN yet): new → confirm   (can be skipped, except admins)
 *   forgot MPIN (just logged in with an OTP): new → confirm
 *   Settings → change: old → new → confirm
 */
export default function PinSetup() {
  const { t } = useTranslation()
  const { session, profile, sendOtp } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [mine, setMine] = useState<MyPin | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [step, setStep] = useState<Step>('new')
  const [oldPin, setOldPin] = useState('')
  const [first, setFirst] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bio, setBio] = useState(false)
  const [fromAsk, setFromAsk] = useState(false)

  useEffect(() => {
    trackScreen('pin_setup')
    void getPinAsk().then((a) => setFromAsk(!!a))
    void bioAvailable().then(setBio)
    pinApi.mine().then((m) => {
      setMine(m)
      setStep(m.has_pin && !m.can_reset ? 'old' : 'new')
    }).catch(() => setLoadError(true))
  }, [])

  const fail = (msg: string) => {
    setError(msg)
    setPin('')
    setShake(true)
    window.setTimeout(() => setShake(false), 400)
  }

  useEffect(() => {
    if (pin.length !== PIN_LEN || busy) return
    setError('')
    if (step === 'old') { setOldPin(pin); setPin(''); setStep('new'); return }
    if (step === 'new') {
      if (mine?.has_pin && oldPin === pin) return fail(t('pin.sameAsOld'))
      setFirst(pin); setPin(''); setStep('confirm'); return
    }
    if (step === 'confirm') {
      if (pin !== first) { setStep('new'); setFirst(''); return fail(t('pin.mismatch')) }
      void save(pin)
    }
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(value: string) {
    setBusy(true)
    try {
      await pinApi.set(value, oldPin || undefined)
      if (session?.user?.id) await saveLocalPin(session.user.id, value)
      await Promise.all([clearPinAsk(), clearPinSkipped(), setLockEnabled(true)])
      track('pin_set', { mode: mine?.has_pin ? 'change' : 'new' })
      setStep('done')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'wrong_pin') {
        setOldPin(''); setFirst(''); setStep('old')
        fail(t('pin.wrongOld', { n: (e.detail as { left: number }).left }))
      } else if (e instanceof ApiError && e.code === 'pin_locked') {
        toast(t('pin.lockedShort'), { tone: 'error' })
        nav(-1)
      } else if (e instanceof ApiError && e.code === 'pin_simple') {
        setFirst(''); setStep('new'); fail(t('pin.simple'))
      } else {
        setFirst(''); setStep('new'); fail(t('error.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    const phone = (profile?.phone || '').replace(/^91/, '')
    try {
      await sendOtp(phone)
      nav('/otp', { state: { phone, resetPin: true } })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    }
  }

  async function skip() {
    await Promise.all([clearPinAsk(), setPinSkipped()])
    track('pin_skip')
    nav('/home', { replace: true })
  }

  const finish = () => (fromAsk ? nav('/home', { replace: true }) : nav(-1))
  const title = mine?.has_pin && !mine.can_reset ? t('pin.changeTitle') : t('pin.setTitle')
  const head = { old: t('pin.enterOld'), new: t('pin.enterNew'), confirm: t('pin.enterAgain'), done: '' }[step]
  const canSkip = fromAsk && !mine?.has_pin && !mine?.required

  return (
    <AuthLayout title={title} back={!fromAsk}>
      {loadError && <ErrorState onRetry={() => window.location.reload()} />}
      {!mine && !loadError && <Skeleton className="h-80" />}
      {mine && step === 'done' && (
        <div className="text-center">
          <div className="mx-auto w-40"><SuccessArt /></div>
          <H>{mine.has_pin ? t('pin.doneChanged') : t('pin.doneTitle')}</H>
          <Sub>{isNative ? t(bio ? 'pin.doneBodyBio' : 'pin.doneBodyApp') : t('pin.doneBodyWeb')}</Sub>
          <Button variant="primary" size="lg" block onClick={finish}>{t('continue')}</Button>
        </div>
      )}
      {mine && step !== 'done' && (
        <>
          <H>{head}</H>
          <Sub>{step === 'new' ? t('pin.whyNew') : step === 'confirm' ? t('pin.whyConfirm') : t('pin.whyOld')}</Sub>
          <div className="mb-2 mt-2"><PinDots n={pin.length} error={shake} /></div>
          <p role="alert" className="mb-4 min-h-6 text-center text-sm text-error">{error}</p>
          <PinPad value={pin} onChange={setPin} disabled={busy} />
          {step === 'old' && (
            <div className="mt-6 text-center">
              <button type="button" onClick={() => void forgot()} className="min-h-ctl-sm text-sm font-semibold text-primary underline">{t('pin.forgot')}</button>
            </div>
          )}
          {mine.required && !mine.has_pin && <p className="mt-5 text-center text-sm text-text-2">{t('pin.requiredAdmin')}</p>}
          {canSkip && (
            <div className="mt-6 text-center">
              <button type="button" onClick={() => void skip()} className="min-h-ctl-sm text-sm font-medium text-text-2 underline">{t('pin.later')}</button>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  )
}
