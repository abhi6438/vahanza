import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DriverCard } from '../components/cards'
import { DriverContact, HomeHeader, MainAction, SectionHead, TabPage, usePlaceName, VehicleFilter } from '../components/home'
import { Icon } from '../components/ui'
import { listDrivers, listJobs, setAvailability, type DriverListItem, type Job } from '../lib/api'
import { JobItem } from '../components/jobs'
import { useAuth } from '../lib/auth'
import { placeName } from '../lib/catalog'
import { driverCompletion } from '../lib/completion'
import { track, trackScreen } from '../lib/track'

/**
 * Main screen = only what the user came for:
 *   owner  → post button + drivers near me
 *   driver → available switch + jobs near me
 * Profile completion, own card, vehicles, coming-soon features live in the other tabs.
 */
export default function Home() {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'driver' ? <DriverHome /> : <OwnerHome />
}

function OwnerHome() {
  const { t, i18n } = useTranslation()
  const { fleet } = useAuth()
  const city = usePlaceName()
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [items, setItems] = useState<DriverListItem[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { trackScreen('owner_home') }, [])
  useEffect(() => {
    let alive = true
    setItems(null)
    setError(false)
    listDrivers({ vehicle, verified })
      .then((r) => { if (alive) { setItems(r.items); setMore(r.has_more) } })
      .catch(() => alive && setError(true))
    if (vehicle || verified) track('driver_filter', { vehicle, verified })
    return () => { alive = false }
  }, [vehicle, verified])
  async function loadMore() {
    const r = await listDrivers({ vehicle, verified, offset: items?.length || 0 })
    setItems((cur) => [...(cur || []), ...r.items])
    setMore(r.has_more)
  }
  const lang = i18n.language
  return (
    <TabPage>
      <HomeHeader>
        <MainAction icon={Icon.plus} label={t('home.post')} to={fleet.length ? '/posts/new' : '/setup?step=fleet&next=/posts/new'} onClick={() => track('post_tap', { has_fleet: fleet.length > 0 })} />
      </HomeHeader>
      <main className="mx-auto max-w-md px-4">
        <SectionHead title={city ? t('home.driversNearCity', { city }) : t('home.driversNear')} count={items ? t('home.countDrivers', { n: items.length + (more ? '+' : '') }) : undefined} />
        <VehicleFilter value={vehicle} onChange={setVehicle} verified={verified} onVerified={setVerified} />
        <div className="mt-3 flex flex-col gap-3">
          {items === null && !error && [0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-card" />)}
          {error && <p className="rounded-xl bg-card p-4 text-muted">{t('error.server')}</p>}
          {items?.length === 0 && <EmptyNote text={vehicle || verified ? t('home.noDriversFilter') : t('home.noDrivers')} />}
          {items?.map((d) => (
            <DriverCard key={d.id}
              data={{ name: d.name || '', photo_url: d.photo_url, verified: d.verified, distance_km: d.distance_km, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
              actions={<DriverContact driverId={d.id} name={(d.name || '').split(' ')[0]} />} />
          ))}
          {more && <button type="button" onClick={() => void loadMore()} className="min-h-12 rounded-xl border-2 border-brand font-bold text-brand">{t('home.more')}</button>}
        </div>
      </main>
    </TabPage>
  )
}

function DriverHome() {
  const { t } = useTranslation()
  const { profile, driver, applyMe } = useAuth()
  const city = usePlaceName()
  const [available, setAvailable] = useState(driver?.is_available ?? true)
  const [vehicle, setVehicle] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { trackScreen('driver_home') }, [])
  useEffect(() => {
    let alive = true
    setJobs(null)
    setError(false)
    listJobs({ vehicle, verified })
      .then((r) => { if (alive) { setJobs(r.items); setMore(r.has_more) } })
      .catch(() => alive && setError(true))
    if (vehicle || verified) track('job_filter', { vehicle, verified })
    return () => { alive = false }
  }, [vehicle, verified])
  async function loadMore() {
    const r = await listJobs({ vehicle, verified, offset: jobs?.length || 0 })
    setJobs((cur) => [...(cur || []), ...r.items])
    setMore(r.has_more)
  }
  const done = driverCompletion(profile, driver)
  // the one thing that matters on the main screen: can owners see me?
  const blocker = done.missing.find((m) => m.key === 'vehicles' || m.key === 'when')
  async function toggle() {
    const next = !available
    setAvailable(next)
    try {
      await setAvailability(next)
      if (driver && profile) applyMe({ exists: true, profile, driver: { ...driver, is_available: next }, fleet: [] })
      track('availability_set', { on: next })
    } catch {
      setAvailable(!next)
    }
  }
  return (
    <TabPage>
      <HomeHeader>
        <button type="button" aria-pressed={available} onClick={() => void toggle()} className="flex w-full items-center gap-3 rounded-2xl bg-white/15 px-3 py-2.5 text-left">
          <span className="flex-1">
            <strong className="block">{available ? t('home.available') : t('home.notAvailable')}</strong>
            <span className="text-sm opacity-90">{available ? t('home.availableSub') : t('home.notAvailableSub')}</span>
          </span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full ${available ? 'bg-call' : 'bg-white/30'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${available ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>
      </HomeHeader>
      <main className="mx-auto max-w-md px-4">
        {blocker && (
          <Link to={`/setup?step=${blocker.step}`} onClick={() => track('hidden_banner_tap')}
            className="mt-4 flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 font-semibold text-accent-ink">
            <span className="flex-1">{t('home.hiddenBanner')}</span>
            <span className="rotate-180">{Icon.back}</span>
          </Link>
        )}
        <SectionHead title={city ? t('home.jobsNearCity', { city }) : t('home.jobsNear')} count={jobs ? t('home.countJobs', { n: jobs.length + (more ? '+' : '') }) : undefined} />
        <VehicleFilter value={vehicle} onChange={setVehicle} verified={verified} onVerified={setVerified} />
        <div className="mt-3 flex flex-col gap-3">
          {jobs === null && !error && [0, 1].map((i) => <div key={i} className="h-52 animate-pulse rounded-2xl bg-card" />)}
          {error && <p className="rounded-xl bg-card p-4 text-muted">{t('error.server')}</p>}
          {jobs?.length === 0 && <EmptyNote text={vehicle || verified ? t('home.noJobsFilter') : t('home.noJobs')} />}
          {jobs?.map((j) => <JobItem key={j.id} job={j} />)}
          {more && <button type="button" onClick={() => void loadMore()} className="min-h-12 rounded-xl border-2 border-brand font-bold text-brand">{t('home.moreJobs')}</button>}
        </div>
      </main>
    </TabPage>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line bg-card p-4 text-[15px] text-muted">{text}</p>
}
