/**
 * Driver card (what owners see) and job card (what drivers see).
 * Lists show a short card: who, can they start, vehicles, money, contact.
 * Everything else is one tap away in the "full details" dialog, so the list stays scannable.
 * `full` renders every detail inline (setup preview, profile, dialog body).
 */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AREA, COVERAGE, FACILITIES, label, LANGS, PAY, PAY_UNIT, placeName, rupees, VEHICLES, WHEELED, WORK } from '../lib/catalog'
import type { DriverDetails, FleetGroup, Post } from '../lib/api'
import { VehicleArt } from './form'
import { Avatar } from './photo'
import { Badge, Dialog, Icon } from './ui'
import { FastReplyBadge, JobsDoneBadge } from './work'

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useTranslation()
  return verified
    ? <Badge tone="success" icon={Icon.verified}>{t('badge.verified')}</Badge>
    : <Badge tone="neutral">{t('badge.notVerified')}</Badge>
}

/** "★ 4.3 (12)", or "★ New" when nobody has rated yet. */
export function RatingBadge({ avg, count }: { avg?: number | null; count?: number | null }) {
  const { t } = useTranslation()
  const star = <span className="text-[0.95em] text-action [&>svg]:size-[1.05em]">{Icon.star}</span>
  if (!count || avg == null) return <span className="inline-flex items-center gap-1 text-xs font-medium text-text-2">{star}{t('card.newRating')}</span>
  return <span className="inline-flex items-center gap-1 text-xs font-semibold">{star}{avg.toFixed(1)}<span className="font-normal text-text-2">({count})</span></span>
}

