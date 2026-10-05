import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DriverCard, JobCard } from '../components/cards'
import { TruckArt, WheelArt, WrenchArt } from '../components/role-art'
import { VehicleArt } from '../components/form'
import { ShareJobButton } from '../components/growth'
import { JobItem } from '../components/jobs'
import { CityPicker } from '../components/places'
import { AppShell, BrandMark, CardGrid } from '../components/shell'
import { Button, CardSkeletons, Chip, Dialog, EmptyState, ErrorState, Icon, Note, ThemeToggle } from '../components/ui'
import { geo, pub, type Job, type PublicDriver, type PublicJob, type PublicStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { pick, placeName, VEHICLES } from '../lib/catalog'
import { referralCode, seekPath, setNext, setSeeking, type Seeking } from '../lib/share'
import { track, trackScreen } from '../lib/track'

/**
 * Sprint 8: jobs WITHOUT login. A driver sees real work in their city before giving a number;
 * the number + OTP are asked only on "Call / I'm interested", and the app then returns to that job.
 *   /start       "what are you looking for?"  work (driver) · drivers (owner) · mechanic (coming soon)
 *   /jobs        jobs, city first            /jobs/:code   one job (WhatsApp share link)
 *   /drivers     drivers, city first (first name + initial only, no photo)
 *   /mechanics   coming soon
 * The choice is remembered, so the next visit opens the right list. Names, photos and numbers of
 * owners and phone numbers of anyone are never shown here.
 */
type City = { district: string; state: string }
const CITY_KEY = 'vz-city'
const loadCity = (): City | null => { try { return JSON.parse(localStorage.getItem(CITY_KEY) || 'null') } catch { return null } }
const saveCity = (c: City) => { try { localStorage.setItem(CITY_KEY, JSON.stringify(c)) } catch { /* storage blocked */ } }

const asJob = (j: PublicJob): Job => ({
  ...j, check_flags: [], owner_name: null, business_name: null, owner_photo: null, distance_km: null, interested: false,
})

/** Header + width for the no-login pages. */
function PublicFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { lang, setLang } = useAuth()
  const nav = useNavigate()
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-header text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-header max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link to="/start" className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark size={34} />
            <span className="truncate font-display text-xl font-bold">{brand.name}</span>
          </Link>
          <button type="button" onClick={() => void setLang(lang === 'hi' ? 'en' : 'hi')} aria-label={t('settings.language')}
            className="min-h-ctl-md rounded-md px-2.5 text-sm font-semibold text-white hover:bg-white/15">{lang === 'hi' ? 'English' : 'हिंदी'}</button>
          <ThemeToggle tone="onDark" />
          <Button variant="action" size="sm" onClick={() => { track('public_login_tap'); nav('/login') }}>{t('pub.login')}</Button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 md:px-6">{children}</main>
    </div>
  )
}

function CityDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: City) => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  function gps() {
    if (!navigator.geolocation) return setMsg(t('place.gpsFail'))
    setBusy(true)
    setMsg('')
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const h = await geo.reverse(p.coords.latitude, p.coords.longitude)
        onPick({ district: h.value.split(',')[0].trim(), state: h.state })
      } catch { setMsg(t('place.gpsNoPlace')) } finally { setBusy(false) }
    }, () => { setBusy(false); setMsg(t('place.gpsFail')) }, { timeout: 12000, maximumAge: 600000 })
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('pub.pickCity')}>
      <Button variant="outline" block icon={Icon.pin} loading={busy} onClick={gps}>{t('place.gps')}</Button>
      {msg && <div className="mt-3"><Note tone="warn">{msg}</Note></div>}
      <div className="mt-4">
        <CityPicker multi={false} value={[]} onToggle={(_, h) => onPick({ district: h.en, state: h.state })} />
      </div>
    </Dialog>
  )
}

/** "Call the owner" without login: remember this job, then number + OTP. */
function useAskLogin() {
  const nav = useNavigate()
  return (code: string | undefined, from: string) => {
    track('public_contact_tap', { from })
    if (code) setNext(`/jobs/${code}`)
    nav('/login')
  }
}

