/**
 * Rewards UI pieces used everywhere: the trust tick (gray / blue / gold / black), the Premium badge,
 * and the "this is Premium" lock card. Tick = trust (never bought); Premium = extras (points or paid).
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Tick } from '../lib/api'
import { track } from '../lib/track'
import { Icon } from './ui'

/** The tick to show: the stored one, or blue for a verified person whose tick isn't computed yet. */
export const tickOf = (tick?: Tick | null, verified?: boolean): Tick | null => tick || (verified ? 'blue' : null)

/** A round tick, e.g. on a photo. `ring` draws the card colour around it so it sits on the avatar edge. */
export function TickDot({ tick, size = 18, ring = true, className = '' }: { tick: Tick | null; size?: number; ring?: boolean; className?: string }) {
  const { t } = useTranslation()
  if (!tick) return null
  return (
    <span role="img" aria-label={t(`tick.name.${tick}`)} title={t(`tick.name.${tick}`)}
      className={`tick-fill-${tick} grid shrink-0 place-items-center rounded-full ${ring ? 'ring-2 ring-surface' : ''} ${className}`}
      style={{ width: size, height: size }}>
      <span className="grid place-items-center [&>svg]:stroke-[3]" style={{ width: size * 0.62, height: size * 0.62 }}>{Icon.check}</span>
    </span>
  )
}

/** The tick as a chip with its meaning: "जाँचा हुआ", "सुनहरा भरोसा" … (no tick → "जाँच बाकी"). */
export function TickBadge({ tick, compact }: { tick: Tick | null; compact?: boolean }) {
  const { t } = useTranslation()
  if (!tick) return <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold leading-5 text-text-2 ring-1 ring-inset ring-border">{t('badge.notVerified')}</span>
  return (
    <span className={`tick-chip-${tick} inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 text-xs font-semibold leading-5`}>
      <TickDot tick={tick} size={16} ring={false} />{compact ? t(`tick.short.${tick}`) : t(`tick.label.${tick}`)}
    </span>
  )
}

export function PremiumBadge({ on, className = '' }: { on?: boolean; className?: string }) {
  const { t } = useTranslation()
  if (!on) return null
  return (
    <span className={`premium-fill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold leading-5 shadow-xs [&>svg]:size-[1.05em] ${className}`}>
      {Icon.crown}{t('rw.premium')}
    </span>
  )
}

/** "This is a Premium extra" — a soft card with what it unlocks and a button to the Rewards page. */
export function PremiumLock({ title, body, from, children }: { title: string; body?: string; from: string; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-action/40 bg-[linear-gradient(135deg,var(--c-accent-soft),var(--c-card)_75%)] p-card">
      <div className="flex items-start gap-3">
        <span className="premium-fill icon-tile size-10 shrink-0 rounded-full [&>svg]:size-icon-md">{Icon.crown}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold leading-snug">{title}</p>
          {body && <p className="mt-0.5 text-sm text-text-2">{body}</p>}
          {children}
          <Link to={`/rewards?from=${from}`} onClick={() => track('premium_lock_tap', { from })}
            className="press mt-2.5 inline-flex min-h-ctl-sm items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-on-action shadow-sm [&>svg]:size-icon-sm">
            {Icon.crown}{t('rw.getPremium')}
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Small "your points + tick" strip for Home / Profile: one tap to the Rewards page. */
export function RewardsStrip({ points, tick, premium }: { points: number; tick: Tick | null; premium: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to="/rewards" onClick={() => track('rewards_strip_tap')}
      className="press card-lift flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
      <span className="premium-fill icon-tile size-11 shrink-0 rounded-full [&>svg]:size-icon-md">{Icon.coins}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className="font-display text-lg font-semibold">{t('rw.pointsN', { n: points.toLocaleString('en-IN') })}</strong>
          {tick && <TickBadge tick={tick} compact />}
          <PremiumBadge on={premium} />
        </span>
        <span className="block text-sm text-text-2">{premium ? t('rw.stripPremium') : t('rw.stripBody')}</span>
      </span>
      <span className="text-primary">{Icon.chevron}</span>
    </Link>
  )
}
