import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/auth-layout'
import { H, Icon, Sub } from '../components/ui'
import { useAuth, type Role as R } from '../lib/auth'
import { track, trackScreen } from '../lib/track'
import { getSeeking } from '../lib/share'
import { DriverArt, FleetArt, MechanicArt } from '../assets/illustrations'

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

  const card = 'card-lift press relative flex w-full items-center gap-4 rounded-xl border border-border bg-surface p-3 pr-4 text-left shadow-sm disabled:opacity-60 disabled:shadow-none data-[invited=true]:border-primary data-[invited=true]:ring-2 data-[invited=true]:ring-primary/25'
  const forYou = (r: R) => invited === r && <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary shadow-sm [&>svg]:size-3">{Icon.sparkle}{t('role.forYou')}</span>
  return (
    <AuthLayout title={t('role.title')} back={false}>
        <H>{t('role.title')}</H>
        <Sub>{t('role.sub')}</Sub>
        <div className="flex flex-col gap-3">
          <button className={card} disabled={busy} data-invited={invited === 'owner'} onClick={() => pick('owner')}>
            {forYou('owner')}
            <span className="w-24 shrink-0"><FleetArt /></span>
            <span className="min-w-0 flex-1"><strong className="block font-display text-lg font-semibold">{t('role.owner')}</strong><span className="text-sm text-text-2">{t('role.ownerSub')}</span></span>
            <span className="icon-tile size-9 rounded-full bg-primary-soft text-primary">{Icon.chevron}</span>
          </button>
          <button className={`${card} ${invited === 'driver' ? 'order-first' : ''}`} disabled={busy} data-invited={invited === 'driver'} onClick={() => pick('driver')}>
            {forYou('driver')}
            <span className="w-24 shrink-0"><DriverArt /></span>
            <span className="min-w-0 flex-1"><strong className="block font-display text-lg font-semibold">{t('role.driver')}</strong><span className="text-sm text-text-2">{t('role.driverSub')}</span></span>
            <span className="icon-tile size-9 rounded-full bg-primary-soft text-primary">{Icon.chevron}</span>
          </button>
          <button className={card} disabled>
            <span className="w-24 shrink-0 opacity-70 grayscale-[.4]"><MechanicArt /></span>
            <span>
              <strong className="block font-display text-lg font-semibold">{t('role.mechanic')}</strong>
              <span className="text-sm text-text-2">{t('role.mechanicSub')}</span>
              <span className="mt-1 block w-fit rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent-ink">{t('soon')}</span>
            </span>
          </button>
        </div>
        {error && <p className="mt-4 text-error">{error}</p>}
        <button type="button" onClick={() => void logout(false)} className="mt-6 min-h-ctl-sm text-sm font-medium text-text-2 underline hover:text-text">{t('role.otherNumber')}</button>
      </AuthLayout>
  )
}
