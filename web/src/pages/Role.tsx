import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/auth-layout'
import { H, Sub } from '../components/ui'
import { useAuth, type Role as R } from '../lib/auth'
import { track, trackScreen } from '../lib/track'
import { getSeeking } from '../lib/share'
import { TruckArt, WheelArt } from '../components/role-art'

export default function Role() {
  const { t } = useTranslation()
  const { setPendingRole, chooseRole, logout, suggestedRole } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // invite link (?inv=driver) or a number we imported earlier: put that card first, marked "for you"
  // invite link, a number we imported earlier, or what they looked at before login ("I need a driver" → owner)
  const seeking = getSeeking()
  const fromSeeking: R | null = seeking === 'driver' ? 'owner' : seeking === 'job' ? 'driver' : null
  const invited = (() => { try { return (sessionStorage.getItem('vz-inv') as R | null) || suggestedRole || fromSeeking } catch { return suggestedRole || fromSeeking } })()
  useEffect(() => {
    trackScreen('role')
    if (invited) track('invite_open', { role: invited })
  }, [invited])

  // Shown once, right after the first OTP of a new number. Returning users never see it.
  async function pick(r: R) {
    setPendingRole(r)
    setBusy(true)
    try {
      await chooseRole(r)
    } catch {
      setError(t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const card = 'relative flex w-full items-center gap-3.5 rounded-lg border border-border bg-surface p-3 text-left disabled:opacity-60 data-[invited=true]:border-brand data-[invited=true]:ring-2 data-[invited=true]:ring-brand/30'
  const forYou = (r: R) => invited === r && <span className="absolute -top-2.5 right-3 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{t('role.forYou')}</span>
  return (
    <AuthLayout title={t('role.title')} back={false}>
        <H>{t('role.title')}</H>
        <Sub>{t('role.sub')}</Sub>
        <div className="flex flex-col gap-3">
          <button className={card} disabled={busy} data-invited={invited === 'owner'} onClick={() => pick('owner')}>
            {forYou('owner')}
            <span className="grid h-[72px] w-[92px] place-items-center rounded-md bg-accent-soft"><TruckArt /></span>
            <span><strong className="block text-[21px]">{t('role.owner')}</strong><span className="text-sm text-text-2">{t('role.ownerSub')}</span></span>
          </button>
          <button className={`${card} ${invited === 'driver' ? 'order-first' : ''}`} disabled={busy} data-invited={invited === 'driver'} onClick={() => pick('driver')}>
            {forYou('driver')}
            <span className="grid h-[72px] w-[92px] place-items-center rounded-md bg-brand-soft"><WheelArt /></span>
            <span><strong className="block text-[21px]">{t('role.driver')}</strong><span className="text-sm text-text-2">{t('role.driverSub')}</span></span>
          </button>
          <button className={card} disabled>
            <span className="grid h-[72px] w-[92px] place-items-center rounded-md bg-line/60 text-text-2"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
            <span>
              <strong className="block text-[21px]">{t('role.mechanic')}</strong>
              <span className="text-sm text-text-2">{t('role.mechanicSub')}</span>
              <span className="mt-1 block w-fit rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-ink">{t('soon')}</span>
            </span>
          </button>
        </div>
        {error && <p className="mt-4 text-error">{error}</p>}
        <button type="button" onClick={() => void logout(false)} className="mt-6 min-h-10 text-sm font-medium text-text-2 underline hover:text-text">{t('role.otherNumber')}</button>
      </AuthLayout>
  )
}
