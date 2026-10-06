import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { history as api, type HistoryAnswer, type HistoryEntry, type HistorySummary, type OwnerHit } from '../lib/api'
import { label, pick, placeName, VEHICLES, WORK } from '../lib/catalog'
import { duration, isConfirmed, monthName, monthsBetween, MONTHS, period, statusLook, whoName } from '../lib/history'
import { track } from '../lib/track'
import { TextField, VehicleArt } from './form'
import { STAR_WORDS, TAGS } from './trust'
import { Avatar } from './photo'
import { Badge, Button, Icon, Skeleton } from './ui'

// ---------------------------------------------------------------- one entry
export function HistoryItem({ e, actions, compact }: { e: HistoryEntry; actions?: ReactNode; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const look = statusLook(e.status)
  const place = e.district ? (e.state ? placeName(`${e.district}, ${e.state}`, lang) : e.district) : ''
  const who = whoName(e) || t('hist.anOwner')
  return (
    <article className={`rounded-lg border bg-surface ${compact ? 'p-3' : 'p-card'} shadow-xs ${isConfirmed(e.status) ? 'border-success/40' : 'border-border'} ${e.hidden ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="icon-tile size-11 shrink-0 bg-surface-2 ring-1 ring-inset ring-border"><VehicleArt kind={e.vehicle} className="h-6 w-9" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold leading-snug">
            <span className="min-w-0 break-words">{who}</span>
            {e.owner_verified && <span className="text-success [&>svg]:size-icon-sm" title={t('hist.ownerVerified')}>{Icon.verified}</span>}
          </p>
          <p className="text-sm text-text-2">
            {label(VEHICLES, e.vehicle as never, lang)}{e.wheels ? ` · ${t('hist.wheels', { n: e.wheels })}` : ''}{place ? ` · ${place}` : ''}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="inline-flex items-center gap-1 font-medium [&>svg]:size-icon-sm">{Icon.calendar}{period(e.start_month, e.end_month, lang)}</span>
            <span className="text-text-3">({duration(monthsBetween(e.start_month, e.end_month), lang)})</span>
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={look.tone === 'neutral' ? 'neutral' : look.tone} icon={isConfirmed(e.status) ? Icon.verified : e.status === 'pending' ? Icon.clock : Icon.alert}>
          {t(`hist.status.${look.key}`)}
        </Badge>
        {e.source === 'hire' && <Badge tone="primary" icon={Icon.handshake}>{t('hist.viaApp')}</Badge>}
        {e.owner_stars ? <Badge tone="action" icon={Icon.star}>{e.owner_stars}.0 · {pick(STAR_WORDS[e.owner_stars], lang)}</Badge> : null}
        {e.rehire && <Badge tone="success" icon={Icon.refresh}>{t('hist.rehire')}</Badge>}
        {e.work_type && <Badge>{label(WORK, e.work_type, lang)}</Badge>}
        {e.hidden && <Badge icon={Icon.eye}>{t('hist.hiddenTag')}</Badge>}
      </div>
      {!!e.owner_tags?.length && (
        <p className="mt-2 text-sm text-text-2">{e.owner_tags.map((k) => pick(TAGS.driver.find((g) => g.key === k)?.label, lang)).filter(Boolean).join(' · ')}</p>
      )}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </article>
  )
}

/** "✓ 3 मालिकों ने पुष्टि की · 4 साल पक्का अनुभव · 2 दोबारा रखेंगे" */
export function HistoryLine({ s, className = '' }: { s: Pick<HistorySummary, 'confirmed' | 'rehire'> & { confirmed_years?: number; count?: number }; className?: string }) {
  const { t } = useTranslation()
  if (!s.confirmed && !s.count) return null
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${className}`}>
      {s.confirmed > 0
        ? <span className="inline-flex items-center gap-1 font-semibold text-success [&>svg]:size-icon-sm">{Icon.verified}{t('hist.lineConfirmed', { count: s.confirmed, n: s.confirmed })}</span>
        : <span className="inline-flex items-center gap-1 text-text-2 [&>svg]:size-icon-sm">{Icon.history}{t('hist.lineCount', { count: s.count, n: s.count })}</span>}
      {!!s.confirmed_years && s.confirmed_years >= 0.5 && <span className="text-text-2">· {t('hist.lineYears', { n: s.confirmed_years })}</span>}
      {s.rehire > 0 && <span className="text-text-2">· {t('hist.lineRehire', { count: s.rehire, n: s.rehire })}</span>}
    </p>
  )
}

/** Owner looking at a driver: the history, loaded when the full details open. */
export function DriverHistory({ driverId }: { driverId: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  useEffect(() => { api.ofDriver(driverId).then((r) => setItems(r.items)).catch(() => setItems([])) }, [driverId])
  return (
    <section className="mt-4">
      <h4 className="mb-2 flex items-center gap-2 font-display font-semibold [&>svg]:size-icon-sm">{Icon.history}{t('hist.title')}</h4>
      {items === null && <Skeleton className="h-20" />}
      {items?.length === 0 && <p className="text-sm text-text-2">{t('hist.noneOther')}</p>}
      <div className="flex flex-col gap-2">{items?.map((e) => <HistoryItem key={e.id} e={e} compact />)}</div>
    </section>
  )
}

// ---------------------------------------------------------------- the driver is nudged to fill it
/** Driver's own history counts (for the nudge), loaded once per screen. */
export function useMyHistory(enabled: boolean) {
  const [s, setS] = useState<HistorySummary | null>(null)
  useEffect(() => { if (enabled) api.mine().then((r) => setS(r.summary)).catch(() => {}) }, [enabled])
  return s
}

/** Owner: how many drivers are waiting for a yes / no. */
export function useHistoryRequests(enabled: boolean) {
  const [n, setN] = useState(0)
  useEffect(() => { if (enabled) api.requests().then((r) => setN(r.items.length)).catch(() => {}) }, [enabled])
  return n
}

/** Owner home: "2 drivers say they worked for you — confirm". */
export function RequestsCard({ n }: { n: number }) {
  const { t } = useTranslation()
  if (!n) return null
  return (
    <Link to="/history-requests" className="press flex items-center gap-3 rounded-lg border border-action/60 bg-warning-soft p-card shadow-sm">
      <span className="icon-tile size-11 bg-action text-on-action [&>svg]:size-icon-md">{Icon.history}</span>
      <span className="min-w-0 flex-1">
        <strong className="block font-semibold">{t('hist.reqCard', { count: n, n })}</strong>
        <span className="block text-sm text-text-2">{t('hist.reqCardSub')}</span>
      </span>
      <span className="text-primary">{Icon.chevron}</span>
    </Link>
  )
}

export function HistoryNudge({ s, compact }: { s: HistorySummary | null; compact?: boolean }) {
  const { t } = useTranslation()
  if (!s || s.confirmed >= 2) return null
  const none = s.count === 0
  return (
    <Link to={none ? '/history/new' : '/history'} onClick={() => track('history_nudge_tap', { count: s.count, confirmed: s.confirmed })}
      className="press card-lift flex items-center gap-3 rounded-lg border border-primary/40 bg-[linear-gradient(135deg,var(--c-primary-subtle),var(--c-card)_70%)] p-card shadow-sm">
      <span className="icon-tile size-12 bg-primary text-on-primary [&>svg]:size-icon-lg">{Icon.history}</span>
      <span className="min-w-0 flex-1">
        <strong className="block font-display text-base font-semibold leading-snug">{none ? t('hist.nudgeTitle') : t('hist.nudgeMore')}</strong>
        {!compact && <span className="mt-0.5 block text-sm text-text-2">{none ? t('hist.nudgeBody') : t('hist.nudgeMoreBody', { n: s.confirmed })}</span>}
        <span className="mt-1.5 flex gap-1" aria-hidden>
          {[0, 1].map((i) => <span key={i} className={`h-1.5 w-10 rounded-full ${i < s.confirmed ? 'bg-success' : i < s.count ? 'bg-action' : 'bg-border'}`} />)}
        </span>
      </span>
      <span className="text-primary">{Icon.chevron}</span>
    </Link>
  )
}

// ---------------------------------------------------------------- owner answers (app and no-login link)
export function AnswerPanel({ onAnswer, busy, driverName, start, end }: {
  onAnswer: (a: HistoryAnswer) => void; busy?: boolean; driverName: string
  /** the driver's months (YYYY-MM-DD) — "dates differ" starts from these so the owner only changes what's wrong */
  start?: string | null; end?: string | null
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [step, setStep] = useState<'ask' | 'from' | 'till' | 'rate'>('ask')
  const [mode, setMode] = useState<'yes' | 'dates'>('yes')
  const [from, setFrom] = useState<string | null>(start ? start.slice(0, 7) : null)
  const [till, setTill] = useState<string | null>(end ? end.slice(0, 7) : null)
  const [now, setNow] = useState(!!start && !end)
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [rehire, setRehire] = useState<boolean | null>(null)
  const fixed = mode === 'dates' ? { start_month: from!, end_month: now ? null : till } : {}
  if (step === 'ask') {
    return (
      <div className="grid gap-2">
        <Button variant="success" size="lg" block icon={Icon.check} disabled={busy} onClick={() => { setMode('yes'); setStep('rate') }}>{t('hist.ans.yes')}</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" icon={Icon.calendar} disabled={busy} onClick={() => { setMode('dates'); setStep('from') }}>{t('hist.ans.dates')}</Button>
          <Button variant="danger" size="lg" loading={busy} onClick={() => onAnswer({ answer: 'no' })}>{t('hist.ans.no')}</Button>
        </div>
      </div>
    )
  }
  const back = (to: 'ask' | 'from' | 'till') => (
    <button type="button" disabled={busy} onClick={() => setStep(to)} className="min-h-ctl-sm text-sm font-medium text-text-2 underline">{t('back')}</button>
  )
  if (step === 'from' || step === 'till') {
    const isFrom = step === 'from'
    const said = isFrom ? (start ? monthName(start, lang) : '') : (end ? monthName(end, lang) : start ? t('hist.ans.stillHere') : '')
    const ok = isFrom ? !!from : now || (!!till && (!from || till >= from))
    return (
      <div>
        <p className="text-sm font-semibold text-primary">{t('hist.ans.fixStep', { n: isFrom ? 1 : 2 })}</p>
        <p className="mt-1 text-lg font-semibold leading-snug">{t(isFrom ? 'hist.ans.fromQ' : 'hist.ans.tillQ', { name: driverName })}</p>
        {said && <p className="mb-3 mt-1 text-sm text-text-2">{t('hist.ans.driverSaid', { when: said })}</p>}
        {isFrom
          ? <MonthPicker key="from" value={from} onChange={setFrom} />
          : <MonthPicker key="till" value={till} onChange={(v) => { setTill(v); setNow(false) }} min={from} allowNow nowOn={now} onNow={() => setNow(!now)} nowLabel={t('hist.ans.stillHere')} />}
        <div className="mt-4 grid gap-2">
          <Button size="lg" block disabled={!ok} onClick={() => setStep(isFrom ? 'till' : 'rate')}>{t('hist.ans.next')}</Button>
          {back(isFrom ? 'ask' : 'from')}
        </div>
      </div>
    )
  }
  return (
    <div>
      {mode === 'dates' && from && (
        <p className="mb-4 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-primary-soft px-3 py-2 font-semibold text-primary [&>svg]:size-icon-sm">
          {Icon.calendar}{t('hist.ans.rightDates')}: {period(`${from}-01`, now || !till ? null : `${till}-01`, lang)}
        </p>
      )}
      <p className="font-semibold">{t('hist.ans.howWas', { name: driverName })}</p>
      <div className="mt-1 flex items-center justify-between" role="radiogroup" aria-label={t('trust.stars')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`} onClick={() => setStars(n)}
            className={`grid size-12 place-items-center rounded-md text-[1.75rem] transition-colors hover:bg-surface-2 ${n <= stars ? 'text-action' : 'text-border'}`}>{Icon.star}</button>
        ))}
      </div>
      {stars > 0 && <p className="text-center text-sm font-medium">{pick(STAR_WORDS[stars], lang)}</p>}
      {stars >= 3 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {TAGS.driver.map((g) => (
            <button key={g.key} type="button" aria-pressed={tags.includes(g.key)} onClick={() => setTags(tags.includes(g.key) ? tags.filter((x) => x !== g.key) : [...tags, g.key])}
              className="min-h-ctl-sm rounded-full border border-border px-3 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary">{pick(g.label, lang)}</button>
          ))}
        </div>
      )}
      <p className="mt-4 font-semibold">{t('hist.ans.rehireQ')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('hist.ans.rehireQ')}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={rehire === v} onClick={() => setRehire(v)}
            className="press min-h-ctl-lg rounded-md border border-border bg-surface font-semibold aria-checked:border-primary aria-checked:bg-primary-soft aria-checked:text-primary">
            {v ? t('hist.ans.rehireYes') : t('hist.ans.rehireNo')}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        <Button size="lg" block loading={busy} onClick={() => onAnswer({ answer: mode, stars: stars || null, tags, rehire, ...fixed })}>{t('hist.ans.send')}</Button>
        <button type="button" disabled={busy} onClick={() => onAnswer({ answer: mode, ...fixed })} className="min-h-ctl-sm text-sm font-medium text-text-2 underline">{t(mode === 'dates' ? 'hist.ans.skipRatingDates' : 'hist.ans.skipRating')}</button>
        {back(mode === 'dates' ? 'till' : 'ask')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- pickers (big, few words, icons)
/** Month + year with big buttons: year row, then a 4×3 grid of months. */
export function MonthPicker({ value, onChange, min, allowNow, onNow, nowOn, nowLabel }: {
  value: string | null; onChange: (v: string) => void; min?: string | null; allowNow?: boolean; onNow?: () => void; nowOn?: boolean; nowLabel?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const now = new Date()
  const thisYear = now.getFullYear()
  const [y, setY] = useState<number>(value ? Number(value.slice(0, 4)) : thisYear)
  const minY = min ? Number(min.slice(0, 4)) : thisYear - 30
  const years = Array.from({ length: Math.min(12, thisYear - minY + 1) }, (_, i) => thisYear - i)
  const [more, setMore] = useState(false)
  const allYears = Array.from({ length: thisYear - minY + 1 }, (_, i) => thisYear - i)
  const sel = value ? Number(value.slice(5, 7)) : 0
  const disabled = (m: number) => (y === thisYear && m > now.getMonth() + 1) || (!!min && `${y}-${String(m).padStart(2, '0')}` < min.slice(0, 7))
  return (
    <div>
      {allowNow && (
        <button type="button" aria-pressed={!!nowOn} onClick={onNow}
          className="press mb-4 flex min-h-ctl-lg w-full items-center gap-3 rounded-md border-2 border-border bg-surface px-4 text-left text-lg font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary">
          <span className="live-dot" />{nowLabel || t('hist.stillThere')}
        </button>
      )}
      {!nowOn && (
        <>
          <p className="mb-2 text-sm font-semibold text-text-2">{t('hist.year')}</p>
          <div className="flex flex-wrap gap-2">
            {(more ? allYears : years).map((yy) => (
              <button key={yy} type="button" aria-pressed={y === yy} onClick={() => setY(yy)}
                className="press min-h-ctl-md min-w-[4.5rem] rounded-md border border-border bg-surface px-3 text-lg font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary">{yy}</button>
            ))}
            {!more && allYears.length > years.length && (
              <button type="button" onClick={() => setMore(true)} className="min-h-ctl-md px-3 font-semibold text-primary underline">{t('hist.olderYears')}</button>
            )}
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold text-text-2">{t('hist.month')}</p>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((m, i) => {
              const mm = i + 1
              const on = value && Number(value.slice(0, 4)) === y && sel === mm
              return (
                <button key={mm} type="button" disabled={disabled(mm)} aria-pressed={!!on} onClick={() => onChange(`${y}-${String(mm).padStart(2, '0')}`)}
                  className="press min-h-ctl-lg rounded-md border border-border bg-surface text-base font-semibold disabled:opacity-30 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary">
                  {m[lang === 'en' ? 1 : 0]}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Find the owner: suggestions (owners already in touch), search by firm / name, or "not in the list". */
export function OwnerPicker({ value, onPick, onOther }: { value: OwnerHit | null; onPick: (o: OwnerHit) => void; onOther: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<OwnerHit[] | null>(null)
  useEffect(() => {
    let alive = true
    const h = window.setTimeout(() => { api.owners(q).then((r) => alive && setHits(r.items)).catch(() => alive && setHits([])) }, q ? 300 : 0)
    return () => { alive = false; window.clearTimeout(h) }
  }, [q])
  return (
    <div>
      <TextField value={q} onChange={setQ} label={t('hist.ownerSearch')} placeholder={t('hist.ownerSearchPh')} voice />
      <p className="mb-2 mt-4 text-sm font-semibold text-text-2">{q ? t('hist.ownerResults') : t('hist.ownerKnown')}</p>
      <div className="flex flex-col gap-2">
        {hits === null && <Skeleton className="h-16" />}
        {hits?.map((o) => {
          const name = o.firm_name || o.name || ''
          const place = o.district && o.state ? placeName(`${o.district}, ${o.state}`, lang) : o.district || ''
          return (
            <button key={o.id} type="button" aria-pressed={value?.id === o.id} onClick={() => onPick(o)}
              className="press flex min-h-[4rem] items-center gap-3 rounded-md border-2 border-border bg-surface px-3 text-left aria-pressed:border-primary aria-pressed:bg-primary-soft">
              <Avatar name={name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-semibold">{name}{o.verified && <span className="text-success [&>svg]:size-icon-sm">{Icon.verified}</span>}</span>
                {(o.firm_name && o.name) || place ? <span className="block text-sm text-text-2">{[o.firm_name ? o.name : null, place].filter(Boolean).join(' · ')}</span> : null}
              </span>
              {value?.id === o.id && <span className="text-primary">{Icon.check}</span>}
            </button>
          )
        })}
        {hits?.length === 0 && q.length >= 2 && <p className="text-text-2">{t('hist.ownerNone')}</p>}
      </div>
      <button type="button" onClick={onOther}
        className="press mt-4 flex min-h-[4rem] w-full items-center gap-3 rounded-md border-2 border-dashed border-primary/60 bg-primary-subtle px-4 text-left">
        <span className="icon-tile size-10 bg-primary text-on-primary [&>svg]:size-icon-md">{Icon.plus}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold text-primary">{t('hist.ownerOther')}</span>
          <span className="block text-sm text-text-2">{t('hist.ownerOtherSub')}</span>
        </span>
      </button>
    </div>
  )
}
