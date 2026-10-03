import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { H, Sub } from '../components/ui'
import { useAuth, type Role as R } from '../lib/auth'
import { track, trackScreen } from '../lib/track'

const Truck = () => (
  <svg viewBox="0 0 80 50" width="80" height="50" aria-hidden>
    <rect x="4" y="12" width="46" height="24" rx="3" fill="#E8742A" /><rect x="4" y="30" width="46" height="4" fill="#0E5A6B" />
    <path d="M50 18h14l10 10v8H50z" fill="#2F5DA8" /><path d="M54 21h9l6 7H54z" fill="#CFE3F7" />
    <circle cx="16" cy="40" r="5" fill="#2B2F2C" /><circle cx="36" cy="40" r="5" fill="#2B2F2C" /><circle cx="64" cy="40" r="5" fill="#2B2F2C" />
  </svg>
)
const Wheel = () => (
  <svg viewBox="0 0 60 60" width="56" height="56" aria-hidden>
    <circle cx="30" cy="30" r="22" fill="none" stroke="#234680" strokeWidth="6" /><circle cx="30" cy="30" r="6" fill="#234680" />
    <path d="M8 30h16M36 30h16M30 36v16" stroke="#234680" strokeWidth="6" />
  </svg>
)

export default function Role() {
  const { t } = useTranslation()
  const { status, setPendingRole, chooseRole } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const invited = (() => { try { return sessionStorage.getItem('vz-inv') as R | null } catch { return null } })()
  useEffect(() => {
    trackScreen('role')
    if (invited) track('invite_open', { role: invited })
  }, [invited])

  async function pick(r: R) {
    setPendingRole(r)
    if (status === 'needsRole') {
      // Already logged in (e.g. app reinstalled): create the profile now.
      setBusy(true)
      try {
        await chooseRole(r)
      } catch {
        setError(t('error.generic'))
      } finally {
        setBusy(false)
      }
    } else nav('/login')
  }

  const card = 'relative flex w-full items-center gap-3.5 rounded-lg border border-border bg-surface p-3 text-left disabled:opacity-60 data-[invited=true]:border-brand data-[invited=true]:ring-2 data-[invited=true]:ring-brand/30'
  const forYou = (r: R) => invited === r && <span className="absolute -top-2.5 right-3 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{t('role.forYou')}</span>
  return (
    <AuthLayout title={t('role.title')} back={status !== 'needsRole'}>
        <H>{t('role.title')}</H>
        <Sub>{t('role.sub')}</Sub>
        <div className="flex flex-col gap-3">
          <button className={card} disabled={busy} data-invited={invited === 'owner'} onClick={() => pick('owner')}>
            {forYou('owner')}
            <span className="grid h-[72px] w-[92px] place-items-center rounded-md bg-accent-soft"><Truck /></span>
            <span><strong className="block text-[21px]">{t('role.owner')}</strong><span className="text-sm text-text-2">{t('role.ownerSub')}</span></span>
          </button>
          <button className={`${card} ${invited === 'driver' ? 'order-first' : ''}`} disabled={busy} data-invited={invited === 'driver'} onClick={() => pick('driver')}>
            {forYou('driver')}
            <span className="grid h-[72px] w-[92px] place-items-center rounded-md bg-brand-soft"><Wheel /></span>
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
      </AuthLayout>
  )
}
