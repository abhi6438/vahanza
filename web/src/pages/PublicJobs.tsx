import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { JobCard } from '../components/cards'
import { VehicleArt } from '../components/form'
import { ShareJobButton } from '../components/growth'
import { JobItem } from '../components/jobs'
import { CityPicker } from '../components/places'
import { AppShell, BrandMark, CardGrid } from '../components/shell'
import { Button, CardSkeletons, Chip, Dialog, EmptyState, ErrorState, Icon, Note, ThemeToggle } from '../components/ui'
import { geo, pub, type Job, type PublicJob, type PublicStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { pick, placeName, VEHICLES } from '../lib/catalog'
import { referralCode, setNext } from '../lib/share'
import { track, trackScreen } from '../lib/track'

/**
 * Sprint 8: jobs WITHOUT login. A driver sees real work in their city before giving a number;
 * the number + OTP are asked only on "Call / I'm interested", and the app then returns to that job.
 *   /jobs        list (city first)        /jobs/:code   one job (WhatsApp share link)
 * Owner names and phone numbers are never shown here.
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
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link to="/jobs" className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark size={34} />
            <span className="truncate font-display text-xl font-bold">{brand.name}</span>
          </Link>
          <button type="button" onClick={() => void setLang(lang === 'hi' ? 'en' : 'hi')} aria-label={t('settings.language')}
            className="min-h-11 rounded-md px-2.5 text-sm font-semibold text-white hover:bg-white/15">{lang === 'hi' ? 'English' : 'हिंदी'}</button>
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
      <Button variant="success" block icon={Icon.phone} className="mt-3" onClick={onContact}>{t('pub.callOwner')}</Button>
      <ShareJobButton post={job} from="public" />
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
  return code ? <OneJob code={code} /> : <JobList />
}

function JobList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
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
  useEffect(() => { trackScreen('public_jobs'); track('public_jobs_view', { city: city?.district || null }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
      <section className="mb-5">
        <h1 className="font-display text-[1.75rem] font-bold leading-tight md:text-3xl">{title}</h1>
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
          <Chip key={v.key} selected={vehicle === v.key} onClick={() => setVehicle(vehicle === v.key ? null : v.key)} icon={<VehicleArt kind={v.key} className="h-5 w-8" />}>{pick(v.label, lang)}</Chip>
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
          <Button variant="primary" className="mt-3 self-start" icon={Icon.users} onClick={() => askLogin(undefined, 'owner_card')}>{t('pub.ownerCta')}</Button>
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
      <Link to={signedIn ? '/home' : '/jobs'} className="mt-5 flex min-h-11 items-center justify-center gap-1 font-semibold text-primary hover:underline">
        {t('pub.moreJobs')} {Icon.chevron}
      </Link>
    </div>
  )
  if (signedIn) return <AppShell title={t('pub.sharedTitle')} back width="narrow">{body}</AppShell>
  return <PublicFrame>{body}</PublicFrame>
}
