import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Delete, Fingerprint } from 'lucide-react'

/**
 * 6 dots + a big number pad (MPIN login, setting an MPIN, the APK lock screen).
 * A pad on the screen instead of the phone keyboard: same place every time, big keys, works the
 * same on every phone. A computer keyboard also works (digits, Backspace).
 */
export function PinDots({ n, length = 6, error }: { n: number; length?: number; error?: boolean }) {
  return (
    <div className={`flex justify-center gap-3 ${error ? 'anim-shake' : ''}`} aria-hidden>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={`size-3.5 rounded-full border-2 transition-[background-color,border-color,transform] duration-200 ${error ? 'border-error bg-error' : i < n ? 'scale-110 border-primary bg-primary' : 'border-border-strong'}`} />
      ))}
    </div>
  )
}

export function PinPad({ value, onChange, length = 6, disabled, extra }: {
  value: string
  onChange: (v: string) => void
  length?: number
  disabled?: boolean
  /** bottom-left key, e.g. the fingerprint button */
  extra?: { icon: ReactNode; label: string; onClick: () => void }
}) {
  const { t } = useTranslation()
  const press = (d: string) => { if (!disabled && value.length < length) onChange(value + d) }
  const back = () => { if (!disabled) onChange(value.slice(0, -1)) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const key = 'grid size-[4.25rem] justify-self-center place-items-center rounded-full text-2xl font-semibold transition-colors select-none press hover:bg-surface-2 active:bg-primary-soft disabled:opacity-40 lg:size-14 lg:text-xl'
  return (
    <div className="mx-auto grid w-full max-w-[17rem] grid-cols-3 gap-x-5 gap-y-3" role="group" aria-label={t('pin.pad')}>
      <p className="sr-only" aria-live="polite">{t('pin.typed', { n: value.length, total: length })}</p>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={`${key} border border-border bg-surface font-display shadow-xs`} disabled={disabled} onClick={() => press(d)}>{d}</button>
      ))}
      {extra
        ? <button type="button" className={`${key} text-primary`} aria-label={extra.label} title={extra.label} onClick={extra.onClick}>{extra.icon}</button>
        : <span />}
      <button type="button" className={`${key} border border-border bg-surface font-display shadow-xs`} disabled={disabled} onClick={() => press('0')}>0</button>
      <button type="button" className={`${key} text-text-2`} disabled={disabled || !value} aria-label={t('pin.delete')} title={t('pin.delete')} onClick={back}>
        <Delete aria-hidden width="1.4em" height="1.4em" strokeWidth={1.85} />
      </button>
    </div>
  )
}

export const FingerprintIcon = <Fingerprint aria-hidden width="1.4em" height="1.4em" strokeWidth={1.85} />
