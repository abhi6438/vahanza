import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DriverCard } from '../components/cards'
import { DriverContact, usePlaceName, VehicleFilter } from '../components/home'
import { JobItem } from '../components/jobs'
import { AppShell, CardGrid, HeroBar, WithRail } from '../components/shell'
import { CardMenu, RatePrompt } from '../components/trust'
import { useToast } from '../components/toast'
import { Badge, Button, ButtonLink, Card, CardSkeletons, EmptyState, ErrorState, Icon, SectionTitle, Switch } from '../components/ui'
import { listDrivers, listJobs, recordView, setAvailability, type DriverListItem, type Job } from '../lib/api'
import { GrowthCard } from '../components/growth'
import { PendingHires } from '../components/work'
import { useAuth } from '../lib/auth'
import { placeName } from '../lib/catalog'
import { driverCompletion, ownerCompletion } from '../lib/completion'
import { useIsDesktop } from '../lib/layout'
import { track, trackScreen } from '../lib/track'
import { CompleteCard } from '../components/nudges'

/**
 * Home = what the user came for.
 *   owner  → "I need a driver, post" + drivers near me
 *   driver → "available for work" + jobs near me
 * Desktop adds a side rail (rating prompt, profile progress, safety tips) next to a card grid.
 */
export default function Home() {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'driver' ? <DriverHome /> : <OwnerHome />
}

function useGreeting() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const first = (profile?.name || '').trim().split(/\s+/)[0]
  return `${t('home.hello')}${first ? `, ${first}` : ''}`
}

function TestBadge() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  return profile?.is_test ? <Badge tone="action">{t('home.testAccount')}</Badge> : null
}

function CityLine({ city, onDark }: { city: string; onDark?: boolean }) {
  const { t } = useTranslation()
  if (!city) return <Link to="/setup?edit" className={onDark ? 'text-white/90 underline' : 'text-primary underline'}>{t('home.setPlace')}</Link>
  return <span className={`inline-flex items-center gap-1 ${onDark ? 'text-white/85' : ''}`}>{Icon.pin}{city}</span>
}

/** Generic paged list loader used by both homes. */
function usePaged<T>(load: (offset: number) => Promise<{ items: T[]; has_more: boolean }>, deps: unknown[]) {
  const [items, setItems] = useState<T[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setItems(null)
    setError(false)
    load(0).then((r) => { if (alive) { setItems(r.items); setMore(r.has_more) } }).catch(() => alive && setError(true))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await load(items?.length || 0)
      setItems((cur) => [...(cur || []), ...r.items])
      setMore(r.has_more)
    } finally {
      setLoadingMore(false)
    }
  }
  return { items, setItems, more, error, loadMore, loadingMore, retry: useCallback(() => setTick((n) => n + 1), []) }
}

