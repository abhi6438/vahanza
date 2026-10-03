import type React from 'react'
import { useTranslation } from 'react-i18next'
import { AREA, COVERAGE, FACILITIES, label, LANGS, PAY, PAY_UNIT, placeName, rupees, VEHICLES, WHEELED, WORK } from '../lib/catalog'
import type { DriverDetails, FleetGroup } from '../lib/api'
import { VehicleArt } from './form'
import { Avatar } from './photo'

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useTranslation()
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-call/15 px-2 py-0.5 text-xs font-bold text-call">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>
      {t('badge.verified')}
    </span>
  ) : (
    <span className="inline-block rounded-full bg-line/70 px-2 py-0.5 text-xs font-bold text-muted">{t('badge.notVerified')}</span>
  )
}

/** "★ 4.3 (12)", or "★ New" when nobody has rated yet. */
export function RatingBadge({ avg, count }: { avg?: number | null; count?: number | null }) {
  const { t } = useTranslation()
  if (!count || avg == null) return <span className="text-xs font-semibold text-muted">★ {t('card.newRating')}</span>
  return <span className="text-xs font-bold text-ink"><span className="text-accent">★</span> {avg.toFixed(1)} <span className="font-semibold text-muted">({count})</span></span>
}

export interface DriverCardData {
  name: string
  photo_url?: string | null
  place: string
  verified: boolean
  distance_km?: number | null
  rating_avg?: number | null
  rating_count?: number | null
  d: DriverDetails
}

