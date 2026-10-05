import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { brand } from '../lib/brand'
import { useIsDesktop } from '../lib/layout'
import { BrandMark } from './shell'
import { Icon, IconButton, Screen, ThemeToggle, TopBar } from './ui'

/**
 * Frame for the sign-in steps (language, role, number, OTP).
 *   phone:   plain top bar, content, sticky main button at the bottom (thumb reach)
 *   desktop: brand panel on the left, the step in a focused column on the right
 */
export function AuthLayout({ title, back = true, footer, children }: { title: string; back?: boolean; footer?: ReactNode; children: ReactNode }) {
  const desktop = useIsDesktop()
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  if (!desktop) {
    return (
      <>
        <TopBar title={title} back={back} />
        <Screen footer={footer}>{children}</Screen>
      </>
    )
  }
  const en = i18n.language === 'en'
  return (
    <div className="grid min-h-full grid-cols-[minmax(380px,5fr)_7fr]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-header p-10 text-white xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <span className="font-display text-2xl font-bold">{brand.name}</span>
        </div>
        <div className="max-w-md">
          <p className="font-display text-4xl font-bold leading-tight">{en ? brand.taglineEn : brand.taglineHi}</p>
          <ul className="mt-8 space-y-4 text-lg text-white/90">
            {(['free', 'direct', 'checked'] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-white/15 text-action">{Icon.check}</span>
                <span>{t(`auth.point.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/70">{brand.nameHi} · {en ? brand.taglineHi : brand.taglineEn}</p>
        <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-24 -right-24 size-96 text-white/5"><circle cx="100" cy="100" r="100" fill="currentColor" /></svg>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-header items-center gap-2 px-8">
          {back && <IconButton tone="outline" label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>}
          <span className="flex-1 text-sm font-medium text-text-2">{title}</span>
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-8 pb-16">
          <div className="w-full max-w-md">
            {children}
            {footer && <div className="mt-8">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
