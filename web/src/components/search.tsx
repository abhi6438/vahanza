import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { COVERAGE, FACILITIES, LANGS, LICENCES, pick, placeName, rupees, VEHICLES, WHEELS, WHEN, WORK, type Opt } from '../lib/catalog'
import {
  cleared, DEFAULT_RADIUS, EXP_STEPS, RADII, SAVINGS_MAX_STEPS, SAVINGS_MIN_STEPS, sheetCount,
  type AnyQuery, type DriverQuery, type JobQuery, type ListKind, type Radius, type Sort,
} from '../lib/search'
import { track } from '../lib/track'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { VehicleArt } from './form'
import { TickDot } from './rewards'
import { CityPicker } from './places'
import { Button, Chip, Dialog, Icon, Switch } from './ui'
import { canSpeak, MicButton } from './voice'

/**
 * The one search + filter bar on every list:
 *   [ 🔍 search city / pincode / name / vehicle   🎤 ]  [ ⚙ Filter (2) ]
 *   [ Rewa · 50 km ✕ ] [ Newest first ✕ ] [ Clear all ]          ← what is on, each removable
 *   [ city chip (public) | All vehicles | Truck | Bus | … ]          ← quick vehicle row
 * "Filter" opens a bottom sheet on phones / a panel on the right on desktop, with a live
 * "Show 12 drivers" button. Phone numbers are never searchable (the server ignores them).
 */
export function SearchFilterBar<T extends AnyQuery>({ kind, value, onChange, count, lead, keepPlace, publicMode }: {
  kind: ListKind
  value: T
  onChange: (q: T) => void
  /** how many match a draft (the sheet's live button) */
  count: (q: T) => Promise<number>
  /** chips before the vehicle row (the public pages' city chip) */
  lead?: ReactNode
  /** "clear all" keeps the city (public pages choose it on its own chip) */
  keepPlace?: boolean
  /** no-login page: no search on firm names */
  publicMode?: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value.q)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => { setText(value.q) }, [value.q])

  const apply = (next: T, why: string) => {
    onChange(next)
    track('list_filter', { kind, why, n: sheetCount(next), q: !!next.q.trim(), vehicle: next.vehicle })
  }
  const typed = (v: string) => {
    setText(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { if (v.trim() !== latest.current.q.trim()) apply({ ...latest.current, q: v }, 'search') }, 450)
  }
  const submit = () => { window.clearTimeout(timer.current); if (text !== value.q) apply({ ...value, q: text }, 'search') }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const n = sheetCount(value)
  const active = useActiveChips(kind, value, (next) => apply(next as T, 'chip'))
  const ph = kind === 'drivers' ? t('sf.searchDrivers') : publicMode ? t('sf.searchJobsPublic') : t('sf.searchJobs')

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <form role="search" className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); submit(); (document.activeElement as HTMLElement | null)?.blur() }}>
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3 [&>svg]:size-icon-md">{Icon.search}</span>
          <input type="search" enterKeyHint="search" value={text} onChange={(e) => typed(e.target.value)} onBlur={submit}
            aria-label={t('sf.searchLabel')} placeholder={ph} autoComplete="off" maxLength={60}
            className="h-ctl-lg w-full min-w-0 rounded-full border border-border bg-surface pl-11 pr-12 text-base font-medium shadow-xs outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-text-3 hover:border-border-strong focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-brand)_15%,transparent)] [&::-webkit-search-cancel-button]:hidden" />
          <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {text && (
              <button type="button" onClick={() => { setText(''); window.clearTimeout(timer.current); apply({ ...value, q: '' }, 'search_clear') }}
                aria-label={t('sf.clearText')} title={t('sf.clearText')}
                className="press grid size-ctl-sm place-items-center rounded-full text-text-2 hover:bg-surface-2 [&>svg]:size-icon-sm">{Icon.close}</button>
            )}
            {!text && canSpeak() && <span className="[&_button]:size-ctl-sm [&_button]:min-h-0"><MicButton label={t('sf.searchLabel')} onText={(s) => { const v = s.replace(/[.।]$/, ''); setText(v); apply({ ...value, q: v }, 'voice') }} /></span>}
          </span>
        </form>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className={`press relative inline-flex h-ctl-lg shrink-0 items-center gap-2 rounded-full border px-4 font-semibold shadow-xs [&>svg]:size-icon-md ${n ? 'border-primary/70 bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-2'}`}>
          {Icon.filter}<span className="max-[359px]:sr-only">{t('sf.filter')}</span>
          {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary" aria-label={t('sf.nOn', { n })}>{n}</span>}
        </button>
      </div>

      {active.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label={t('sf.onNow')}>
          {active}
          <button type="button" onClick={() => apply(cleared(kind, value, keepPlace), 'clear_all')}
            className="press inline-flex h-chip shrink-0 items-center px-2 text-sm font-semibold text-primary underline underline-offset-2">{t('sf.clearAll')}</button>
        </div>
      )}

      <div role="group" aria-label={t('home.filter')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {lead}
        {lead && <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />}
        <Chip selected={!value.vehicle} onClick={() => apply({ ...value, vehicle: null }, 'vehicle')}>{t('home.allVehicles')}</Chip>
        {VEHICLES.map((v) => (
          <Chip key={v.key} selected={value.vehicle === v.key} onClick={() => apply({ ...value, vehicle: value.vehicle === v.key ? null : v.key }, 'vehicle')}
            icon={<VehicleArt kind={v.key} className="h-4 w-7" />}>{pick(v.label, lang)}</Chip>
        ))}
      </div>

      <FilterSheet open={open} onClose={() => setOpen(false)} kind={kind} value={value} count={count} keepPlace={keepPlace}
        onApply={(next) => { setOpen(false); apply(next, 'sheet') }} />
    </div>
  )
}

