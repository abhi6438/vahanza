import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/photo'
import { PremiumBadge, TickBadge, TickDot } from '../components/rewards'
import { placeName } from '../lib/catalog'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, Card, ErrorState, Icon, SectionTitle, Skeleton } from '../components/ui'
import { api, ApiError, rewards, type Me, type Plan, type Rewards as RewardsData, type Tick } from '../lib/api'
import { useAuth } from '../lib/auth'
import { track, trackScreen } from '../lib/track'

const STEP_LINK: Record<string, string> = {
  profile: '/setup', verify: '/verify', verified: '/verify', history2: '/history/new', hires3: '/posts', fastOrRating: '/posts',
}
const BENEFITS = { driver: ['top', 'viewers', 'history30', 'badge'], owner: ['history', 'tickFilter', 'top', 'viewers', 'posts25', 'badge'] }
const SOON = ['coupon', 'cashback', 'cash']

/** "इनाम": points, invite friends (the biggest earner), the tick ladder, Premium (only with points), ways to earn, the hisaab. */
export default function Rewards() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const { applyMe } = useAuth()
  const [params] = useSearchParams()
  const [r, setR] = useState<RewardsData | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState('')
  const load = () => rewards.get().then(setR).catch(() => setError(true))
  useEffect(() => { trackScreen('rewards'); track('rewards_open', { from: params.get('from') || '' }); void load() }, [params])

  useEffect(() => {
    const go = params.get('go')
    if (r && go) setTimeout(() => document.getElementById(go)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [r, params])
  const refreshMe = () => api<Me>('/me').then(applyMe).catch(() => {})
  async function withPoints(p: Plan) {
    setBusy(`pts-${p.id}`)
    try {
      await rewards.buyWithPoints(p.id)
      track('premium_buy', { via: 'points', plan: p.id })
      toast(t('rw.premiumOn', { days: p.days }), { tone: 'success' })
      await Promise.all([load(), refreshMe()])
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'not_enough' ? t('rw.notEnough') : t('error.generic'), { tone: 'error' })
    } finally { setBusy('') }
  }
  const fmt = (n: number) => n.toLocaleString('en-IN')
  const until = r?.premium_until ? new Date(r.premium_until).toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'long' }) : ''
  return (
    <AppShell title={t('rw.title')} back width="narrow">
      {error && <ErrorState onRetry={() => { setError(false); void load() }} />}
      {!r && !error && <Skeleton className="h-72" />}
      {r && (
        <div className="flex flex-col gap-5">
          {/* balance + tick + premium */}
          <section className="surface-hero overflow-hidden rounded-xl p-card shadow-md">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white/80 [&>svg]:size-icon-sm [&>svg]:text-action">{Icon.coins}{t('rw.yourPoints')}</p>
            <p className="mt-0.5 font-display text-[2.5rem] font-semibold leading-none tracking-[-0.02em]">{fmt(r.points)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.tick ? <span className="rounded-full bg-white/95 p-0.5"><TickBadge tick={r.tick} /></span> : <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{t('rw.noTick')}</span>}
              {r.premium ? <PremiumBadge on /> : null}
              {r.premium && <span className="text-sm text-white/85">{t('rw.until', { date: until })}</span>}
            </div>
            {r.premium && r.premium_source && r.premium_source !== 'points' && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/12 px-2.5 py-1 text-sm font-medium ring-1 ring-inset ring-white/20 [&>svg]:size-icon-sm">{Icon.gift}{t(`rw.src.${r.premium_source}`)}</p>
            )}
          </section>

          <InviteCard inv={r.invite} role={r.role} />
          {r.streak.on && <StreakCard s={r.streak} />}
          {r.challenges.length > 0 && <Challenges items={r.challenges} />}
          {r.leaderboard.on && r.leaderboard.district && <Leaderboard lb={r.leaderboard} />}

          {/* the four ticks */}
          <section>
            <SectionTitle className="mb-3" title={t('rw.tickTitle')} sub={t('rw.tickSub')} />
            <ol className="flex flex-col gap-2">
              {r.ladder.map((l) => <TickRow key={l.tick} l={l} current={r.tick} role={r.role} />)}
            </ol>
          </section>

          {/* premium */}
          <section>
            <SectionTitle className="mb-3" title={<span className="inline-flex items-center gap-2">{t('rw.premium')} <PremiumBadge on /></span>} sub={t('rw.premiumSub')} />
            <Card>
              <ul className="flex flex-col gap-2">
                {BENEFITS[r.role].map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success text-on-success [&>svg]:size-3">{Icon.check}</span>
                    <span>{t(`rw.benefit.${r.role}.${b}`, { free: b === 'posts25' ? r.limits.posts[0] : r.limits.history[0], prem: b === 'posts25' ? r.limits.posts[1] : r.limits.history[1] })}</span>
                  </li>
                ))}
              </ul>
              {r.gold_days > 0 && ((r.tick === 'gold' || r.tick === 'black')
                ? <p className="mt-3 rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success">{t('rw.goldFreeYou', { days: r.gold_days })}</p>
                : <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-text-2">{t('rw.goldFree', { days: r.gold_days })}</p>)}
            </Card>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {r.plans.map((p) => {
                const short = p.points - r.points
                return (
                  <Card key={p.id} className={p.id === 'm3' ? 'ring-1 ring-action/50' : ''}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-display text-lg font-semibold">{t('rw.planDays', { n: p.days })}</p>
                      {p.id === 'm3' && <span className="rounded-full bg-action-soft px-2 py-0.5 text-xs font-semibold text-warning">{t('rw.bestValue')}</span>}
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Button block variant={short <= 0 ? 'primary' : 'outline'} icon={Icon.coins} disabled={short > 0 || !!busy} loading={busy === `pts-${p.id}`} onClick={() => void withPoints(p)}>
                        {t('rw.withPoints', { n: fmt(p.points) })}
                      </Button>
                      {short > 0 && <p className="text-center text-xs text-text-2">{t('rw.needMore', { n: fmt(short) })}</p>}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* how to earn */}
          <section>
            <SectionTitle className="mb-3" title={t('rw.earnTitle')} sub={t('rw.earnSub')} />
            <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              {r.earn.map((e) => (
                <li key={e.kind} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                  <span className={`icon-tile size-9 shrink-0 [&>svg]:size-icon-sm ${e.done ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'}`}>{e.done ? Icon.check : Icon.coins}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{t(`rw.kind.${e.kind}`)}</span>
                    <span className="block text-xs text-text-2">
                      {e.done ? t('rw.done') : e.once ? t('rw.once') : e.cap ? t('rw.capN', { n: e.month, cap: e.cap }) : e.kind === 'weekly_active' ? t('rw.weekly') : t('rw.each')}
                    </span>
                  </span>
                  <span className={`shrink-0 font-display font-semibold ${e.done ? 'text-text-3 line-through' : 'text-warning'}`}>+{e.points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-3">{t('rw.rules')}</p>
          </section>

          {/* coming */}
          <section>
            <SectionTitle className="mb-3" title={t('rw.soonTitle')} />
            <div className="grid grid-cols-3 gap-2">
              {SOON.map((k) => (
                <div key={k} className="rounded-lg border border-dashed border-border bg-surface-2 p-3 text-center">
                  <span className="mx-auto mb-1 grid size-9 place-items-center rounded-full bg-surface text-text-2 [&>svg]:size-icon-sm">{k === 'coupon' ? Icon.gift : k === 'cashback' ? Icon.refresh : Icon.money}</span>
                  <p className="text-sm font-semibold">{t(`rw.soon.${k}`)}</p>
                  <p className="text-[0.6875rem] text-text-3">{t('rw.comingSoon')}</p>
                </div>
              ))}
            </div>
          </section>

          {/* hisaab */}
          <section>
            <SectionTitle className="mb-3" title={t('rw.ledgerTitle')} />
            {r.ledger.length === 0
              ? <p className="rounded-lg border border-border bg-surface p-card text-sm text-text-2">{t('rw.ledgerEmpty')}</p>
              : (
                <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
                  {r.ledger.map((l, i) => (
                    <li key={i} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t(`rw.kind.${l.kind}`, { defaultValue: l.kind })}</span>
                        <span className="block text-xs text-text-3">{new Date(l.at).toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' })}</span>
                      </span>
                      <span className={`font-display font-semibold ${l.points >= 0 ? 'text-success' : 'text-error'}`}>{l.points >= 0 ? '+' : ''}{fmt(l.points)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
      )}
    </AppShell>
  )
}

/** Inviting friends earns the most: per friend, a welcome bonus for the friend, extra at 3 / 10 / 25. */
function InviteCard({ inv, role }: { inv: RewardsData['invite']; role: 'driver' | 'owner' }) {
  const { t } = useTranslation()
  const top = inv.milestones[inv.milestones.length - 1]?.at || 25
  const pct = Math.min(100, Math.round((inv.friends / top) * 100))
  return (
    <section className="overflow-hidden rounded-xl border border-action/50 bg-[linear-gradient(135deg,var(--c-accent-soft),var(--c-card)_70%)] p-card shadow-sm">
      <div className="flex items-start gap-3">
        <span className="premium-fill icon-tile size-12 shrink-0 rounded-full [&>svg]:size-icon-lg">{Icon.gift}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold leading-snug">{t('rw.inv.title', { n: inv.per_friend })}</p>
          <p className="mt-0.5 text-sm text-text-2">{t('rw.inv.body', { n: inv.friend_gets })}</p>
          {inv.cross_role > inv.per_friend && <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-warning ring-1 ring-inset ring-action/30">{t(role === 'driver' ? 'rw.inv.crossDriver' : 'rw.inv.crossOwner', { n: inv.cross_role })}</p>}
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{t('rw.inv.friends', { n: inv.friends })}</span>
          {inv.next && <span className="text-text-2">{t('rw.inv.next', { n: inv.next.at - inv.friends, pts: inv.next.points })}</span>}
        </div>
        <div className="relative mt-2 h-2.5 rounded-full bg-surface-2 ring-1 ring-inset ring-border">
          <div className="premium-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%` }} />
          {inv.milestones.map((m) => (
            <span key={m.at} className={`absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.625rem] font-bold ring-2 ring-surface ${m.done ? 'premium-fill' : 'bg-surface text-text-2 ring-border'}`}
              style={{ left: `${Math.min(100, (m.at / top) * 100)}%` }}>{m.at}</span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {inv.milestones.map((m) => (
            <div key={m.at} className={`rounded-md px-1 py-1.5 text-xs ${m.done ? 'bg-success-soft font-semibold text-success' : 'bg-surface text-text-2 ring-1 ring-inset ring-border'}`}>
              {t('rw.inv.mark', { at: m.at, pts: m.points })}{m.done ? ' ✓' : ''}
            </div>
          ))}
        </div>
      </div>
      <Link to="/invite" onClick={() => track('rewards_invite_tap')}
        className="press mt-4 flex min-h-ctl-lg w-full items-center justify-center gap-2 rounded-md bg-action font-semibold text-on-action shadow-sm [&>svg]:size-icon-md">
        {Icon.share}{t('rw.inv.cta')}
      </Link>
    </section>
  )
}

/** Open the app N days in a row → bonus. */
function StreakCard({ s }: { s: RewardsData['streak'] }) {
  const { t } = useTranslation()
  return (
    <section id="streak" className="scroll-mt-4 rounded-xl border border-border bg-surface p-card shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warning-soft text-2xl" aria-hidden>🔥</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold leading-snug">{t('rw.streak.title', { n: s.days })}</p>
          <p className="text-sm text-text-2">{t('rw.streak.body', { every: s.every, pts: s.points })}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5" aria-label={t('rw.streak.title', { n: s.days })}>
        {Array.from({ length: s.every }, (_, i) => (
          <span key={i} className={`grid h-8 flex-1 place-items-center rounded-md text-xs font-bold ${i < s.in_cycle ? 'premium-fill' : 'bg-surface-2 text-text-3 ring-1 ring-inset ring-border'}`}>
            {i === s.every - 1 ? '🎁' : i + 1}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-3">{s.today ? t('rw.streak.today') : t('rw.streak.come')}</p>
    </section>
  )
}

/** Monthly challenges set by the admin. */
function Challenges({ items }: { items: RewardsData['challenges'] }) {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  return (
    <section>
      <SectionTitle className="mb-3" title={t('rw.ch.title')} sub={t('rw.ch.sub')} />
      <div className="flex flex-col gap-2">
        {items.map((c) => (
          <div key={c.id} className={`rounded-lg border bg-surface p-3 shadow-xs ${c.done ? 'border-success/50' : 'border-border'}`}>
            <div className="flex items-start gap-3">
              <span className={`icon-tile size-10 shrink-0 [&>svg]:size-icon-md ${c.done ? 'bg-success text-on-success' : 'bg-action-soft text-warning'}`}>{c.done ? Icon.check : Icon.flag}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{(en && c.title_en) || c.title_hi}</p>
                <p className="text-xs text-text-2">{c.done ? t('rw.ch.done', { pts: c.points }) : t('rw.ch.reward', { pts: c.points, date: c.end ? new Date(c.end).toLocaleDateString(en ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' }) : '' })}</p>
              </div>
              <span className="shrink-0 font-display font-semibold text-warning">+{c.points}</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
                <div className={`h-full rounded-full ${c.done ? 'bg-success' : 'premium-fill'}`} style={{ width: `${Math.round((c.have / c.target) * 100)}%` }} />
              </div>
              <span className="shrink-0 text-xs font-semibold">{c.have}/{c.target}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** This month's top inviters in my district (prize on the 1st). */
function Leaderboard({ lb }: { lb: RewardsData['leaderboard'] }) {
  const { t, i18n } = useTranslation()
  const city = lb.district && lb.state ? placeName(`${lb.district}, ${lb.state}`, i18n.language) : lb.district || ''
  const medal = ['🥇', '🥈', '🥉']
  return (
    <section>
      <SectionTitle className="mb-3" title={t('rw.lb.title', { city })} sub={t('rw.lb.sub', { top: lb.top, pts: lb.points, days: lb.premium_days })} />
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        {lb.items.length === 0 && <p className="p-card text-sm text-text-2">{t('rw.lb.empty')}</p>}
        {lb.items.map((x) => (
          <div key={x.rank} className={`flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 ${x.me ? 'bg-primary-soft' : ''}`}>
            <span className="w-7 shrink-0 text-center font-display font-semibold">{medal[x.rank - 1] || `#${x.rank}`}</span>
            <span className="relative shrink-0"><Avatar url={x.photo_url} name={x.name} size={36} /><TickDot tick={x.tick} size={14} className="absolute -bottom-0.5 -right-0.5" /></span>
            <span className="min-w-0 flex-1 truncate font-semibold">{x.name}{x.me && <span className="ml-1.5 text-xs font-semibold text-primary">({t('rw.yours')})</span>}</span>
            <span className="shrink-0 text-sm font-semibold">{t('rw.lb.friends', { n: x.friends })}</span>
          </div>
        ))}
        {lb.me && !lb.items.some((x) => x.me) && (
          <div className="flex items-center gap-3 border-t border-border bg-primary-soft px-3 py-2.5">
            <span className="w-7 shrink-0 text-center font-display font-semibold">{lb.me.rank ? `#${lb.me.rank}` : '—'}</span>
            <span className="min-w-0 flex-1 font-semibold">{t('rw.lb.you')}</span>
            <span className="shrink-0 text-sm font-semibold">{t('rw.lb.friends', { n: lb.me.friends })}</span>
          </div>
        )}
      </div>
    </section>
  )
}

function TickRow({ l, current, role }: { l: RewardsData['ladder'][number]; current: Tick | null; role: 'driver' | 'owner' }) {
  const { t } = useTranslation()
  const rank = { gray: 1, blue: 2, gold: 3, black: 4 } as const
  const have = !!current && rank[current] >= rank[l.tick]
  const isNow = current === l.tick
  const next = l.steps.find((s) => !s.done)
  return (
    <li className={`rounded-lg border bg-surface p-3 shadow-xs ${isNow ? 'border-primary ring-1 ring-primary/30' : 'border-border'}`}>
      <div className="flex items-center gap-3">
        <TickDot tick={l.tick} size={30} ring={false} className={have ? '' : 'opacity-45'} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold leading-snug">
            {t(`tick.name.${l.tick}`)}
            {isNow && <span className="rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-semibold text-on-primary">{t('rw.yours')}</span>}
            {have && !isNow && <span className="text-success [&>svg]:size-icon-sm">{Icon.check}</span>}
          </p>
          <p className="text-sm text-text-2">{t(`tick.means.${l.tick}`)}</p>
        </div>
      </div>
      {!have && (
        <ul className="mt-2 flex flex-col gap-1 pl-[42px]">
          {l.steps.map((s) => (
            <li key={s.key} className={`flex items-center gap-2 text-sm ${s.done ? 'text-success' : 'text-text'}`}>
              <span className={`grid size-4 shrink-0 place-items-center rounded-full [&>svg]:size-2.5 ${s.done ? 'bg-success text-on-success' : 'ring-1 ring-inset ring-border-strong'}`}>{s.done ? Icon.check : null}</span>
              <span className="flex-1">{t(`rw.step.${role}.${s.key}`, { have: s.have ?? '', need: s.need ?? '' })}</span>
              {!s.done && s === next && STEP_LINK[s.key] && <StepLink to={STEP_LINK[s.key]}>{t('rw.doIt')}</StepLink>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const StepLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{children}</Link>
)
