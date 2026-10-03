import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DriverCard, FleetRow, RatingBadge, VerifiedBadge } from '../components/cards'
import { ProfileNudges } from '../components/nudges'
import { Avatar } from '../components/photo'
import { placeText } from '../components/places'
import { AppShell } from '../components/shell'
import { ButtonLink, Card, ConfirmDialog, Icon, SectionTitle } from '../components/ui'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { driverCompletion, ownerCompletion } from '../lib/completion'
import { useIsDesktop } from '../lib/layout'
import { trackScreen } from '../lib/track'

/** "Profile": who I am, how complete my profile is, how others see me, and account links. */
export default function Profile() {
  const { t, i18n } = useTranslation()
  const { profile, driver, fleet, logout } = useAuth()
  const desktop = useIsDesktop()
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { trackScreen('profile_tab') }, [])
  if (!profile) return null
  const isDriver = profile.role === 'driver'
  const done = isDriver ? driverCompletion(profile, driver) : ownerCompletion(profile, fleet)
  const phone = (profile.phone || '').replace(/^91/, '')
  const place = profile.district && profile.state ? placeText({ district: profile.district, state: profile.state }, i18n.language) : ''
  const vehicles = fleet.reduce((s, g) => s + g.vehicle_count, 0)

  const identity = (
    <Card className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <div className="flex w-full flex-col items-center gap-3 lg:flex-row lg:items-center">
        <Avatar url={profile.photo_url} name={profile.name} size={desktop ? 72 : 80} />
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{profile.name}</p>
          <p className="text-sm text-text-2">{isDriver ? t('role.driver') : profile.business_name || t('role.owner')}</p>
        </div>
      </div>
      <dl className="mt-4 w-full space-y-2 text-sm">
        <div className="flex items-center gap-2 lg:justify-start justify-center"><dt className="sr-only">{t('profile.phone')}</dt><span className="text-text-2">{Icon.phone}</span><dd>+91 {phone.slice(0, 5)} {phone.slice(5)}</dd></div>
        {place && <div className="flex items-center gap-2 lg:justify-start justify-center"><dt className="sr-only">{t('profile.place')}</dt><span className="text-text-2">{Icon.pin}</span><dd>{place}</dd></div>}
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
        <VerifiedBadge verified={profile.verified} />
        <RatingBadge />
      </div>
      {!profile.verified && <p className="mt-3 text-sm text-text-2">{t('profile.verifySoon')}</p>}
      <ButtonLink to="/setup?edit" variant="outline" block className="mt-4">{t('profile.edit')}</ButtonLink>
    </Card>
  )

  const links = (
    <nav aria-label={t('profile.more')} className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      {!isDriver && <Row to="/setup?step=fleet" icon={Icon.truck} label={t('profile.vehicles', { n: vehicles })} />}
      <Row to="/blocked" icon={Icon.ban} label={t('trust.blockedList')} />
      <Row to="/settings" icon={Icon.settings} label={t('settings.title')} />
      <Row href={`tel:${brand.supportPhone}`} icon={Icon.help} label={t('profile.help')} />
      <Row to="/legal" icon={Icon.doc} label={t('login.terms')} />
      <Row onClick={() => setConfirm(true)} icon={Icon.logout} label={t('settings.logout')} danger last />
    </nav>
  )

  const preview = isDriver && driver && driver.vehicles.length > 0 ? (
    <section>
      <SectionTitle className="mb-3" title={t('profile.ownersSee')} sub={t('profile.ownersSeeSub')}
        right={<Link to="/setup?edit" className="shrink-0 font-semibold text-primary hover:underline">{t('home.edit')}</Link>} />
      <div className="max-w-xl"><DriverCard self data={{ name: profile.name || '', photo_url: profile.photo_url, place: place.replace(/ · \d+$/, ''), verified: profile.verified, d: driver }} /></div>
    </section>
  ) : !isDriver && fleet.length > 0 ? (
    <section>
      <SectionTitle className="mb-3" title={t('home.yourVehicles')}
        right={<Link to="/setup?step=fleet" className="shrink-0 font-semibold text-primary hover:underline">{t('home.edit')}</Link>} />
      <div className="grid gap-2.5 xl:grid-cols-2">{fleet.map((g) => <FleetRow key={g.id} g={g} />)}</div>
    </section>
  ) : null

  return (
    <AppShell title={t('tabs.profile')} width="default">
      {desktop ? (
        <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-8">
          <div className="flex flex-col gap-4">{identity}{links}</div>
          <div className="flex min-w-0 flex-col gap-6">
            <ProfileNudges role={isDriver ? 'driver' : 'owner'} done={done} />
            {preview}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {identity}
          <ProfileNudges role={isDriver ? 'driver' : 'owner'} done={done} />
          {preview}
          {links}
        </div>
      )}
      <ConfirmDialog open={confirm} title={t('settings.logoutQ')} confirmLabel={t('settings.logout')}
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void logout(false) }} />
    </AppShell>
  )
}

function Row({ to, href, onClick, icon, label, last, danger }: { to?: string; href?: string; onClick?: () => void; icon: ReactNode; label: string; last?: boolean; danger?: boolean }) {
  const cls = `flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium transition-colors hover:bg-surface-2 ${last ? '' : 'border-b border-border'} ${danger ? 'text-error' : ''}`
  const inner = (
    <>
      <span className={danger ? '' : 'text-primary'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {!danger && <span className="text-text-2">{Icon.chevron}</span>}
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (href) return <a href={href} className={cls}>{inner}</a>
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>
}
