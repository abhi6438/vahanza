import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { VEHICLE_SVG } from '../assets/vehicles'
import { pick, type Opt } from '../lib/catalog'

/** Field label. Optional fields say so in words, not with an asterisk. */
export function Label({ children, optional, hint, first }: { children: ReactNode; optional?: boolean; hint?: ReactNode; first?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={first ? 'mb-2' : 'mb-2 mt-6'}>
      <p className="text-[17px] font-bold">
        {children}
        {optional && <span className="ml-1 text-sm font-semibold text-muted">({t('optional')})</span>}
      </p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function VehicleArt({ kind, className = 'h-10 w-16' }: { kind: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: VEHICLE_SVG[kind] || '' }} />
}

const chip =
  'flex min-h-12 items-center gap-2 rounded-xl border-2 border-line bg-card px-3.5 py-2 text-[16px] font-semibold aria-pressed:border-brand aria-pressed:bg-brand-soft'

/** Row of tappable chips. multi=true shows a tick and allows several. */
export function Chips<K extends string>({ options, value, onChange, multi }: {
  options: Opt<K>[]
  value: K | K[] | null
  onChange: (v: K) => void
  multi?: boolean
}) {
  const { i18n } = useTranslation()
  const on = (k: K) => (Array.isArray(value) ? value.includes(k) : value === k)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" className={chip} aria-pressed={on(o.key)} onClick={() => onChange(o.key)}>
          {multi && (
            <span className={`grid h-5 w-5 place-items-center rounded-md border-2 ${on(o.key) ? 'border-brand bg-brand text-white' : 'border-line'}`}>
              {on(o.key) && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>}
            </span>
          )}
          {pick(o.label, i18n.language)}
        </button>
      ))}
    </div>
  )
}

/** Big option rows (one per line) with an optional picture and sub-text. */
export function OptionList<K extends string>({ options, value, onChange, art }: {
  options: (Opt<K> & { art?: string })[]
  value: K | null
  onChange: (v: K) => void
  art?: boolean
}) {
  const { i18n } = useTranslation()
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-line bg-card p-3 text-left aria-pressed:border-brand aria-pressed:bg-brand-soft">
          {art && o.art && <span className="grid h-12 w-16 place-items-center rounded-xl bg-bg"><VehicleArt kind={o.art} className="h-9 w-14" /></span>}
          <span>
            <strong className="block text-[18px]">{pick(o.label, i18n.language)}</strong>
            {o.sub && <span className="text-sm text-muted">{pick(o.sub, i18n.language)}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Picture grid of vehicles. */
export function VehicleGrid<K extends string>({ options, value, onPick }: { options: Opt<K>[]; value: K[]; onPick: (k: K) => void }) {
  const { i18n } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value.includes(o.key)} onClick={() => onPick(o.key)}
          className="relative flex flex-col items-center gap-1 rounded-2xl border-2 border-line bg-card px-2 pb-2.5 pt-3 aria-pressed:border-brand aria-pressed:bg-brand-soft">
          <VehicleArt kind={o.key} className="h-12 w-20" />
          <span className="text-[17px] font-bold">{pick(o.label, i18n.language)}</span>
          {value.includes(o.key) && (
            <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand text-white">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** − value + control: easier than typing numbers for many users. */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999999, format, unit, label }: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  format?: (v: number) => string
  unit?: string
  label: string
}) {
  const btn = 'grid h-14 w-16 place-items-center rounded-xl border-2 border-line bg-card text-3xl font-bold text-brand disabled:opacity-40'
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <output className="flex-1 text-center font-display text-[30px] font-bold leading-none" aria-live="polite">
        {format ? format(value) : value}
        {unit && <small className="ml-1.5 text-base font-semibold text-muted">{unit}</small>}
      </output>
      <button type="button" className={btn} aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  )
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 text-left font-semibold aria-pressed:border-brand">
      <span className="flex-1">{children}</span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function TextField({ value, onChange, placeholder, label, big, inputMode, maxLength, upper }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  big?: boolean
  inputMode?: 'text' | 'numeric' | 'tel'
  maxLength?: number
  upper?: boolean
}) {
  return (
    <input
      aria-label={label}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete="off"
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
      className={`w-full rounded-2xl border-2 border-line bg-card px-4 py-3.5 font-semibold outline-none placeholder:font-normal placeholder:text-muted/70 focus:border-brand ${big ? 'text-[22px]' : 'text-[18px]'}`}
    />
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <p className={`rounded-xl px-3.5 py-2.5 text-[15px] ${tone === 'warn' ? 'bg-accent-soft text-accent-ink' : 'bg-brand-soft text-ink'}`}>{children}</p>
}
