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
    ? <Badge tone="success" icon={<span className="text-[0.9em]">{Icon.check}</span>}>{t('badge.verified')}</Badge>
    : <Badge tone="neutral">{t('badge.notVerified')}</Badge>
}

/** "★ 4.3 (12)", or "★ New" when nobody has rated yet. */
export function RatingBadge({ avg, count }: { avg?: number | null; count?: number | null }) {
  const { t } = useTranslation()
  const star = <span className="text-[0.95em] text-action">{Icon.star}</span>
  if (!count || avg == null) return <span className="inline-flex items-center gap-1 text-xs font-medium text-text-2">{star}{t('card.newRating')}</span>
  return <span className="inline-flex items-center gap-1 text-xs font-semibold">{star}{avg.toFixed(1)}<span className="font-normal text-text-2">({count})</span></span>
}

const Tag = ({ children, strong }: { children: ReactNode; strong?: boolean }) =>
  <span className={`rounded-sm px-2 py-0.5 text-sm ${strong ? 'bg-primary-soft font-semibold text-primary' : 'bg-surface-2 font-medium text-text'}`}>{children}</span>

function Money({ prefix, amount, negotiable }: { prefix: string; amount: number; negotiable?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3">
      <p className="flex flex-wrap items-baseline gap-x-1">
        <span className="text-sm text-text-2">{prefix}</span>
        <span className="font-display text-2xl font-bold leading-none">{rupees(amount)}</span>
        <span className="text-sm text-text-2">{t('card.perMonthSavings')}</span>
      </p>
      {negotiable && <p className="mt-0.5 text-sm font-medium text-success">{t('card.negotiable')}</p>}
    </div>
  )
}

function CardHead({ photo, name, meta, verified, rating, extra, menu }: {
  photo?: string | null; name: string; meta: ReactNode; verified: boolean; rating?: ReactNode; extra?: ReactNode; menu?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar url={photo} name={name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold leading-snug">{name}</p>
        <p className="truncate text-sm text-text-2">{meta}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
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
    <button type="button" onClick={onClick} className="mt-2 inline-flex min-h-ctl-sm items-center gap-1 self-start rounded-sm text-sm font-semibold text-primary hover:underline">
      {t('card.details')}<span className="text-[0.9em]">{Icon.chevron}</span>
    </button>
  )
}

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
  const meta = [data.place, data.distance_km != null ? t('card.km', { n: data.distance_km }) : '', d.experience_years != null ? t('card.exp', { n: d.experience_years }) : ''].filter(Boolean).join(' · ')
  const now = d.available_from === 'now'
  const vehicles = d.vehicles.map((v) => label(VEHICLES, v as never, lang)).join(', ')
  const body = (
    <>
      <CardHead photo={data.photo_url} name={data.name || t('setup.yourName')} meta={meta} verified={data.verified} menu={menu}
        rating={<RatingBadge avg={data.rating_avg} count={data.rating_count} />}
        extra={<>{data.top && <Badge tone="action" icon={Icon.sparkle}>{t('card.top')}</Badge>}<JobsDoneBadge n={data.jobs_done} />{d.available_from && <Badge tone={now ? 'success' : 'neutral'} icon={now ? <span className="size-1.5 rounded-full bg-current" /> : undefined}>{t(`card.when.${d.available_from}`)}</Badge>}</>} />
      {d.vehicles.length > 0 && (
        <div className="mt-3 flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2">
          <span className="flex -space-x-2">{d.vehicles.slice(0, 3).map((v) => <VehicleArt key={v} kind={v} className="h-6 w-10" />)}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{vehicles}</span>
          {d.max_wheels && d.vehicles.some((v) => WHEELED.includes(v as never)) && <span className="shrink-0 text-sm text-text-2">{t('card.wheelsMax', { n: d.max_wheels })}</span>}
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
    <article className={full && !self ? 'flex flex-col' : `flex h-full flex-col rounded-lg border bg-surface p-4 shadow-sm ${self ? 'border-action' : 'border-border'}`}>
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-surface-2"><VehicleArt kind={g.vehicle_type} className="h-8 w-12" /></span>
      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-default" onClick={onEdit} disabled={!onEdit}>
        <strong className="block font-semibold">{fleetTitle(g, lang, t)}</strong>
        <span className="block truncate text-sm text-text-2">{bases}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('remove')} className="grid size-ctl-md place-items-center rounded-md text-text-2 hover:bg-error-soft hover:text-error">{Icon.close}</button>
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
  const meta = [data.place, data.distance_km != null ? t('card.km', { n: data.distance_km }) : ''].filter(Boolean).join(' · ')
  const groups = showAll ? p.groups : p.groups.slice(0, 2)
  return (
    <article className={full && !self ? 'flex flex-col' : `flex h-full flex-col rounded-lg border bg-surface p-4 shadow-sm ${self && !status ? 'border-action' : 'border-border'}`}>
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
          <li key={g.fleet_group_id} className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-1.5">
            <VehicleArt kind={g.vehicle_type} className="h-6 w-10" />
            <span className="min-w-0 flex-1 truncate font-medium">{label(VEHICLES, g.vehicle_type as never, lang)}{g.wheels ? ` · ${t('wheels', { n: g.wheels })}` : ''}</span>
            <span className="shrink-0 text-sm font-semibold text-primary">{t('post.needN', { n: g.drivers_needed })}</span>
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
        {!showAll && p.facilities.length > 0 && <Badge tone="success">✓ {t('post.facilitiesN', { n: p.facilities.length })}</Badge>}
      </div>
      {showAll && p.facilities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{p.facilities.map((f) => <Badge key={f} tone="success">✓ {label(FACILITIES, f, lang)}</Badge>)}</div>
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