/** How owners see a driver. Used for the setup preview now and the driver list later. */
export function DriverCard({ data, self, actions, menu }: { data: DriverCardData; self?: boolean; actions?: React.ReactNode; menu?: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const d = data.d
  const tag = 'rounded-lg bg-bg px-2 py-1 text-[13px] font-semibold'
  const strong = 'rounded-lg bg-brand-soft px-2 py-1 text-[13px] font-bold text-brand'
  const tags = [
    d.licence_type && <span key="l" className={strong}>{t('card.licence')}: {d.licence_type}</span>,
    d.max_wheels && d.vehicles.some((v) => WHEELED.includes(v as never)) && <span key="w" className={strong}>{t('card.wheelsMax', { n: d.max_wheels })}</span>,
    d.area && <span key="a" className={tag}>{label(AREA, d.area, lang)}</span>,
    d.languages.length > 0 && <span key="g" className={tag}>{d.languages.map((k) => label(LANGS, k, lang)).join(', ')}</span>,
    d.work_type && <span key="k" className={tag}>{label(WORK, d.work_type, lang)}</span>,
    d.available_from && <span key="n" className={d.available_from === 'now' ? 'rounded-lg bg-call/15 px-2 py-1 text-[13px] font-bold text-call' : tag}>{t(`card.when.${d.available_from}`)}</span>,
  ].filter(Boolean)
  return (
    <article className={`rounded-2xl border-2 bg-card p-4 ${self ? 'border-accent' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <Avatar url={data.photo_url} name={data.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-bold">{data.name || t('setup.yourName')}</p>
          <p className="text-sm text-muted">
            {data.place}
            {data.distance_km != null && ` · ${t('card.km', { n: data.distance_km })}`}
            {d.experience_years != null && ` · ${t('card.exp', { n: d.experience_years })}`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <VerifiedBadge verified={data.verified} />
            <RatingBadge avg={data.rating_avg} count={data.rating_count} />
          </div>
        </div>
        <div className="flex flex-col gap-1">{d.vehicles.slice(0, 2).map((v) => <VehicleArt key={v} kind={v} className="h-7 w-12" />)}</div>
        {menu}
      </div>
      {d.savings_wanted != null && (
        <p className="mt-3 font-display text-[22px] font-bold">
          <small className="text-sm font-semibold text-muted">{t('card.wants')} </small>
          {rupees(d.savings_wanted)}
          <small className="text-sm font-semibold text-muted">{t('card.perMonthSavings')}</small>
        </p>
      )}
      {d.savings_wanted != null && d.savings_negotiable && <p className="text-sm font-semibold text-call">{t('card.negotiable')}</p>}
      {d.pay_prefs.length > 0 && <p className="mt-1 text-sm">{t('card.prefers')}: {d.pay_prefs.map((k) => label(PAY, k as never, lang)).join(', ')}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">{tags}</div>
      {self && <p className="mt-3 text-sm text-muted">{t('card.numberHidden')}</p>}
      {actions}
    </article>
  )
}

export function fleetTitle(g: FleetGroup, lang: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const name = label(VEHICLES, g.vehicle_type as never, lang)
  return `${g.vehicle_count} ${name}${g.wheels ? ` · ${t('wheels', { n: g.wheels })}` : ''}`
}

export function FleetRow({ g, onRemove, onEdit }: { g: FleetGroup; onRemove?: () => void; onEdit?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const bases = g.base_cities.length ? t('fleet.from', { cities: g.base_cities.map((c) => placeName(c, lang)).join(', ') }) : t('fleet.noCity')
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card p-3">
      <span className="grid h-12 w-16 place-items-center rounded-xl bg-bg"><VehicleArt kind={g.vehicle_type} className="h-9 w-14" /></span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} disabled={!onEdit}>
        <strong className="block text-[17px]">{fleetTitle(g, lang, t)}</strong>
        <span className="block truncate text-sm text-muted">{bases}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('remove')} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-2xl text-danger">×</button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- job / post card
export interface JobCardData {
  title: string                 // owner or business name
  photo_url?: string | null
  place: string
  verified: boolean
  distance_km?: number | null
  rating_avg?: number | null
  rating_count?: number | null
  post: import('../lib/api').Post
}

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-call/15 text-call',
  under_check: 'bg-accent-soft text-accent-ink',
  paused: 'bg-line text-muted',
  filled: 'bg-brand-soft text-brand',
  closed: 'bg-line text-muted',
}

/** How drivers see a post. Also used for the owner's own posts (with a status chip) and the preview. */
export function JobCard({ data, status, actions, self, menu }: { data: JobCardData; status?: boolean; actions?: React.ReactNode; self?: boolean; menu?: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const p = data.post
  const total = p.groups.reduce((s, g) => s + g.drivers_needed, 0)
  const pay = Object.entries(p.pay_mix || {}).map(([k, v]) => PAY_UNIT[k]?.fmt(v, lang)).filter(Boolean).join(' + ')
  const tag = 'rounded-lg bg-bg px-2 py-1 text-[13px] font-semibold'
  const strong = 'rounded-lg bg-brand-soft px-2 py-1 text-[13px] font-bold text-brand'
  const cities = p.base_cities.map((c) => placeName(c, lang)).join(', ')
  return (
    <article className={`rounded-2xl border-2 bg-card p-4 ${self ? 'border-accent' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <Avatar url={data.photo_url} name={data.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-bold">{data.title}</p>
          <p className="text-sm text-muted">
            {data.place}
            {data.distance_km != null && ` · ${t('card.km', { n: data.distance_km })}`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <VerifiedBadge verified={data.verified} />
            {!self && <RatingBadge avg={data.rating_avg} count={data.rating_count} />}
            {status && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status]}`}>{t(`post.status.${p.status}`)}</span>}
          </div>
        </div>
        {menu}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {p.groups.map((g) => (
          <div key={g.fleet_group_id} className="flex items-center gap-2.5 rounded-xl bg-bg px-2.5 py-1.5">
            <VehicleArt kind={g.vehicle_type} className="h-7 w-11" />
            <span className="flex-1 font-semibold">
              {label(VEHICLES, g.vehicle_type as never, lang)}{g.wheels ? ` · ${t('wheels', { n: g.wheels })}` : ''}
            </span>
            <span className="text-sm font-bold text-brand">{t('post.needN', { n: g.drivers_needed })}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-display text-[22px] font-bold">
        <small className="text-sm font-semibold text-muted">{t('post.savings')} </small>
        {rupees(p.savings_monthly)}
        <small className="text-sm font-semibold text-muted">{t('card.perMonthSavings')}</small>
      </p>
      {p.savings_negotiable && <p className="text-sm font-semibold text-call">{t('card.negotiable')}</p>}
      {pay && <p className="mt-1 text-sm">{t('post.pay')}: {pay}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.groups.length > 1 && <span className={strong}>{t('post.totalN', { n: total })}</span>}
        {p.licence_type && <span className={strong}>{t('card.licence')}: {p.licence_type}</span>}
        {!!p.min_experience && <span className={tag}>{t('post.minExp', { n: p.min_experience })}</span>}
        {cities && <span className={tag}>{t('fleet.from', { cities })}</span>}
        {p.coverage && <span className={tag}>{label(COVERAGE, p.coverage, lang)}</span>}
        {p.work_type && <span className={tag}>{label(WORK, p.work_type, lang)}</span>}
        {p.facilities.map((f) => <span key={f} className="rounded-lg bg-call/10 px-2 py-1 text-[13px] font-semibold text-call">✓ {label(FACILITIES, f, lang)}</span>)}
      </div>
      {actions}
    </article>
  )
}