// ---------------------------------------------------------------- what is on (removable chips)
function useActiveChips(kind: ListKind, q: AnyQuery, set: (q: AnyQuery) => void): ReactNode[] {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const out: ReactNode[] = []
  const chip = (key: string, label: string, next: Partial<DriverQuery & JobQuery>) =>
    out.push(<RemovableChip key={key} label={label} onRemove={() => set({ ...q, ...next } as AnyQuery)} />)
  const list = <K extends string>(opts: Opt<K>[], keys: string[]) => keys.map((k) => pick(opts.find((o) => o.key === k)?.label, lang)).join(', ')

  if (q.place && q.radius !== null) {
    const city = placeName(`${q.place.district}, ${q.place.state}`, lang)
    chip('place', `${city} · ${q.radius ? t('sf.km', { n: q.radius }) : t('sf.anyDistance')}`, { place: null, radius: null })
  }
  if (q.sort !== 'near') chip('sort', sortLabel(t, kind, q.sort), { sort: 'near' })
  if (q.wheels) chip('wheels', t('sf.wheelsN', { n: q.wheels }), { wheels: null })
  if (q.verified) chip('verified', kind === 'drivers' ? t('sf.verifiedDrivers') : t('sf.verifiedOwners'), { verified: false })
  if ('licence' in q) {
    if (q.licence) chip('licence', pick(LICENCES.find((l) => l.key === q.licence)?.label, lang), { licence: null })
    if (q.exp_min) chip('exp', t('sf.expChip', { n: q.exp_min }), { exp_min: null })
    if (q.savings_max) chip('smax', t('sf.upTo', { v: rupees(q.savings_max) }), { savings_max: null })
    if (q.available) chip('avail', pick(WHEN.find((w) => w.key === q.available)?.label, lang), { available: null })
    if (q.rating_min) chip('rating', t('sf.ratingChip'), { rating_min: null })
    if (q.langs.length) chip('langs', list(LANGS, q.langs), { langs: [] })
    if (q.tick) chip('tick', t(`sf.tick.${q.tick}`), { tick: null })
  } else {
    if (q.savings_min) chip('smin', t('sf.atLeast', { v: rupees(q.savings_min) }), { savings_min: null })
    if (q.work.length) chip('work', list(WORK, q.work), { work: [] })
    if (q.coverage.length) chip('cov', list(COVERAGE, q.coverage), { coverage: [] })
    if (q.facilities.length) chip('fac', list(FACILITIES, q.facilities), { facilities: [] })
    if (q.new_days) chip('new', t('sf.newChip'), { new_days: null })
  }
  return out
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onRemove} aria-label={t('sf.remove', { x: label })} title={t('sf.remove', { x: label })}
      className="press anim-pop inline-flex h-chip max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full bg-primary pl-3 pr-2 text-sm font-semibold text-on-primary shadow-xs hover:brightness-110">
      <span className="truncate">{label}</span>
      <span aria-hidden className="grid size-5 place-items-center rounded-full bg-white/20 [&>svg]:size-3.5">{Icon.close}</span>
    </button>
  )
}

const sortLabel = (t: (k: string) => string, kind: ListKind, s: Sort) =>
  s === 'pay' ? t(kind === 'drivers' ? 'sf.sortPayDrivers' : 'sf.sortPayJobs') : t(`sf.sort_${s}`)

