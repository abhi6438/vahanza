import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscoverArt, DriverArt, SearchArt } from '../assets/illustrations'
import { Link } from 'react-router-dom'
import { DriverCard } from '../components/cards'
import { DriverContact, usePlaceName } from '../components/home'
import { JobItem } from '../components/jobs'
import { AppShell, CardGrid, HeroBar, WithRail } from '../components/shell'
import { CardMenu, RatePrompt } from '../components/trust'
import { useToast } from '../components/toast'
import { Badge, Button, ButtonLink, Card, CardSkeletons, EmptyState, ErrorState, Icon, SectionTitle, Switch, HideableStack } from '../components/ui'
import { listDrivers, listJobs, recordView, setAvailability, type DriverListItem, type Job, type ListPage } from '../lib/api'
import { cleared, EMPTY_DRIVERS, EMPTY_JOBS, isFiltered, useListQuery } from '../lib/search'
import { SearchFilterBar } from '../components/search'
import { GrowthCard } from '../components/growth'
import { PendingHires } from '../components/work'
import { useAuth } from '../lib/auth'
import { districtName, placeName } from '../lib/catalog'
import { driverCompletion, ownerCompletion } from '../lib/completion'
import { useIsDesktop } from '../lib/layout'
import { track, trackScreen } from '../lib/track'
import { CompleteCard, PinNudge } from '../components/nudges'
import { HistoryNudge, RequestsCard, useHistoryRequests, useMyHistory } from '../components/history'
import { HeroRewardChips, HomeRewardsCard } from '../components/rewards'

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
  // a location pill: where the lists are centred
  return (
    <Link to="/setup?edit" className={`press inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-sm font-medium [&>svg]:size-icon-sm ${onDark ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15 hover:bg-white/18' : 'bg-surface-2 text-text ring-1 ring-inset ring-border hover:ring-border-strong'}`}>
      <span className={onDark ? 'text-action' : 'text-primary'}>{Icon.pin}</span><span className="truncate">{city}</span><span className="opacity-60 [&>svg]:size-3.5">{Icon.down}</span>
    </Link>
  )
}