const Tag = ({ children, strong }: { children: ReactNode; strong?: boolean }) =>
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ring-1 ring-inset ${strong ? 'bg-primary-soft font-semibold text-primary ring-primary/20' : 'bg-surface-2 text-text ring-border'}`}>{children}</span>

/** One fact with a quiet icon: place, distance, experience. */
const Fact = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-text-2 [&>svg]:size-icon-sm [&>svg]:shrink-0 [&>svg]:text-text-3">{icon}<span className="truncate">{children}</span></span>
)

/** The money line: the number readers compare, on a soft panel. */
function Money({ prefix, amount, negotiable }: { prefix: string; amount: number; negotiable?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-[linear-gradient(135deg,var(--c-accent-soft),color-mix(in_srgb,var(--c-accent-soft)_40%,var(--c-card)))] px-3 py-2.5 ring-1 ring-inset ring-action/15">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-warning">{prefix}</span>
        <span className="font-display text-[1.375rem] font-semibold leading-none tracking-[-0.01em] text-text">{rupees(amount)}</span>
        <span className="text-xs text-text-2">{t('card.perMonthSavings')}</span>
      </p>
      {negotiable && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-success ring-1 ring-inset ring-success/25">{t('card.negotiable')}</span>}
    </div>
  )
}

/** Who: photo (with a tick when verified), name, the most useful line, then badges. */
function CardHead({ photo, name, meta, verified, rating, extra, menu, status }: {
  photo?: string | null; name: string; meta: ReactNode; verified: boolean; rating?: ReactNode; extra?: ReactNode; menu?: ReactNode; status?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative shrink-0">
        <Avatar url={photo} name={name} size={48} />
        {verified && <span className="absolute -bottom-0.5 -right-0.5 grid size-[1.125rem] place-items-center rounded-full bg-success text-on-success ring-2 ring-surface [&>svg]:size-3">{Icon.check}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[1.0625rem] font-semibold leading-snug tracking-[-0.005em]">{name}</p>
        {status && <div className="mt-0.5">{status}</div>}
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">{meta}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <VerifiedBadge verified={verified} />
          {rating}
          {extra}
        </div>
      </div>
      {menu}
    </div>
  )
}

function DetailsLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} className="press group mt-2 inline-flex min-h-ctl-sm items-center gap-1 self-start rounded-sm text-sm font-semibold text-primary">
      {t('card.details')}<span className="text-[0.9em] transition-transform group-hover:translate-x-0.5">{Icon.chevron}</span>
    </button>
  )
}

const cardBox = (highlight: boolean) => `card-lift flex h-full flex-col rounded-lg border bg-surface p-card shadow-sm ${highlight ? 'border-action/60 ring-1 ring-action/30' : 'border-border'}`

// ---------------------------------------------------------------- driver
export interface DriverCardData {
  name: string
  photo_url?: string | null
  place: string
  verified: boolean
  distance_km?: number | null
  rating_avg?: number | null
  rating_count?: number | null
  /** brought friends: "Top" for a few days */
  top?: boolean
  /** confirmed jobs through the app */
  jobs_done?: number
  d: DriverDetails
}

export function DriverCard({ data, self, actions, menu, full, onOpen }: { data: DriverCardData; self?: boolean; actions?: ReactNode; menu?: ReactNode; full?: boolean; onOpen?: () => void }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = i18n.language
  const d = data.d
  const showAll = full || self
  const now = d.available_from === 'now'
  const vehicles = d.vehicles.map((v) => label(VEHICLES, v as never, lang)).join(', ')
  const meta = <>
    {data.place && <Fact icon={Icon.pin}>{data.place}{data.distance_km != null ? ` · ${t('card.km', { n: data.distance_km })}` : ''}</Fact>}
    {d.experience_years != null && <Fact icon={Icon.award}>{t('card.exp', { n: d.experience_years })}</Fact>}
  </>
  const status = d.available_from
    ? <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${now ? 'text-success' : 'text-text-2'}`}>{now ? <span className="live-dot" /> : <span className="[&>svg]:size-icon-sm">{Icon.clock}</span>}{t(`card.when.${d.available_from}`)}</span>
    : undefined
  const body = (
    <>
      <CardHead photo={data.photo_url} name={data.name || t('setup.yourName')} meta={meta} verified={data.verified} menu={menu} status={status}
        rating={<RatingBadge avg={data.rating_avg} count={data.rating_count} />}
        extra={<>{data.top && <Badge tone="action" icon={Icon.sparkle}>{t('card.top')}</Badge>}<JobsDoneBadge n={data.jobs_done} /></>} />
      {d.vehicles.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2 ring-1 ring-inset ring-border">
          <span className="flex -space-x-1.5">{d.vehicles.slice(0, 3).map((v) => <span key={v} className="grid h-8 w-11 place-items-center rounded-md bg-surface shadow-xs ring-1 ring-border"><VehicleArt kind={v} className="h-5 w-8" /></span>)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{vehicles}</span>
          {d.max_wheels && d.vehicles.some((v) => WHEELED.includes(v as never)) && <span className="shrink-0 text-xs font-medium text-text-2">{t('card.wheelsMax', { n: d.max_wheels })}</span>}
        </div>
      )}
      {d.savings_wanted != null && <Money prefix={t('card.wants')} amount={d.savings_wanted} negotiable={d.savings_negotiable} />}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {d.licence_type && <Tag strong>{t('card.licence')}: {d.licence_type}</Tag>}
        {d.languages.length > 0 && <Tag>{d.languages.map((k) => label(LANGS, k, lang)).join(', ')}</Tag>}
        {showAll && d.area && <Tag>{label(AREA, d.area, lang)}</Tag>}
        {showAll && d.work_type && <Tag>{label(WORK, d.work_type, lang)}</Tag>}
      </div>
      {showAll && d.pay_prefs.length > 0 && <p className="mt-2 text-sm text-text-2">{t('card.prefers')}: <span className="text-text">{d.pay_prefs.map((k) => label(PAY, k as never, lang)).join(', ')}</span></p>}
      {self && <p className="mt-3 flex items-center gap-1.5 text-sm text-text-2">{Icon.shield}{t('card.numberHidden')}</p>}
    </>
  )
  return (
    <article className={full && !self ? 'flex flex-col' : cardBox(!!self)}>
      {body}
      {!showAll && <DetailsLink onClick={() => { setOpen(true); onOpen?.() }} />}
      {actions && <div className="mt-auto pt-1">{actions}</div>}
      {!showAll && (
        <Dialog open={open} onClose={() => setOpen(false)} title={t('card.details')} size="lg" footer={actions}>
          <DriverCard data={data} full menu={undefined} />
        </Dialog>
      )}
    </article>
  )
}

// ---------------------------------------------------------------- fleet
export function fleetTitle(g: FleetGroup, lang: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const name = label(VEHICLES, g.vehicle_type as never, lang)
  return `${g.vehicle_count} ${name}${g.wheels ? ` · ${t('wheels', { n: g.wheels })}` : ''}`
}

