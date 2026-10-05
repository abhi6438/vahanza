import { canSpeak, MicButton } from './voice'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { VEHICLE_SVG } from '../assets/vehicles'
import { pick, type Opt } from '../lib/catalog'

/** Field label. Optional fields say so in words, not with an asterisk. */
export function Label({ children, optional, hint, first }: { children: ReactNode; optional?: boolean; hint?: ReactNode; first?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={first ? 'mb-2' : 'mb-2 mt-6 lg:mt-5'}>
      <p className="text-base font-semibold lg:text-[length:var(--fs-lg)]">
        {children}
        {optional && <span className="ml-1 text-sm font-semibold text-text-2">({t('optional')})</span>}
      </p>
      {hint && <p className="text-sm text-text-2">{hint}</p>}
    </div>
  )
}

export function VehicleArt({ kind, className = 'h-10 w-16' }: { kind: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: VEHICLE_SVG[kind] || '' }} />
}

const chip =
  'flex min-h-ctl-lg items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-base font-medium transition-colors hover:bg-surface-2 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary aria-pressed:ring-1 aria-pressed:ring-primary'

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
            <span className={`grid h-5 w-5 place-items-center rounded-md border-2 ${on(o.key) ? 'border-brand bg-primary text-on-primary' : 'border-border'}`}>
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
    <div className="grid gap-2 lg:grid-cols-2">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 lg:min-h-12 text-left aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary">
          {art && o.art && <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-bg"><VehicleArt kind={o.art} className="h-8 w-12" /></span>}
          <span>
            <strong className="block text-base font-semibold">{pick(o.label, i18n.language)}</strong>
            {o.sub && <span className="text-sm text-text-2">{pick(o.sub, i18n.language)}</span>}
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value.includes(o.key)} onClick={() => onPick(o.key)}
          className="relative flex flex-col items-center gap-1 rounded-lg border border-border bg-surface px-2 pb-2.5 pt-3 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary">
          <VehicleArt kind={o.key} className="h-11 w-[4.5rem] lg:h-9 lg:w-16" />
          <span className="text-sm font-semibold">{pick(o.label, i18n.language)}</span>
          {value.includes(o.key) && (
            <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-on-primary">
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
  const btn = 'grid h-ctl-lg w-14 place-items-center rounded-md border border-border bg-surface text-2xl font-semibold text-primary transition-colors hover:bg-surface-2 disabled:opacity-40'
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <output className="flex-1 text-center font-display text-3xl font-bold leading-none" aria-live="polite">
        {format ? format(value) : value}
        {unit && <small className="ml-1.5 text-base font-semibold text-text-2">{unit}</small>}
      </output>
      <button type="button" className={btn} aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  )
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className="flex min-h-ctl-lg w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2 text-left font-semibold aria-pressed:border-brand">
      <span className="flex-1">{children}</span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function TextField({ value, onChange, placeholder, label, big, inputMode, maxLength, upper, voice }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  big?: boolean
  inputMode?: 'text' | 'numeric' | 'tel'
  maxLength?: number
  upper?: boolean
  /** show a mic button: speak instead of typing (where the phone supports it) */
  voice?: boolean
}) {
  const input = (
    <input
      aria-label={label}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete="off"
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
      className={`w-full min-w-0 rounded-md border border-border bg-surface px-3.5 font-medium outline-none lg:max-w-xl transition-colors placeholder:font-normal placeholder:text-text-2/70 hover:border-text-2/40 focus:border-primary focus:ring-2 focus:ring-primary/25 ${big ? 'h-14 text-2xl lg:h-12 lg:text-xl' : 'h-ctl-lg text-base'}`}
    />
  )
  if (!voice || !canSpeak()) return input
  return (
    <div className="flex flex-wrap items-center gap-2 [&>input]:flex-1">
      {input}
      <MicButton label={label} onText={(text) => onChange((maxLength ? text.slice(0, maxLength) : text).replace(/[.।]$/, ''))} />
    </div>
  )
}

export { Note } from './ui'