function SafetyTips() {
  const { t } = useTranslation()
  return (
    <Card>
      <p className="flex items-center gap-2 font-semibold"><span className="text-success">{Icon.shield}</span>{t('safety.title')}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-text-2">
        <li>• {t('safety.noAdvance')}</li>
        <li>• {t('safety.talkFirst')}</li>
        <li>• {t('safety.report')}</li>
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------- owner
function OwnerHome() {
  const { t, i18n } = useTranslation()
  const { profile, fleet } = useAuth()
  const city = usePlaceName()
  const greeting = useGreeting()
  const desktop = useIsDesktop()
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  useEffect(() => { trackScreen('owner_home') }, [])
  useEffect(() => { if (vehicle || verified) track('driver_filter', { vehicle, verified }) }, [vehicle, verified])
  const list = usePaged<DriverListItem>((offset) => listDrivers({ vehicle, verified, offset }), [vehicle, verified])
  const lang = i18n.language
  const postTo = fleet.length ? '/posts/new' : '/setup?step=fleet&next=/posts/new'
  const onPost = () => track('post_tap', { has_fleet: fleet.length > 0 })
  const filtered = !!vehicle || verified
  const done = profile ? ownerCompletion(profile, fleet) : null

  const main = (
    <section aria-labelledby="list-title">
      <SectionTitle className="mb-3"
        title={<span id="list-title">{city ? t('home.driversNearCity', { city }) : t('home.driversNear')}</span>}
        right={list.items && <span className="shrink-0 text-sm text-text-2">{t('home.countDrivers', { n: list.items.length + (list.more ? '+' : '') })}</span>} />
      <VehicleFilter value={vehicle} onChange={setVehicle} verified={verified} onVerified={setVerified} />
      <div className="mt-4">
        {list.error && <ErrorState onRetry={list.retry} />}
        {list.items?.length === 0 && (filtered
          ? <EmptyState icon={Icon.search} title={t('home.emptyFilterTitle')} body={t('home.noDriversFilter')}
              action={<Button variant="outline" onClick={() => { setVehicle(null); setVerified(false) }}>{t('home.clearFilter')}</Button>} />
          : <EmptyState icon={Icon.users} title={t('home.emptyDriversTitle')} body={t('home.emptyDriversBody')}
              action={<ButtonLink to={postTo} onClick={onPost} variant="action" icon={Icon.plus}>{t('home.post')}</ButtonLink>} />)}
        <CardGrid>
          {list.items === null && !list.error && <CardSkeletons count={desktop ? 4 : 2} />}
          {list.items?.map((d) => (
            <DriverCard key={d.id} onOpen={() => void recordView(d.id).catch(() => {})}
              data={{ name: d.name || '', photo_url: d.photo_url, verified: d.verified, distance_km: d.distance_km, rating_avg: d.rating_avg, rating_count: d.rating_count, top: d.top, jobs_done: d.jobs_done, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
              menu={<CardMenu target={{ type: 'profile', id: d.id }} personId={d.id} name={d.name || ''} onBlocked={() => list.setItems((cur) => cur?.filter((x) => x.id !== d.id) || null)} />}
              actions={<DriverContact driverId={d.id} name={(d.name || '').split(' ')[0]} />} />
          ))}
        </CardGrid>
        {list.more && <Button variant="outline" block className="mt-4" loading={list.loadingMore} onClick={() => void list.loadMore()}>{t('home.more')}</Button>}
      </div>
    </section>
  )

  return (
    <AppShell title={greeting} sub={<CityLine city={city} />} width="wide"
      actions={<><TestBadge /><ButtonLink to={postTo} onClick={onPost} variant="action" icon={Icon.plus}>{t('home.post')}</ButtonLink></>}
      hero={
        <>
          <HeroBar title={greeting} badge={<TestBadge />} />
          <p className="-mt-1 mb-3 text-sm"><CityLine city={city} onDark /></p>
          <ButtonLink to={postTo} onClick={onPost} variant="action" size="lg" block icon={Icon.plus}>{t('home.post')}</ButtonLink>
        </>
      }>
      <WithRail main={main} mobileTop={<RatePrompt />}
        rail={
          <>
            <RatePrompt />
            {done && done.missing.length > 0 && <CompleteCard role="owner" percent={done.percent} missing={done.missing} listable={done.listable} compact />}
            <GrowthCard />
            <Card>
              <p className="font-semibold">{t('home.postsCardTitle')}</p>
              <p className="mt-1 text-sm text-text-2">{t('home.postsCardSub')}</p>
              <div className="mt-3 flex gap-2">
                <ButtonLink to="/posts" variant="outline" className="flex-1">{t('tabs.posts')}</ButtonLink>
                <ButtonLink to={postTo} onClick={onPost} variant="primary" className="flex-1" icon={Icon.plus}>{t('post.new')}</ButtonLink>
              </div>
            </Card>
            <SafetyTips />
          </>
        } />
    </AppShell>
  )
}

// ---------------------------------------------------------------- driver
function AvailabilitySwitch({ onDark }: { onDark?: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile, driver, fleet, applyMe } = useAuth()
  const [available, setAvailable] = useState(driver?.is_available ?? true)
  const [busy, setBusy] = useState(false)
  async function toggle(next: boolean) {
    setAvailable(next)
    setBusy(true)
    try {
      await setAvailability(next)
      if (driver && profile) applyMe({ exists: true, profile, driver: { ...driver, is_available: next }, fleet })
      track('availability_set', { on: next })
      toast(next ? t('home.availableToast') : t('home.notAvailableToast'), { tone: 'success' })
    } catch {
      setAvailable(!next)
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const sw = <Switch checked={available} disabled={busy} onChange={(v) => void toggle(v)}
    label={available ? t('home.available') : t('home.notAvailable')} sub={available ? t('home.availableSub') : t('home.notAvailableSub')} />
  if (onDark) return <div className="rounded-md bg-white/12 px-3 text-white [&_.text-text-2]:text-white/80">{sw}</div>
  return <Card className={available ? 'border-success/40' : ''}>{sw}</Card>
}

function DriverHome() {
  const { t } = useTranslation()
  const { profile, driver } = useAuth()
  const city = usePlaceName()
  const greeting = useGreeting()
  const desktop = useIsDesktop()
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  useEffect(() => { trackScreen('driver_home') }, [])
  useEffect(() => { if (vehicle || verified) track('job_filter', { vehicle, verified }) }, [vehicle, verified])
  const list = usePaged<Job>((offset) => listJobs({ vehicle, verified, offset }), [vehicle, verified])
  const done = driverCompletion(profile, driver)
  // the one thing that matters on the main screen: can owners see me?
  const blocker = done.missing.find((m) => m.key === 'vehicles' || m.key === 'when')
  const filtered = !!vehicle || verified

  const hidden = blocker && (
    <Link to={`/setup?step=${blocker.step}`} onClick={() => track('hidden_banner_tap')}
      className="flex items-center gap-3 rounded-lg border border-action/50 bg-warning-soft px-4 py-3 font-medium text-warning">
      <span className="text-[length:var(--icon-size-md)]">{Icon.alert}</span>
      <span className="flex-1">{t('home.hiddenBanner')}</span>
      {Icon.chevron}
    </Link>
  )
  const main = (
    <section aria-labelledby="list-title">
      {desktop && hidden && <div className="mb-4">{hidden}</div>}
      <SectionTitle className="mb-3"
        title={<span id="list-title">{city ? t('home.jobsNearCity', { city }) : t('home.jobsNear')}</span>}
        right={list.items && <span className="shrink-0 text-sm text-text-2">{t('home.countJobs', { n: list.items.length + (list.more ? '+' : '') })}</span>} />
      <VehicleFilter value={vehicle} onChange={setVehicle} verified={verified} onVerified={setVerified} />
      <div className="mt-4">
        {list.error && <ErrorState onRetry={list.retry} />}
        {list.items?.length === 0 && (filtered
          ? <EmptyState icon={Icon.search} title={t('home.emptyFilterTitle')} body={t('home.noJobsFilter')}
              action={<Button variant="outline" onClick={() => { setVehicle(null); setVerified(false) }}>{t('home.clearFilter')}</Button>} />
          : <EmptyState icon={Icon.briefcase} title={t('home.emptyJobsTitle')} body={t('home.emptyJobsBody')}
              action={<ButtonLink to="/profile" variant="outline">{t('home.improveProfile')}</ButtonLink>} />)}
        <CardGrid>
          {list.items === null && !list.error && <CardSkeletons count={desktop ? 4 : 2} height="h-64" />}
          {list.items?.map((j) => <JobItem key={j.id} job={j} onBlocked={() => list.setItems((cur) => cur?.filter((x) => x.owner_id !== j.owner_id) || null)} />)}
        </CardGrid>
        {list.more && <Button variant="outline" block className="mt-4" loading={list.loadingMore} onClick={() => void list.loadMore()}>{t('home.moreJobs')}</Button>}
      </div>
    </section>
  )
  return (
    <AppShell title={greeting} sub={<CityLine city={city} />} width="wide" actions={<TestBadge />}
      hero={
        <>
          <HeroBar title={greeting} badge={<TestBadge />} />
          <p className="-mt-1 mb-3 text-sm"><CityLine city={city} onDark /></p>
          <AvailabilitySwitch onDark />
        </>
      }>
      <WithRail main={main}
        mobileTop={<>{hidden}<PendingHires /><RatePrompt /><GrowthCard /></>}
        rail={
          <>
            <AvailabilitySwitch />
            <PendingHires />
            <RatePrompt />
            <GrowthCard />
            {done.missing.length > 0 && <CompleteCard role="driver" percent={done.percent} missing={done.missing} listable={done.listable} compact />}
            <SafetyTips />
          </>
        } />
    </AppShell>
  )
}
