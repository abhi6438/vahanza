import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DriverCard, FleetRow, VerifiedBadge } from '../components/cards'
import { ProfileNudges } from '../components/nudges'
import { TabPage } from '../components/home'
import { Avatar } from '../components/photo'
import { placeText } from '../components/places'
import { Icon } from '../components/ui'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { driverCompletion, ownerCompletion } from '../lib/completion'
import { trackScreen } from '../lib/track'

/** "Profile" tab: who I am, how complete my profile is, and links to edit / settings / help. */
export default function Profile() {
  const { t, i18n } = useTranslation()
  const { profile, driver, fleet } = useAuth()
  useEffect(() => { trackScreen('profile_tab') }, [])
  if (!profile) return null
  const isDriver = profile.role === 'driver'
  const done = isDriver ? driverCompletion(profile, driver) : ownerCompletion(profile, fleet)
  const phone = (profile.phone || '').replace(/^91/, '')
  const place = profile.district && profile.state ? placeText({ district: profile.district, state: profile.state }, i18n.language) : ''
  return (
    <TabPage>
      <div className="bg-header px-4 pb-6 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Avatar url={profile.photo_url} name={profile.name} size={64} />
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold">{profile.name}</p>
            <p className="text-sm opacity-90">{isDriver ? t('role.driver') : profile.business_name || t('role.owner')} · +91 {phone.slice(0, 5)} {phone.slice(5)}</p>
            <p className="truncate text-sm opacity-90">{place}</p>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-md px-4">
        <div className="-mt-3 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <VerifiedBadge verified={profile.verified} />
            <span className="text-sm font-semibold text-muted">★ {t('card.newRating')}</span>
          </div>
          {!profile.verified && <p className="mt-3 text-sm text-muted">{t('profile.verifySoon')}</p>}
        </div>
        <ProfileNudges role={isDriver ? 'driver' : 'owner'} done={done} />
        {isDriver && driver && driver.vehicles.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('profile.ownersSee')}</h2>
              <Link to="/setup?edit" className="font-bold text-brand">{t('home.edit')}</Link>
            </div>
            <DriverCard self data={{ name: profile.name || '', photo_url: profile.photo_url, place: place.replace(/ · \d+$/, ''), verified: profile.verified, d: driver }} />
          </section>
        )}
        {!isDriver && fleet.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('home.yourVehicles')}</h2>
              <Link to="/setup?step=fleet" className="font-bold text-brand">{t('home.edit')}</Link>
            </div>
            <div className="flex flex-col gap-2.5">{fleet.map((g) => <FleetRow key={g.id} g={g} />)}</div>
          </section>
        )}
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
          <Row to="/setup?edit" icon={Icon.user} label={t('profile.edit')} />
          {!isDriver && <Row to="/setup?step=fleet" icon={Icon.list} label={t('profile.vehicles', { n: fleet.reduce((s, g) => s + g.vehicle_count, 0) })} />}
          <Row to="/settings" icon={Icon.settings} label={t('settings.title')} />
          <Row href={`tel:${brand.supportPhone}`} icon={Icon.phone} label={t('profile.help')} />
          <Row to="/legal" icon={Icon.list} label={t('login.terms')} last />
        </div>
      </main>
    </TabPage>
  )
}

function Row({ to, href, icon, label, last }: { to?: string; href?: string; icon: ReactNode; label: string; last?: boolean }) {
  const cls = `flex min-h-14 items-center gap-3 px-4 font-semibold ${last ? '' : 'border-b border-line'}`
  const inner = (
    <>
      <span className="text-brand">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="rotate-180 text-muted">{Icon.back}</span>
    </>
  )
  return to ? <Link to={to} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>
}