export function FleetRow({ g, onRemove, onEdit }: { g: FleetGroup; onRemove?: () => void; onEdit?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const bases = g.base_cities.length ? t('fleet.from', { cities: g.base_cities.map((c) => placeName(c, lang)).join(', ') }) : t('fleet.noCity')
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 shadow-sm">
      <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-surface-2 ring-1 ring-inset ring-border"><VehicleArt kind={g.vehicle_type} className="h-8 w-12" /></span>
      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-default" onClick={onEdit} disabled={!onEdit}>
        <strong className="block font-semibold">{fleetTitle(g, lang, t)}</strong>
        <span className="block truncate text-sm text-text-2">{bases}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('remove')} className="press grid size-ctl-md place-items-center rounded-full text-text-2 hover:bg-error-soft hover:text-error">{Icon.close}</button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- job / post
export interface JobCardData {
  title: string                 // owner or business name
  photo_url?: string | null
  place: string
  verified: boolean
  distance_km?: number | null
  rating_avg?: number | null
  rating_count?: number | null
  /** owner: confirmed hires through the app, and the "replies fast" badge */
  jobsDone?: number
  fastReply?: boolean
  post: Post
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'primary'> = {
  live: 'success', under_check: 'warning', paused: 'neutral', filled: 'primary', closed: 'neutral',
}

export function PostStatus({ status }: { status: string }) {
  const { t } = useTranslation()
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{t(`post.status.${status}`)}</Badge>
}

export function JobCard({ data, status, actions, self, menu, full, onOpen }: { data: JobCardData; status?: boolean; actions?: ReactNode; self?: boolean; menu?: ReactNode; full?: boolean; onOpen?: () => void }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = i18n.language
  const p = data.post
  const showAll = full || self
  const total = p.groups.reduce((s, g) => s + g.drivers_needed, 0)
  const pay = Object.entries(p.pay_mix || {}).map(([k, v]) => PAY_UNIT[k]?.fmt(v, lang)).filter(Boolean).join(' + ')
  const cities = p.base_cities.map((c) => placeName(c, lang)).join(', ')
  const meta = data.place ? <Fact icon={Icon.pin}>{data.place}{data.distance_km != null ? ` · ${t('card.km', { n: data.distance_km })}` : ''}</Fact> : null
  const groups = showAll ? p.groups : p.groups.slice(0, 2)
  return (
    <article className={full && !self ? 'flex flex-col' : cardBox(!!self && !status)}>
      {self && status ? (
        // the owner's own post: no need to repeat their own name / photo
        <div className="flex items-center gap-2">
          <PostStatus status={p.status} />
          {menu}
        </div>
      ) : (
        <CardHead photo={data.photo_url} name={data.title} meta={meta} verified={data.verified} menu={menu}
          rating={!self ? <RatingBadge avg={data.rating_avg} count={data.rating_count} /> : undefined}
          extra={status ? <PostStatus status={p.status} /> : (data.jobsDone || data.fastReply) ? <><FastReplyBadge on={data.fastReply} /><JobsDoneBadge n={data.jobsDone} /></> : undefined} />
      )}
      <ul className="mt-3 flex flex-col gap-1.5">
        {groups.map((g) => (
          <li key={g.fleet_group_id} className="flex items-center gap-3 rounded-md bg-surface-2 py-1.5 pl-1.5 pr-3 ring-1 ring-inset ring-border">
            <span className="grid h-8 w-11 shrink-0 place-items-center rounded-md bg-surface shadow-xs ring-1 ring-border"><VehicleArt kind={g.vehicle_type} className="h-5 w-8" /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label(VEHICLES, g.vehicle_type as never, lang)}{g.wheels ? <span className="font-normal text-text-2"> · {t('wheels', { n: g.wheels })}</span> : ''}</span>
            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{t('post.needN', { n: g.drivers_needed })}</span>
          </li>
        ))}
        {!showAll && p.groups.length > 2 && <li className="px-1 text-sm text-text-2">+{p.groups.length - 2} · {t('post.totalN', { n: total })}</li>}
      </ul>
      <Money prefix={t('post.savings')} amount={p.savings_monthly} negotiable={p.savings_negotiable} />
      {showAll && pay && <p className="mt-1 text-sm text-text-2">{t('post.pay')}: <span className="text-text">{pay}</span></p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.licence_type && <Tag strong>{t('card.licence')}: {p.licence_type}</Tag>}
        {cities && <Tag>{t('fleet.from', { cities })}</Tag>}
        {p.coverage && <Tag>{label(COVERAGE, p.coverage, lang)}</Tag>}
        {showAll && p.groups.length > 1 && <Tag strong>{t('post.totalN', { n: total })}</Tag>}
        {showAll && !!p.min_experience && <Tag>{t('post.minExp', { n: p.min_experience })}</Tag>}
        {showAll && p.work_type && <Tag>{label(WORK, p.work_type, lang)}</Tag>}
        {!showAll && p.facilities.length > 0 && <Badge tone="success" icon={Icon.check}>{t('post.facilitiesN', { n: p.facilities.length })}</Badge>}
      </div>
      {showAll && p.facilities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{p.facilities.map((f) => <Badge key={f} tone="success" icon={Icon.check}>{label(FACILITIES, f, lang)}</Badge>)}</div>
      )}
      {!showAll && <DetailsLink onClick={() => { setOpen(true); onOpen?.() }} />}
      {actions && <div className="mt-auto pt-1">{actions}</div>}
      {!showAll && (
        <Dialog open={open} onClose={() => setOpen(false)} title={t('card.details')} size="lg" footer={actions}>
          <JobCard data={data} full status={status} />
        </Dialog>
      )}
    </article>
  )
}
