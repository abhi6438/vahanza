import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'
import { ApiError, contactDriver } from '../lib/api'
import { useAuth } from '../lib/auth'
import { pick, placeName, VEHICLES } from '../lib/catalog'
import { track } from '../lib/track'
import { VehicleArt } from './form'
import { Bell } from './notify'
import { Icon, ThemeToggle } from './ui'

/** Compact teal header: greeting and light/dark switch. Location lives in the list title. */
export function HomeHeader({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const first = (profile?.name || '').trim().split(/\s+/)[0]
  const btn = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15'
  return (
    <div className="bg-header px-4 pb-4 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-[23px] font-bold">{t('home.hello')}{first ? `, ${first}` : ''}</h1>
          {profile?.is_test && <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">{t('home.testAccount')}</span>}
          <Bell className={btn} />
          <ThemeToggle className={btn} />
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

/** Name of the user's own city, for list titles ("Drivers near Rewa"). */
export function usePlaceName() {
  const { i18n } = useTranslation()
  const { profile } = useAuth()
  return profile?.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, i18n.language) : ''
}

/** Full-width main action in the header (one clear thing to do). */
export function MainAction({ icon, label, to, onClick }: { icon: ReactNode; label: string; to: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-[17px] font-bold text-[#2A1C00]">
      {icon}
      {label}
    </Link>
  )
}

/** Big action tile in the header (e.g. "Post: I need a driver"). */
export function ActionTile({ icon, label, hot, onClick, to }: { icon: ReactNode; label: string; hot?: boolean; onClick?: () => void; to?: string }) {
  const cls = `flex min-h-[88px] flex-col gap-1.5 rounded-2xl p-3 text-left ${hot ? 'bg-accent text-[#2A1C00]' : 'bg-card text-ink'}`
  const inner = (
    <>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${hot ? 'bg-white/55' : 'bg-brand-soft text-brand'}`}>{icon}</span>
      <strong className="text-[16px] leading-tight">{label}</strong>
    </>
  )
  return to ? <Link to={to} className={cls} onClick={onClick}>{inner}</Link> : <button type="button" className={cls} onClick={onClick}>{inner}</button>
}

/** Horizontal vehicle filter with a "verified only" switch. */
export function VehicleFilter({ value, onChange, verified, onVerified }: { value: string | null; onChange: (v: string | null) => void; verified: boolean; onVerified: (v: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const chip = 'flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border-2 border-line bg-card px-2.5 pb-1 pt-1.5 text-[13px] font-semibold aria-pressed:border-brand aria-pressed:bg-brand-soft'
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <button type="button" className={`${chip} justify-center px-3`} aria-pressed={verified} onClick={() => onVerified(!verified)}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-call text-white">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>
        </span>
        {t('home.verifiedOnly')}
      </button>
      {VEHICLES.map((v) => (
        <button key={v.key} type="button" className={chip} aria-pressed={value === v.key} onClick={() => onChange(value === v.key ? null : v.key)}>
          <VehicleArt kind={v.key} className="h-7 w-11" />
          {pick(v.label, i18n.language)}
        </button>
      ))}
    </div>
  )
}

export function SectionHead({ title, count }: { title: string; count?: string }) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      {count && <span className="text-sm text-muted">{count}</span>}
    </div>
  )
}

export function SoonTile() {
  const { t } = useTranslation()
  return (
    <Link to="/soon" onClick={() => track('soon_open', { from: 'home' })}
      className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-accent-soft p-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card text-accent-ink">{Icon.sparkle}</span>
      <span>
        <strong className="block">{t('soon')}</strong>
        <span className="text-sm">{t('soonTile.sub')}</span>
      </span>
    </Link>
  )
}

/** Call / WhatsApp buttons. The number is fetched only on tap (and recorded), never shown in a list. */
export function ContactButtons({ reveal, message, target }: { reveal: (via: 'call' | 'whatsapp') => Promise<{ phone: string }>; message: string; target: 'driver' | 'owner' }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'' | 'call' | 'whatsapp'>('')
  const [error, setError] = useState('')
  async function go(via: 'call' | 'whatsapp') {
    setBusy(via)
    setError('')
    try {
      const { phone } = await reveal(via)
      track(via === 'call' ? 'tap_call' : 'tap_whatsapp', { target })
      if (via === 'call') window.location.href = `tel:+${phone}`
      else window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'too_many_contacts' ? t('err.too_many_contacts') : t('error.generic'))
    } finally {
      setBusy('')
    }
  }
  const b = 'flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl font-bold text-white disabled:opacity-60'
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button type="button" className={`${b} bg-call`} disabled={busy !== ''} onClick={() => void go('call')}>{Icon.phone}{t('card.call')}</button>
        <button type="button" className={`${b} bg-[#1FA855]`} disabled={busy !== ''} onClick={() => void go('whatsapp')}>{Icon.whatsapp}WhatsApp</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}

/** Contact buttons for a driver card (used by owners). */
export function DriverContact({ driverId, name }: { driverId: string; name: string }) {
  const { i18n } = useTranslation()
  const msg = i18n.language === 'en' ? `Hello ${name}, I saw your profile on the app. Do you need driving work?` : `नमस्ते ${name} जी, ऐप पर आपकी प्रोफ़ाइल देखी। क्या आपको ड्राइवर का काम चाहिए?`
  return <ContactButtons target="driver" message={msg} reveal={(via) => contactDriver(driverId, via)} />
}

/** Bottom navigation (4 tabs, different for owners and drivers). */
export function BottomTabs() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const tabs = profile?.role === 'driver'
    ? [['/home', Icon.home, t('tabs.home')], ['/interests', Icon.heart, t('tabs.interests')], ['/soon', Icon.wrench, t('tabs.mechanic')], ['/profile', Icon.user, t('tabs.profile')]] as const
    : [['/home', Icon.home, t('tabs.home')], ['/posts', Icon.list, t('tabs.posts')], ['/soon', Icon.wrench, t('tabs.mechanic')], ['/profile', Icon.user, t('tabs.profile')]] as const
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map(([to, icon, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[12px] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}>
            {icon}
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Page frame for screens that have the bottom tabs. */
export function TabPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full pb-24">
      {children}
      <BottomTabs />
    </div>
  )
}
