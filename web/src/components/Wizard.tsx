import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BigButton, Icon } from './ui'

export interface WizardProps {
  step: number
  total: number
  title: string
  sub?: string
  children: ReactNode
  onBack?: () => void
  /** Replaces the default Next button (e.g. "Add to list"). */
  footer?: ReactNode
  canNext?: boolean
  nextLabel?: string
  onNext?: () => void
  busy?: boolean
  error?: string
  /** Small "do it later" link under the main button (progress so far is already saved). */
  onLater?: () => void
}

/** Shared frame for setup steps: progress bar, big title, one question at a time, sticky Next. */
export function Wizard({ step, total, title, sub, children, onBack, footer, canNext = true, nextLabel, onNext, busy, error, onLater }: WizardProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-card px-4 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <div className="mx-auto flex max-w-md items-center gap-2.5">
          {onBack ? (
            <button aria-label={t('back')} onClick={onBack} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-brand">{Icon.back}</button>
          ) : (
            <span className="h-11 w-11" />
          )}
          <div className="flex-1">
            {total > 1 && (
              <>
                <p className="text-sm font-semibold text-muted">{t('setup.stepOf', { n: step + 1, total })}</p>
                <div className="mt-1 flex gap-1" aria-hidden>
                  {Array.from({ length: total }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-4">
        <h1 className="font-display text-[26px] font-bold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
        <div className="mt-5">{children}</div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 font-semibold text-danger">{error}</p>}
      </main>
      <footer className="sticky bottom-0 border-t border-line bg-bg px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="mx-auto max-w-md">
          {footer ?? (
            <BigButton disabled={!canNext || busy} onClick={onNext}>
              {busy ? t('saving') : nextLabel || t('next')}
            </BigButton>
          )}
          {onLater && (
            <button type="button" onClick={onLater} className="mt-2 w-full py-1.5 text-center font-semibold text-muted underline">
              {t('setup.later')}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