/** Generic paged list loader used by both homes. */
function usePaged<T>(load: (offset: number) => Promise<ListPage<T>>, deps: unknown[]) {
  const [items, setItems] = useState<T[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setItems(null)
    setError(false)
    load(0).then((r) => { if (alive) { setItems(r.items); setMore(r.has_more); setTotal(r.total ?? null); setPlace(r.place ?? null) } }).catch(() => alive && setError(true))
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
  return { items, setItems, total, place, more, error, loadMore, loadingMore, retry: useCallback(() => setTick((n) => n + 1), []) }
}

function SafetyTips() {
  const { t } = useTranslation()
  return (
    <Card>
      <p className="flex items-center gap-2.5 font-display font-semibold"><span className="icon-tile size-8 bg-success-soft text-success [&>svg]:size-icon-sm">{Icon.shield}</span>{t('safety.title')}</p>
      <ul className="mt-3 space-y-2 text-sm text-text-2">
        {(['noAdvance', 'talkFirst', 'report'] as const).map((k) => (
          <li key={k} className="flex gap-2"><span className="mt-0.5 shrink-0 text-success [&>svg]:size-icon-sm">{Icon.check}</span>{t(`safety.${k}`)}</li>
        ))}
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
  const [query, setQuery] = useListQuery('owner-drivers', EMPTY_DRIVERS)
  const reqs = useHistoryRequests(true)
  useEffect(() => { trackScreen('owner_home') }, [])
  const list = usePaged<DriverListItem>((offset) => listDrivers(query, { offset }), [JSON.stringify(query)])
  const lang = i18n.language
  const postTo = fleet.length ? '/posts/new' : '/setup?step=fleet&next=/posts/new'
  const onPost = () => track('post_tap', { has_fleet: fleet.length > 0 })
  const filtered = isFiltered(query)
  const near = list.place ? districtName(list.place, lang) : ''
  const done = profile ? ownerCompletion(profile, fleet) : null

  const main = (
    <section aria-labelledby="list-title">
      <SectionTitle className="mb-3"
        title={<span id="list-title">{near ? t('sf.driversNear', { city: near }) : query.q.trim() ? t('sf.results') : city ? t('home.driversNearCity', { city }) : t('home.driversNear')}</span>}
        right={list.items && <span className="shrink-0 text-sm text-text-2" aria-live="polite">{t(filtered ? 'sf.foundDrivers' : 'home.countDrivers', { n: list.total ?? list.items.length + (list.more ? '+' : ''), count: list.total ?? 2 })}</span>} />
      <SearchFilterBar kind="drivers" value={query} onChange={setQuery} count={(q) => listDrivers(q, { limit: 1 }).then((r) => r.total ?? r.items.length)} />
      <div className="mt-4">
        {list.error && <ErrorState onRetry={list.retry} />}
        {list.items?.length === 0 && (filtered
          ? <EmptyState art={<SearchArt />} title={t('home.emptyFilterTitle')} body={t('home.noDriversFilter')}
              action={<Button variant="outline" onClick={() => setQuery(cleared('drivers', query))}>{t('home.clearFilter')}</Button>} />
          : <EmptyState art={<DriverArt />} title={t('home.emptyDriversTitle')} body={t('home.emptyDriversBody')}
              action={<ButtonLink to={postTo} onClick={onPost} variant="action" icon={Icon.plus}>{t('home.post')}</ButtonLink>} />)}
        <CardGrid>
          {list.items === null && !list.error && <CardSkeletons count={desktop ? 4 : 2} />}
          {list.items?.map((d) => (
            <DriverCard key={d.id} onOpen={() => void recordView(d.id).catch(() => {})}
              data={{ id: d.id, history: d.history_count ? { count: d.history_count, confirmed: d.history_confirmed || 0, rehire: d.history_rehire || 0 } : undefined, name: d.name || '', photo_url: d.photo_url, verified: d.verified, tick: d.tick, premium: d.premium, distance_km: d.distance_km, rating_avg: d.rating_avg, rating_count: d.rating_count, top: d.top, jobs_done: d.jobs_done, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
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
      heroTop={<HeroBar title={greeting} badge={<TestBadge />} />}
      hero={
        <>
          <div className="mb-2.5 flex items-center justify-between gap-2"><span className="min-w-0"><CityLine city={city} onDark /></span><HeroRewardChips /></div>
          <ButtonLink to={postTo} onClick={onPost} variant="action" size="lg" block icon={Icon.plus}>{t('home.post')}</ButtonLink>
        </>
      }>
      <WithRail main={main} mobileTop={<HideableStack items={[{ id: 'premium', node: <HomeRewardsCard /> }, { id: 'requests', node: <RequestsCard n={reqs} /> },
          { id: 'pin', node: <PinNudge /> }, { id: 'rate', node: <RatePrompt /> }]} />}
        rail={
          <>
            <HomeRewardsCard />
            <RequestsCard n={reqs} />
            <PinNudge />
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
  // phone header: one slim line — dot + "available" + a small switch (the long explanation is on the toast / profile)
  if (onDark) return (
    <button type="button" role="switch" aria-checked={available} disabled={busy} onClick={() => void toggle(!available)}
      className="press flex h-11 w-full items-center gap-2.5 rounded-lg bg-white/10 px-3 text-left text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm disabled:opacity-70">
      {available ? <span className="live-dot" /> : <span className="size-2.5 rounded-full bg-white/40" />}
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{available ? t('home.available') : t('home.notAvailable')}</span>
      <span className="shrink-0 text-xs text-white/70 max-[359px]:hidden">{available ? t('home.availableShort') : t('home.notAvailableShort')}</span>
      <span className={`relative shrink-0 rounded-full transition-colors ${available ? 'bg-success' : 'bg-white/25'}`} style={{ width: 40, height: 24 }}>
        <span className="absolute rounded-full bg-white shadow transition-[left]" style={{ width: 20, height: 20, top: 2, left: available ? 18 : 2 }} />
      </span>
    </button>
  )
  return <Card className={available ? 'border-success/40 bg-[linear-gradient(135deg,var(--c-success-soft),var(--c-card)_70%)]' : ''}>{sw}</Card>
}

function DriverHome() {
  const { t } = useTranslation()
  const { profile, driver } = useAuth()
  const city = usePlaceName()
  const greeting = useGreeting()
  const desktop = useIsDesktop()
  const { i18n } = useTranslation()
  const [query, setQuery] = useListQuery('driver-jobs', EMPTY_JOBS)
  const histSum = useMyHistory(true)
  useEffect(() => { trackScreen('driver_home') }, [])
  const list = usePaged<Job>((offset) => listJobs(query, { offset }), [JSON.stringify(query)])
  const done = driverCompletion(profile, driver)
  // the one thing that matters on the main screen: can owners see me?
  const blocker = done.missing.find((m) => m.key === 'vehicles' || m.key === 'when')
  const filtered = isFiltered(query)
  const near = list.place ? districtName(list.place, i18n.language) : ''

  const hidden = blocker && (
    <Link to={`/setup?step=${blocker.step}`} onClick={() => track('hidden_banner_tap')}
      className="press flex items-center gap-2.5 rounded-lg border border-action/40 bg-warning-soft px-3 py-2 text-sm font-medium leading-snug text-warning shadow-sm">
      <span className="icon-tile size-8 shrink-0 bg-action text-on-action [&>svg]:size-icon-sm">{Icon.alert}</span>
      <span className="flex-1">{t('home.hiddenBanner')}</span>
      {Icon.chevron}
    </Link>
  )
  const main = (
    <section aria-labelledby="list-title">
      {desktop && hidden && <div className="mb-4">{hidden}</div>}
      <SectionTitle className="mb-3"
        title={<span id="list-title">{near ? t('sf.jobsNear', { city: near }) : query.q.trim() ? t('sf.results') : city ? t('home.jobsNearCity', { city }) : t('home.jobsNear')}</span>}
        right={list.items && <span className="shrink-0 text-sm text-text-2" aria-live="polite">{t(filtered ? 'sf.foundJobs' : 'home.countJobs', { n: list.total ?? list.items.length + (list.more ? '+' : ''), count: list.total ?? 2 })}</span>} />
      <SearchFilterBar kind="jobs" value={query} onChange={setQuery} count={(q) => listJobs(q, { limit: 1 }).then((r) => r.total ?? r.items.length)} />
      <div className="mt-4">
        {list.error && <ErrorState onRetry={list.retry} />}
        {list.items?.length === 0 && (filtered
          ? <EmptyState art={<SearchArt />} title={t('home.emptyFilterTitle')} body={t('home.noJobsFilter')}
              action={<Button variant="outline" onClick={() => setQuery(cleared('jobs', query))}>{t('home.clearFilter')}</Button>} />
          : <EmptyState art={<DiscoverArt />} title={t('home.emptyJobsTitle')} body={t('home.emptyJobsBody')}
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
      heroTop={<HeroBar title={greeting} badge={<TestBadge />} />}
      hero={
        <>
          <div className="mb-2 flex items-center justify-between gap-2"><span className="min-w-0"><CityLine city={city} onDark /></span><HeroRewardChips /></div>
          <AvailabilitySwitch onDark />
        </>
      }>
      <WithRail main={main}
        mobileTop={<HideableStack items={[{ id: 'hidden', node: hidden }, { id: 'premium', node: <HomeRewardsCard /> }, { id: 'history', node: <HistoryNudge s={histSum} compact /> },
          { id: 'pin', node: <PinNudge /> }, { id: 'hires', node: <PendingHires /> }, { id: 'rate', node: <RatePrompt /> }, { id: 'growth', node: <GrowthCard compact /> }]} />}
        rail={
          <>
            <AvailabilitySwitch />
            <HomeRewardsCard />
            <HistoryNudge s={histSum} />
            <PinNudge />
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
