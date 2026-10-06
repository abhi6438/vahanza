/**
 * Rewards UI pieces used everywhere: the trust tick (gray / blue / gold / black), the Premium badge,
 * and the "this is Premium" lock card. Tick = trust (never bought); Premium = extras (points or paid).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { rewards as rwApi, type RewardsSummary, type Tick } from '../lib/api'
import { useAuth } from '../lib/auth'
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
      className={`tick-fill-${tick} grid shrink-0 place-items-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-surface' : ''} ${className}`}
      style={{ width: size, height: size }}>
      <span className="grid place-items-center [&>svg]:!h-full [&>svg]:!w-full [&>svg]:stroke-[3.25]" style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }}>{Icon.check}</span>
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

// ---------------------------------------------------------------- Home: points, streak, Premium at a glance
let cached: RewardsSummary | null = null
const subs = new Set<(s: RewardsSummary) => void>()
let loading: Promise<void> | null = null
/** Points / days in a row / Premium for the Home screen; loaded once per visit, shared by every piece. */
export function useRewardsSummary(): RewardsSummary | null {
  const { profile } = useAuth()
  const ok = profile?.role === 'driver' || profile?.role === 'owner'
  const [s, setS] = useState<RewardsSummary | null>(cached)
  useEffect(() => {
    if (!ok) return
    subs.add(setS)
    loading ??= rwApi.summary().then((r) => { cached = r; subs.forEach((f) => f(r)) }).catch(() => {}).finally(() => { setTimeout(() => { loading = null }, 20000) })
    return () => { subs.delete(setS) }
  }, [ok])
  return ok ? s : null
}

/** In the coloured header, next to the city: 🔥 days in a row and 🪙 points — both open the Rewards page. */
export function HeroRewardChips() {
  const { t } = useTranslation()
  const s = useRewardsSummary()
  if (!s) return null
  const chip = 'press inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/12 px-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 hover:bg-white/18'
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {s.streak_on && s.streak > 0 && (
        <Link to="/rewards?go=streak" onClick={() => track('home_streak_tap')} className={chip} aria-label={t('rw.home.streakAria', { n: s.streak })}>
          <span aria-hidden>🔥</span>{s.streak}
        </Link>
      )}
      <Link to="/rewards" onClick={() => track('home_points_tap')} className={chip} aria-label={t('rw.pointsN', { n: s.points })}>
        <span className="premium-fill grid size-5 place-items-center rounded-full [&>svg]:size-3">{Icon.coins}</span>{s.points.toLocaleString('en-IN')}
      </Link>
    </span>
  )
}

/** One slim card under the header: what Premium gives, how close the points are, and "earn points". */
export function HomeRewardsCard() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const s = useRewardsSummary()
  if (!s) return null
  const driver = profile?.role === 'driver'
  if (s.premium) {
    const until = s.premium_until ? new Date(s.premium_until).toLocaleDateString(i18n.language === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' }) : ''
    return (
      <Link to="/rewards" onClick={() => track('home_premium_tap', { on: true })}
        className="press flex items-center gap-3 rounded-lg border border-action/50 bg-[linear-gradient(135deg,var(--c-accent-soft),var(--c-card)_75%)] px-3 py-2.5 shadow-sm">
        <span className="premium-fill icon-tile size-9 shrink-0 rounded-full [&>svg]:size-icon-sm">{Icon.crown}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[0.9375rem] font-semibold leading-snug">{t('rw.home.on', { date: until })}</strong>
          <span className="block truncate text-xs text-text-2">{t(driver ? 'rw.home.onDriver' : 'rw.home.onOwner')}</span>
        </span>
        <span className="text-primary">{Icon.chevron}</span>
      </Link>
    )
  }
  const need = Math.max(0, s.plan_points - s.points)
  const pct = s.plan_points ? Math.min(100, Math.round((s.points / s.plan_points) * 100)) : 0
  return (
    <div className="rounded-lg border border-action/50 bg-[linear-gradient(135deg,var(--c-accent-soft),var(--c-card)_75%)] px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="premium-fill icon-tile size-9 shrink-0 rounded-full [&>svg]:size-icon-sm">{Icon.crown}</span>
        <Link to="/rewards" onClick={() => track('home_premium_tap', { on: false })} className="min-w-0 flex-1">
          <strong className="block text-[0.9375rem] font-semibold leading-snug">{t(driver ? 'rw.home.titleDriver' : 'rw.home.titleOwner')}</strong>
          <span className="block truncate text-xs text-text-2">
            {s.plan_points ? (need ? t('rw.home.need', { n: need.toLocaleString('en-IN'), days: s.plan_days }) : t('rw.home.ready', { days: s.plan_days })) : t('rw.home.free')}
          </span>
        </Link>
        <Link to={need ? '/invite' : '/rewards'} onClick={() => track('home_earn_tap', { need })}
          className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-action px-3 text-sm font-semibold text-on-action shadow-sm [&>svg]:size-icon-sm">
          {need ? <>{Icon.gift}{t('rw.home.earn', { n: s.per_friend })}</> : <>{Icon.crown}{t('rw.home.take')}</>}
        </Link>
      </div>
      {s.plan_points > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border" aria-hidden>
          <div className="premium-fill h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
