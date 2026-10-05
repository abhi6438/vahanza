import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { brand } from '../lib/brand'
import { useIsDesktop } from '../lib/layout'
import { BrandMark } from './shell'
import { Button, Icon, IconButton, Note } from './ui'

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

/**
 * Shared frame for setup / post steps: one question at a time.
 *   phone:   sticky top bar with progress, sticky main button at the bottom
 *   desktop: focused card in the middle of the page (like a checkout), buttons at the card's foot
 */
export function Wizard({ step, total, title, sub, children, onBack, footer, canNext = true, nextLabel, onNext, busy, error, onLater }: WizardProps) {
  const { t } = useTranslation()
  const desktop = useIsDesktop()
  const progress = total > 1 && (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text-2">{t('setup.stepOf', { n: step + 1, total })}</p>
      <div className="mt-1 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label={t('setup.stepOf', { n: step + 1, total })}>
        {Array.from({ length: total }, (_, i) => <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border"><span className={`absolute inset-0 origin-left rounded-full bg-[linear-gradient(90deg,var(--c-brand),var(--ill-teal-mid))] transition-transform duration-500 ease-[var(--ease-out)] ${i <= step ? 'scale-x-100' : 'scale-x-0'}`} /></span>)}
      </div>
    </div>
  )
  const back = onBack ? <IconButton tone={desktop ? 'outline' : 'plain'} label={t('back')} onClick={onBack}>{Icon.back}</IconButton> : <span className="size-ctl-md" />
  const actions = (
    <>
      {footer ?? <Button size="lg" block disabled={!canNext} loading={busy} onClick={onNext}>{busy ? t('saving') : nextLabel || t('next')}</Button>}
      {onLater && <button type="button" onClick={onLater} className="mt-2 min-h-ctl-sm w-full rounded-md text-center font-medium text-text-2 underline hover:text-text">{t('setup.later')}</button>}
    </>
  )
  const head = (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] md:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-text-2">{sub}</p>}
    </>
  )
  if (desktop) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="glass sticky top-0 z-20 border-b border-border">
          <div className="mx-auto flex h-header max-w-3xl items-center gap-4 px-6">
            {back}
            {progress || <span className="flex-1" />}
            <span className="flex items-center gap-2 text-sm font-semibold text-text-2"><BrandMark size={28} />{brand.name}</span>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
          <div className="anim-rise rounded-2xl border border-border bg-surface shadow-lg">
            <div className="p-8">
              {head}
              <div className="mt-6">{children}</div>
              {error && <div className="mt-4"><Note tone="error">{error}</Note></div>}
            </div>
            <div className="rounded-b-xl border-t border-border bg-surface-2 px-8 py-5"><div className="ml-auto max-w-sm">{actions}</div></div>
          </div>
        </main>
      </div>
    )
  }
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-header max-w-xl items-center gap-2 px-2 pr-4">{back}{progress}</div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-6 pt-5">
        {head}
        <div className="mt-5">{children}</div>
        {error && <div className="mt-4"><Note tone="error">{error}</Note></div>}
      </main>
      <footer className="sticky bottom-0 z-10 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="mx-auto max-w-xl">{actions}</div>
      </footer>
    </div>
  )
}
