import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 6 dots + a big number pad (MPIN login, setting an MPIN, the APK lock screen).
 * A pad on the screen instead of the phone keyboard: same place every time, big keys, works the
 * same on every phone. A computer keyboard also works (digits, Backspace).
 */
export function PinDots({ n, length = 6, error }: { n: number; length?: number; error?: boolean }) {
  return (
    <div className={`flex justify-center gap-3 ${error ? 'anim-shake' : ''}`} aria-hidden>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={`size-3.5 rounded-full border-2 transition-colors ${error ? 'border-error bg-error' : i < n ? 'border-primary bg-primary' : 'border-text-2/40'}`} />
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

  const key = 'grid size-[4.25rem] justify-self-center place-items-center rounded-full text-2xl font-semibold transition-colors select-none hover:bg-surface-2 active:bg-primary-soft disabled:opacity-40 lg:size-14 lg:text-xl'
  return (
    <div className="mx-auto grid w-full max-w-[17rem] grid-cols-3 gap-x-5 gap-y-3" role="group" aria-label={t('pin.pad')}>
      <p className="sr-only" aria-live="polite">{t('pin.typed', { n: value.length, total: length })}</p>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={`${key} border border-border bg-surface`} disabled={disabled} onClick={() => press(d)}>{d}</button>
      ))}
      {extra
        ? <button type="button" className={`${key} text-primary`} aria-label={extra.label} title={extra.label} onClick={extra.onClick}>{extra.icon}</button>
        : <span />}
      <button type="button" className={`${key} border border-border bg-surface`} disabled={disabled} onClick={() => press('0')}>0</button>
      <button type="button" className={`${key} text-text-2`} disabled={disabled || !value} aria-label={t('pin.delete')} title={t('pin.delete')} onClick={back}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><path d="M17 9l-5 6M12 9l5 6" /></svg>
      </button>
    </div>
  )
}

export const FingerprintIcon = (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 11c0 3.5-.5 6.5-2 9" /><path d="M8.5 8.5A5 5 0 0 1 17 12c0 2.5-.2 5-1 7.5" /><path d="M5.6 6A9 9 0 0 1 21 12v1" />
    <path d="M3 10.5A9 9 0 0 1 4.3 7" /><path d="M7 12a5 5 0 0 1 .2-1.5" /><path d="M7 15.5c.5-1 .8-2.2 1-3.5" /><path d="M14.5 13c0 2.5-.4 4.8-1.2 7" />
  </svg>
)