// ---------------------------------------------------------------- the sheet
function FilterSheet<T extends AnyQuery>({ open, onClose, kind, value, count, onApply, keepPlace }: {
  open: boolean; onClose: () => void; kind: ListKind; value: T; count: (q: T) => Promise<number>; onApply: (q: T) => void; keepPlace?: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [d, setD] = useState<T>(value)
  const [n, setN] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  useEffect(() => { if (open) { setD(value); setPicking(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // live count for the big button
  useEffect(() => {
    if (!open) return
    let alive = true
    setN(null)
    const h = window.setTimeout(() => { count(d).then((c) => alive && setN(c)).catch(() => alive && setN(-1)) }, 300)
    return () => { alive = false; window.clearTimeout(h) }
  }, [open, d]) // eslint-disable-line react-hooks/exhaustive-deps

  const up = (patch: Partial<DriverQuery & JobQuery>) => setD((cur) => ({ ...cur, ...patch }) as T)
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k])
  const drivers = 'licence' in d
  const city = d.place ? placeName(`${d.place.district}, ${d.place.state}`, lang) : ''
  const show = n === null ? t('sf.counting') : n < 0 ? t('sf.show') : n === 0 ? t('sf.showNone')
    : kind === 'drivers' ? t('sf.showDrivers', { n, count: n }) : t('sf.showJobs', { n, count: n })
  const sorts: Sort[] = ['near', 'new', 'pay', 'rating']

  return (
    <Dialog open={open} onClose={onClose} title={t('sf.title')} side
      footer={
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={() => setD(cleared(kind, d, keepPlace))} className="shrink-0">{t('sf.clear')}</Button>
          <Button variant="primary" size="lg" block disabled={n === 0} onClick={() => onApply(d)} data-autofocus>{show}</Button>
        </div>
      }>
      <div className="space-y-5 pb-2">
        <Group title={t('sf.sort')}>
          {sorts.map((s) => <Chip key={s} selected={d.sort === s} onClick={() => up({ sort: s })}>{sortLabel(t, kind, s)}</Chip>)}
        </Group>

        <Group title={t('sf.place')}>
          {d.place && !picking ? (
            <>
              <Chip selected onClick={() => up({ place: null, radius: null })} icon={Icon.pin}>{city} <span className="[&>svg]:size-3.5">{Icon.close}</span></Chip>
              <Chip selected={false} onClick={() => setPicking(true)}>{t('sf.placeChange')}</Chip>
            </>
          ) : !picking ? (
            <Chip selected={false} onClick={() => setPicking(true)} icon={Icon.pin}>{t('sf.placePick')}</Chip>
          ) : null}
          {picking && (
            <div className="w-full">
              <CityPicker multi={false} value={[]} onToggle={(_, h) => { up({ place: { district: h.en, state: h.state }, radius: d.radius ?? DEFAULT_RADIUS }); setPicking(false) }} />
            </div>
          )}
        </Group>
        {d.place && !picking && (
          <Group title={t('sf.radius')}>
            {RADII.map((r) => (
              <Chip key={r} selected={d.radius === r} onClick={() => up({ radius: r as Radius })}>
                {r ? t('sf.km', { n: r }) : t('sf.anyDistance')}
              </Chip>
            ))}
          </Group>
        )}

        <Group title={drivers ? t('sf.wheelsDrivers') : t('sf.wheelsJobs')}>
          <Chip selected={!d.wheels} onClick={() => up({ wheels: null })}>{t('sf.any')}</Chip>
          {WHEELS.map((w) => <Chip key={w} selected={d.wheels === w} onClick={() => up({ wheels: d.wheels === w ? null : w })}>{t('sf.wheelsN', { n: w })}</Chip>)}
        </Group>

        {drivers ? <DriverGroups d={d as DriverQuery} up={up} toggle={toggle} /> : <JobGroups d={d as JobQuery} up={up} toggle={toggle} />}

        <div className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
          <Switch checked={d.verified} onChange={(v) => up({ verified: v })} label={drivers ? t('sf.verifiedDrivers') : t('sf.verifiedOwners')} />
          {drivers
            ? <Switch checked={!!(d as DriverQuery).rating_min} onChange={(v) => up({ rating_min: v ? 4 : null })} label={t('sf.rating4')} />
            : <Switch checked={!!(d as JobQuery).new_days} onChange={(v) => up({ new_days: v ? 3 : null })} label={t('sf.new3')} />}
        </div>
      </div>
    </Dialog>
  )
}

type Up = (patch: Partial<DriverQuery & JobQuery>) => void
type Toggle = (list: string[], k: string) => string[]

function DriverGroups({ d, up, toggle }: { d: DriverQuery; up: Up; toggle: Toggle }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const nav = useNavigate()
  const owner = profile?.role === 'owner'
  const premium = !!profile?.premium_until && new Date(profile.premium_until) > new Date()
  return (
    <>
      {owner && (
        <Group title={<span className="inline-flex items-center gap-1.5">{t('sf.tickTitle')}<span className="premium-fill inline-flex items-center gap-0.5 rounded-full px-1.5 text-[0.6875rem] font-bold [&>svg]:size-3">{Icon.crown}{t('rw.premium')}</span></span>}>
          <Chip selected={!d.tick} onClick={() => up({ tick: null })}>{t('sf.any')}</Chip>
          {(['blue', 'gold'] as const).map((k) => (
            <Chip key={k} selected={d.tick === k} icon={<TickDot tick={k} size={16} ring={false} />}
              onClick={() => { if (!premium) { track('premium_lock_tap', { from: 'tick_filter' }); nav('/rewards?from=tick_filter'); return } up({ tick: d.tick === k ? null : k }) }}>
              {t(`sf.tick.${k}`)}{!premium && <span className="text-text-3 [&>svg]:size-3.5">{Icon.lock}</span>}
            </Chip>
          ))}
        </Group>
      )}
      <Group title={t('sf.licence')}>
        <Chip selected={!d.licence} onClick={() => up({ licence: null })}>{t('sf.any')}</Chip>
        {LICENCES.map((l) => <Chip key={l.key} selected={d.licence === l.key} onClick={() => up({ licence: d.licence === l.key ? null : l.key })}>{pick(l.label, lang)}</Chip>)}
      </Group>
      <Group title={t('sf.exp')}>
        <Chip selected={!d.exp_min} onClick={() => up({ exp_min: null })}>{t('sf.any')}</Chip>
        {EXP_STEPS.map((y) => <Chip key={y} selected={d.exp_min === y} onClick={() => up({ exp_min: d.exp_min === y ? null : y })}>{t('sf.expN', { n: y })}</Chip>)}
      </Group>
      <Group title={t('sf.savingsMax')}>
        <Chip selected={!d.savings_max} onClick={() => up({ savings_max: null })}>{t('sf.any')}</Chip>
        {SAVINGS_MAX_STEPS.map((v) => <Chip key={v} selected={d.savings_max === v} onClick={() => up({ savings_max: d.savings_max === v ? null : v })}>{t('sf.upTo', { v: rupees(v) })}</Chip>)}
      </Group>
      <Group title={t('sf.available')}>
        <Chip selected={!d.available} onClick={() => up({ available: null })}>{t('sf.any')}</Chip>
        {WHEN.map((w) => <Chip key={w.key} selected={d.available === w.key} onClick={() => up({ available: d.available === w.key ? null : w.key })}>{pick(w.label, lang)}</Chip>)}
      </Group>
      <Group title={t('sf.langs')}>
        {LANGS.map((l) => <Chip key={l.key} selected={d.langs.includes(l.key)} onClick={() => up({ langs: toggle(d.langs, l.key) })}>{pick(l.label, lang)}</Chip>)}
      </Group>
    </>
  )
}

function JobGroups({ d, up, toggle }: { d: JobQuery; up: Up; toggle: Toggle }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <>
      <Group title={t('sf.savingsMin')}>
        <Chip selected={!d.savings_min} onClick={() => up({ savings_min: null })}>{t('sf.any')}</Chip>
        {SAVINGS_MIN_STEPS.map((v) => <Chip key={v} selected={d.savings_min === v} onClick={() => up({ savings_min: d.savings_min === v ? null : v })}>{t('sf.atLeast', { v: rupees(v) })}</Chip>)}
      </Group>
      <Group title={t('sf.work')}>
        {WORK.map((w) => <Chip key={w.key} selected={d.work.includes(w.key)} onClick={() => up({ work: toggle(d.work, w.key) })}>{pick(w.label, lang)}</Chip>)}
      </Group>
      <Group title={t('sf.coverage')}>
        {COVERAGE.map((c) => <Chip key={c.key} selected={d.coverage.includes(c.key)} onClick={() => up({ coverage: toggle(d.coverage, c.key) })}>{pick(c.label, lang)}</Chip>)}
      </Group>
      <Group title={t('sf.facilities')}>
        {FACILITIES.map((f) => <Chip key={f.key} selected={d.facilities.includes(f.key)} onClick={() => up({ facilities: toggle(d.facilities, f.key) })}>{pick(f.label, lang)}</Chip>)}
      </Group>
    </>
  )
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 font-display text-base font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}
