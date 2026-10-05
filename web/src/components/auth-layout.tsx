import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { brand } from '../lib/brand'
import { useIsDesktop } from '../lib/layout'
import { BrandMark } from './shell'
import { HeroRoadArt } from '../assets/illustrations'
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
      <aside className="surface-hero sticky top-0 flex h-dvh flex-col justify-between overflow-hidden p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark size={42} />
          <span className="font-display text-2xl font-semibold tracking-[-0.01em]">{brand.name}</span>
        </div>
        <div className="max-w-md">
          <p className="font-display text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.02em]">{en ? brand.taglineEn : brand.taglineHi}</p>
          <ul className="mt-7 space-y-3.5 text-white/90">
            {([['free', Icon.money], ['direct', Icon.phone], ['checked', Icon.shield]] as const).map(([k, ic]) => (
              <li key={k} className="flex items-center gap-3">
                <span className="icon-tile size-9 bg-white/10 text-action ring-1 ring-inset ring-white/15 [&>svg]:size-icon-md">{ic}</span>
                <span>{t(`auth.point.${k}`)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 -mx-2 max-w-sm"><HeroRoadArt /></div>
        </div>
        <p className="text-sm text-white/60">{brand.nameHi} · {en ? brand.taglineHi : brand.taglineEn}</p>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-header items-center gap-2 px-8">
          {back && <IconButton tone="outline" label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>}
          <span className="flex-1 text-sm font-medium text-text-2">{title}</span>
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-8 pb-16">
          <div className="anim-rise w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg">
            {children}
            {footer && <div className="mt-8">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