function PublicJobCard({ job, onContact, full }: { job: PublicJob; onContact: () => void; full?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const place = job.owner_district && job.owner_state ? placeName(`${job.owner_district}, ${job.owner_state}`, lang) : ''
  const actions = (
    <>
      <div className="mt-3 flex gap-2">
        <Button variant="success" block icon={Icon.phone} onClick={onContact}>{t('pub.callOwner')}</Button>
        <ShareJobButton post={job} from="public" iconOnly />
      </div>
    </>
  )
  return (
    <JobCard full={full}
      data={{ title: job.owner_verified ? t('pub.ownerVerified') : t('pub.owner'), verified: job.owner_verified, place, rating_avg: job.owner_rating_avg, rating_count: job.owner_rating_count, jobsDone: job.owner_jobs_done, fastReply: job.owner_fast_reply, post: { ...job, check_flags: [] } }}
      actions={actions} />
  )
}

function ReferralWelcome() {
  const { t } = useTranslation()
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const code = referralCode()
    if (code) pub.ref(code).then((r) => setName(r.name)).catch(() => {})
  }, [])
  if (!name) return null
  return <div className="mb-4"><Note tone="success" icon={Icon.gift}>{t('pub.invitedBy', { name })}</Note></div>
}

export default function PublicJobs() {
  const { code } = useParams()
  const { pathname } = useLocation()
  if (code) return <OneJob code={code} />
  if (pathname === '/drivers') return <DriverList />
  if (pathname === '/mechanics') return <MechanicSoon />
  if (pathname === '/start') return <Chooser />
  return <JobList />
}

/** "What are you looking for?" — the three kinds of visitor, each to its own list. */
function Chooser() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [jobs, setJobs] = useState<number | null>(null)
  const [drivers, setDrivers] = useState<number | null>(null)
  useEffect(() => {
    trackScreen('public_start')
    pub.stats().then((s) => setJobs(s.drivers)).catch(() => {})
    pub.driverStats().then((s) => setDrivers(s.drivers)).catch(() => {})
  }, [])
  const go = (s: Seeking) => { setSeeking(s); track('seeking_set', { seeking: s }); nav(seekPath(s)) }
  const card = 'flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-card text-left lg:flex-col lg:items-start lg:gap-3 shadow-sm transition-colors hover:border-primary hover:bg-primary-soft/40'
  return (
    <PublicFrame>
      <ReferralWelcome />
      <div className="mx-auto max-w-xl lg:max-w-4xl">
        <h1 className="font-display text-3xl font-bold leading-tight">{t('pub.startTitle')}</h1>
        <p className="mt-1 text-text-2">{t('pub.startSub')}</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-3 lg:gap-grid">
          <button type="button" className={card} onClick={() => go('job')}>
            <span className="grid h-[72px] w-[92px] shrink-0 place-items-center rounded-md bg-brand-soft"><WheelArt /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xl leading-snug">{t('pub.wantWork')}</strong>
              <span className="block text-sm text-text-2">{t('pub.wantWorkSub')}</span>
              {!!jobs && <span className="mt-1 block text-sm font-semibold text-success">{t('pub.wantedAll', { n: jobs })}</span>}
            </span>
            <span className="text-text-2 lg:hidden">{Icon.chevron}</span>
          </button>
          <button type="button" className={card} onClick={() => go('driver')}>
            <span className="grid h-[72px] w-[92px] shrink-0 place-items-center rounded-md bg-accent-soft"><TruckArt /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xl leading-snug">{t('pub.wantDriver')}</strong>
              <span className="block text-sm text-text-2">{t('pub.wantDriverSub')}</span>
              {!!drivers && <span className="mt-1 block text-sm font-semibold text-success">{t('pub.driversReady', { n: drivers })}</span>}
            </span>
            <span className="text-text-2 lg:hidden">{Icon.chevron}</span>
          </button>
          <button type="button" className={card} onClick={() => go('mechanic')}>
            <span className="grid h-[72px] w-[92px] shrink-0 place-items-center rounded-md bg-surface-2 text-text-2"><WrenchArt /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xl leading-snug">{t('pub.wantMechanic')}</strong>
              <span className="block text-sm text-text-2">{t('pub.wantMechanicSub')}</span>
              <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-ink">{t('soon')}</span>
            </span>
            <span className="text-text-2 lg:hidden">{Icon.chevron}</span>
          </button>
        </div>
      </div>
    </PublicFrame>
  )
}

/** Switch between "find work", "find drivers" and "mechanic" on the list pages. */
function SeekSwitch({ value }: { value: Seeking }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const opts: { key: Seeking; label: string; icon: ReactNode }[] = [
    { key: 'job', label: t('pub.tabWork'), icon: Icon.briefcase },
    { key: 'driver', label: t('pub.tabDrivers'), icon: Icon.users },
    { key: 'mechanic', label: t('pub.tabMechanic'), icon: Icon.wrench },
  ]
  return (
    <div role="tablist" aria-label={t('pub.startTitle')} className="mb-5 grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1 shadow-sm">
      {opts.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key}
          onClick={() => { if (o.key !== value) { setSeeking(o.key); track('seeking_set', { seeking: o.key, from: 'tabs' }); nav(seekPath(o.key)) } }}
          className="flex min-h-ctl-lg flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-xs font-semibold leading-tight text-text-2 aria-selected:bg-primary aria-selected:text-on-primary sm:flex-row sm:gap-2 sm:text-sm">
          <span className="text-[length:var(--icon-size-md)]">{o.icon}</span>{o.label}
        </button>
      ))}
    </div>
  )
}

/** Owners before login: drivers ready for work. "Call" asks for the number first, then opens the full list. */
function DriverList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const [city, setCity] = useState<City | null>(loadCity)
  const [pickOpen, setPickOpen] = useState(false)
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [stats, setStats] = useState<{ drivers: number; drivers_here: number } | null>(null)
  const [items, setItems] = useState<PublicDriver[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => { setSeeking('driver'); trackScreen('public_drivers'); track('public_drivers_view', { city: city?.district || null }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    setItems(null)
    setError(false)
    pub.driverStats(city?.district).then((s) => alive && setStats(s)).catch(() => {})
    pub.drivers({ district: city?.district, vehicle }).then((r) => { if (alive) { setItems(r.items); setMore(r.has_more) } }).catch(() => alive && setError(true))
    return () => { alive = false }
  }, [city, vehicle, tick])
  const cityName = city ? placeName(`${city.district}, ${city.state}`, lang) : ''
  const here = !!city && (stats?.drivers_here || 0) > 0
  const title = here ? t('pub.driversIn', { n: stats!.drivers_here, city: cityName })
    : (stats?.drivers || 0) > 0 ? t('pub.driversReady', { n: stats!.drivers }) : t('pub.driversTitleEmpty')
  const askLogin = (from: string) => { track('public_contact_tap', { from, target: 'driver' }); setNext('/home'); nav('/login') }
  async function loadMore() {
    setLoadingMore(true)
    try {
      const r = await pub.drivers({ district: city?.district, vehicle, offset: items?.length || 0 })
      setItems((cur) => [...(cur || []), ...r.items])
      setMore(r.has_more)
    } finally { setLoadingMore(false) }
  }
  return (
    <PublicFrame>
      <SeekSwitch value="driver" />
      <section className="mb-5">
        <h1 className="font-display text-3xl font-bold leading-tight">{title}</h1>
        <p className="mt-1 text-text-2">{t('pub.driversSub')}</p>
      </section>
      <div role="group" aria-label={t('home.filter')} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip selected={!!city} onClick={() => setPickOpen(true)} icon={Icon.pin}>{cityName || t('pub.pickCity')} <span className="text-[0.8em]">{Icon.down}</span></Chip>
        <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        <Chip selected={!vehicle} onClick={() => setVehicle(null)}>{t('home.allVehicles')}</Chip>
        {VEHICLES.map((v) => (
          <Chip key={v.key} selected={vehicle === v.key} onClick={() => setVehicle(vehicle === v.key ? null : v.key)} icon={<VehicleArt kind={v.key} className="h-4 w-7" />}>{pick(v.label, lang)}</Chip>
        ))}
      </div>
      {error && <ErrorState onRetry={() => setTick((n) => n + 1)} />}
      {items?.length === 0 && (
        <EmptyState icon={Icon.users} title={t('pub.driversEmptyTitle')} body={t('pub.driversEmptyBody')}
          action={<Button variant="action" onClick={() => askLogin('empty')}>{t('pub.postFree')}</Button>} />
      )}
      <CardGrid>
        {items === null && !error && <CardSkeletons count={4} height="h-64" />}
        {items?.map((d, i) => (
          <DriverCard key={`${d.name}-${i}`}
            data={{ name: d.name || t('role.driver'), photo_url: null, verified: d.verified, rating_avg: d.rating_avg, rating_count: d.rating_count, top: d.top, jobs_done: d.jobs_done, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
            actions={<Button variant="success" block icon={Icon.phone} className="mt-3" onClick={() => askLogin('list')}>{t('pub.callDriver')}</Button>} />
        ))}
      </CardGrid>
      {more && <Button variant="outline" block className="mt-4" loading={loadingMore} onClick={() => void loadMore()}>{t('home.more')}</Button>}
      <section className="mt-8 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <p className="font-semibold">{t('pub.howTitle')}</p>
        <ol className="mt-2 space-y-1.5 text-text-2">
          {[1, 2, 3].map((n) => <li key={n} className="flex gap-2"><span className="font-bold text-primary">{n}.</span>{t(`pub.ownerHow${n}`)}</li>)}
        </ol>
      </section>
      <CityDialog open={pickOpen} onClose={() => setPickOpen(false)} onPick={(c) => { setCity(c); saveCity(c); setPickOpen(false); track('public_city_set') }} />
    </PublicFrame>
  )
}

/** Mechanic: coming soon. Explains what is coming and lets people join as driver / owner meanwhile. */
function MechanicSoon() {
  const { t } = useTranslation()
  const nav = useNavigate()
  useEffect(() => { setSeeking('mechanic'); trackScreen('public_mechanics') }, [])
  return (
    <PublicFrame>
      <SeekSwitch value="mechanic" />
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-5 text-center shadow-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink"><WrenchArt /></span>
        <h1 className="mt-3 font-display text-2xl font-bold">{t('pub.mechTitle')}</h1>
        <p className="mt-1 text-text-2">{t('pub.mechSub')}</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left">
          {[1, 2, 3].map((n) => <li key={n} className="flex gap-2"><span className="text-success">{Icon.check}</span>{t(`pub.mech${n}`)}</li>)}
        </ul>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" icon={Icon.briefcase} onClick={() => { setSeeking('job'); nav('/jobs') }}>{t('pub.wantWork')}</Button>
          <Button variant="outline" icon={Icon.users} onClick={() => { setSeeking('driver'); nav('/drivers') }}>{t('pub.wantDriver')}</Button>
        </div>
      </div>
    </PublicFrame>
  )
}

function JobList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const askLogin = useAskLogin()
  const [city, setCity] = useState<City | null>(loadCity)
  const [pickOpen, setPickOpen] = useState(false)
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [items, setItems] = useState<PublicJob[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => { setSeeking('job'); trackScreen('public_jobs'); track('public_jobs_view', { city: city?.district || null }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    setItems(null)
    setError(false)
    pub.stats(city?.district).then((s) => alive && setStats(s)).catch(() => {})
    pub.jobs({ district: city?.district, vehicle }).then((r) => { if (alive) { setItems(r.items); setMore(r.has_more) } }).catch(() => alive && setError(true))
    return () => { alive = false }
  }, [city, vehicle, tick])

  const cityName = city ? placeName(`${city.district}, ${city.state}`, lang) : ''
  const here = !!city && (stats?.drivers_here || 0) > 0
  const title = here ? t('pub.wantedIn', { n: stats!.drivers_here, city: cityName })
    : (stats?.drivers || 0) > 0 ? t('pub.wantedAll', { n: stats!.drivers }) : t('pub.titleEmpty')

  async function loadMore() {
    setLoadingMore(true)
    try {
      const r = await pub.jobs({ district: city?.district, vehicle, offset: items?.length || 0 })
      setItems((cur) => [...(cur || []), ...r.items])
      setMore(r.has_more)
    } finally { setLoadingMore(false) }
  }

  return (
    <PublicFrame>
      <ReferralWelcome />
      <SeekSwitch value="job" />
      <section className="mb-5">
        <h1 className="font-display text-3xl font-bold leading-tight">{title}</h1>
        <p className="mt-1 text-text-2">{t('pub.sub')}</p>
        {city && stats && !here && stats.drivers > 0 && <p className="mt-1 text-sm text-text-2">{t('pub.noneInCity', { city: cityName })}</p>}
        {stats && (stats.hired || 0) > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
            {Icon.check}{city && (stats.hired_here || 0) > 0 ? t('pub.hiredIn', { n: stats.hired_here, city: cityName }) : t('pub.hiredAll', { n: stats.hired })}
          </p>
        )}
      </section>
      <div role="group" aria-label={t('home.filter')} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip selected={!!city} onClick={() => setPickOpen(true)} icon={Icon.pin}>{cityName || t('pub.pickCity')} <span className="text-[0.8em]">{Icon.down}</span></Chip>
        <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        <Chip selected={!vehicle} onClick={() => setVehicle(null)}>{t('home.allVehicles')}</Chip>
        {VEHICLES.map((v) => (
          <Chip key={v.key} selected={vehicle === v.key} onClick={() => setVehicle(vehicle === v.key ? null : v.key)} icon={<VehicleArt kind={v.key} className="h-4 w-7" />}>{pick(v.label, lang)}</Chip>
        ))}
      </div>
      {error && <ErrorState onRetry={() => setTick((n) => n + 1)} />}
      {items?.length === 0 && (
        <EmptyState icon={Icon.briefcase} title={t('pub.emptyTitle')} body={t('pub.emptyBody')}
          action={<Button variant="action" onClick={() => askLogin(undefined, 'empty')}>{t('pub.joinFree')}</Button>} />
      )}
      <CardGrid>
        {items === null && !error && <CardSkeletons count={4} height="h-72" />}
        {items?.map((j) => <PublicJobCard key={j.id} job={j} onContact={() => askLogin(j.share_code, 'list')} />)}
      </CardGrid>
      {more && <Button variant="outline" block className="mt-4" loading={loadingMore} onClick={() => void loadMore()}>{t('home.moreJobs')}</Button>}

      <section className="mt-8 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="font-semibold">{t('pub.howTitle')}</p>
          <ol className="mt-2 space-y-1.5 text-text-2">
            {[1, 2, 3].map((n) => <li key={n} className="flex gap-2"><span className="font-bold text-primary">{n}.</span>{t(`pub.how${n}`)}</li>)}
          </ol>
        </div>
        <div className="flex flex-col rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="font-semibold">{t('pub.ownerTitle')}</p>
          <p className="mt-1 flex-1 text-text-2">{t('pub.ownerSub')}</p>
          <Button variant="primary" className="mt-3 self-start" icon={Icon.users} onClick={() => { setSeeking('driver'); nav('/drivers') }}>{t('pub.ownerCta')}</Button>
        </div>
      </section>
      <CityDialog open={pickOpen} onClose={() => setPickOpen(false)} onPick={(c) => { setCity(c); saveCity(c); setPickOpen(false); track('public_city_set') }} />
    </PublicFrame>
  )
}

/** One shared job. Signed out: "Call" asks for the number first. Signed in: the normal job card. */
function OneJob({ code }: { code: string }) {
  const { t } = useTranslation()
  const { status, profile } = useAuth()
  const askLogin = useAskLogin()
  const [job, setJob] = useState<PublicJob | null>(null)
  const [error, setError] = useState<'' | 'missing' | 'net'>('')
  useEffect(() => {
    trackScreen('shared_job')
    track('public_jobs_view', { job: code })
    pub.job(code).then(setJob).catch((e) => setError(e?.status === 404 ? 'missing' : 'net'))
  }, [code])

  const signedIn = status === 'ready'
  const body = (
    <div className="mx-auto max-w-xl">
      {!signedIn && <ReferralWelcome />}
      {error === 'net' && <ErrorState onRetry={() => window.location.reload()} />}
      {error === 'missing' && <EmptyState icon={Icon.search} title={t('pub.missingTitle')} body={t('pub.missingBody')} />}
      {!job && !error && <CardSkeletons count={1} height="h-80" />}
      {job && job.open === false && <div className="mb-3"><Note tone="warn">{t('pub.filled')}</Note></div>}
      {job && (signedIn && profile?.role === 'driver' && job.open !== false
        ? <JobItem job={asJob(job)} />
        : signedIn
          ? <JobCard data={{ title: t('pub.owner'), verified: job.owner_verified, place: '', post: { ...job, check_flags: [] } }} actions={<ShareJobButton post={job} from="shared" />} />
          : job.open !== false
            ? <div className="rounded-lg border border-border bg-surface p-4 shadow-sm"><PublicJobCard job={job} full onContact={() => askLogin(code, 'shared')} /></div>
            : null)}
      <Link to={signedIn ? '/home' : '/jobs'} className="mt-5 flex min-h-ctl-md items-center justify-center gap-1 font-semibold text-primary hover:underline">
        {t('pub.moreJobs')} {Icon.chevron}
      </Link>
    </div>
  )
  if (signedIn) return <AppShell title={t('pub.sharedTitle')} back width="narrow">{body}</AppShell>
  return <PublicFrame>{body}</PublicFrame>
}
