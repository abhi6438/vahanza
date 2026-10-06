import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/shell'
import { useToast } from '../../components/toast'
import { Badge, Button, Card, ConfirmDialog, ErrorState, Icon, SectionTitle, Skeleton, Switch } from '../../components/ui'
import { ApiError, rewards, type ChallengeCfg, type RewardsConfig, type RewardsStats } from '../../lib/api'
import { useIsDesktop } from '../../lib/layout'
import { track, trackScreen } from '../../lib/track'
import { nf } from './AdminLayout'

/**
 * Admin → इनाम सेटिंग: every number of the rewards system, saved per brand, live without a new app.
 * Points per action (and monthly limit, on / off), friends bonus, Premium plans (points only), free Premium,
 * free vs Premium limits, streak, monthly top inviters, challenges. Giving Premium to one person: Users page.
 */
export default function AdminRewards() {
  const { t } = useTranslation()
  const toast = useToast()
  const desktop = useIsDesktop()
  const [cfg, setCfg] = useState<RewardsConfig | null>(null)
  const [saved, setSaved] = useState('')
  const [defaults, setDefaults] = useState<RewardsConfig | null>(null)
  const [meta, setMeta] = useState<{ roles: Record<string, string[]>; kinds: string[]; challenge_kinds: string[] } | null>(null)
  const [stats, setStats] = useState<RewardsStats | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(false)
  const load = () => {
    rewards.adminConfig().then((r) => { setCfg(r.config); setSaved(JSON.stringify(r.config)); setDefaults(r.defaults); setMeta(r) }).catch(() => setError(true))
    rewards.stats().then(setStats).catch(() => {})
  }
  useEffect(() => { trackScreen('admin_rewards'); load() }, [])
  const dirty = !!cfg && JSON.stringify(cfg) !== saved
  const up = (fn: (c: RewardsConfig) => void) => setCfg((c) => { if (!c) return c; const n = structuredClone(c); fn(n); return n })

  async function save() {
    if (!cfg) return
    setBusy(true)
    try {
      const r = await rewards.saveConfig(cfg)
      setCfg(r.config); setSaved(JSON.stringify(r.config))
      track('admin_rewards_save')
      toast(t('arw.saved'), { tone: 'success' })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      const field = e instanceof ApiError ? (e.detail as { field?: string } | undefined)?.field : undefined
      toast(code ? t(`arw.err.${code}`, { field: field || '', defaultValue: t('error.generic') }) : e instanceof ApiError && e.status === 422 ? t('arw.err.bad_value', { field: '' }) : t('error.generic'), { tone: 'error' })
    } finally { setBusy(false) }
  }

  const saveBtn = <Button size="sm" icon={Icon.check} disabled={!dirty} loading={busy} onClick={() => void save()}>{t('arw.save')}</Button>
  return (
    <AppShell title={t('arw.title')} back={!desktop} width="wide" actions={saveBtn} mobileActions={saveBtn}>
      {error && <ErrorState onRetry={() => { setError(false); load() }} />}
      {!cfg && !error && <Skeleton className="h-96" />}
      {cfg && meta && (
        <div className="flex flex-col gap-6 pb-20">
          <p className="text-text-2">{t('arw.sub')}</p>

          {stats && <StatsRow s={stats} />}

          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="premium-fill icon-tile size-10 rounded-full [&>svg]:size-icon-md">{Icon.crown}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold">{t('arw.givePremium')}</p><p className="text-sm text-text-2">{t('arw.givePremiumSub')}</p></div>
              <Link to="/admin/users" className="press rounded-full bg-primary-soft px-4 py-2 font-semibold text-primary">{t('arw.openUsers')}</Link>
            </div>
          </Card>

          {/* points per action */}
          <section>
            <SectionTitle className="mb-3" title={t('arw.earn')} sub={t('arw.earnSub')} />
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_4rem] gap-3 border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-text-2 md:grid">
                <span>{t('arw.action')}</span><span>{t('arw.points')}</span><span>{t('arw.cap')}</span><span>{t('arw.on')}</span>
              </div>
              {meta.kinds.map((k) => {
                const e = cfg.earn[k] || { points: 0, cap: null, on: false }
                const once = k === 'profile_done' || k === 'verified' || k === 'joined_invite'
                return (
                  <div key={k} className={`grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 last:border-0 md:grid-cols-[minmax(0,1fr)_7rem_8rem_4rem] ${e.on ? '' : 'opacity-60'}`}>
                    <div className="col-span-3 min-w-0 md:col-span-1">
                      <p className="font-medium leading-snug">{t(`rw.kind.${k}`)}</p>
                      <p className="text-xs text-text-3">{(meta.roles[k] || []).map((r) => t(`role.${r}`)).join(' · ')}{once ? ` · ${t('rw.once')}` : ''}</p>
                    </div>
                    <Num label={t('arw.points')} value={e.points} onChange={(v) => up((c) => { c.earn[k] = { ...e, points: v ?? 0 } })} />
                    {once ? <span className="text-xs text-text-3">—</span>
                      : <Num label={t('arw.cap')} value={e.cap} placeholder={t('arw.noCap')} onChange={(v) => up((c) => { c.earn[k] = { ...e, cap: v || null } })} />}
                    <span className="justify-self-end md:justify-self-start"><Toggle on={e.on} onChange={(v) => up((c) => { c.earn[k] = { ...e, on: v } })} label={t('arw.on')} /></span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* friends */}
          <section>
            <SectionTitle className="mb-3" title={t('arw.friends')} sub={t('arw.friendsSub')} />
            <Card>
              <Row label={t('arw.crossRole')} sub={t('arw.crossRoleSub')}><Num label={t('arw.crossRole')} value={cfg.friends.cross_role} onChange={(v) => up((c) => { c.friends.cross_role = v ?? 0 })} /></Row>
              <p className="mb-2 mt-4 font-semibold">{t('arw.milestones')}</p>
              <div className="flex flex-col gap-2">
                {cfg.friends.milestones.map(([at, pts], i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Num label={t('arw.friendsN')} value={at} onChange={(v) => up((c) => { c.friends.milestones[i] = [v ?? 1, pts] })} suffix={t('arw.friendsUnit')} />
                    <span className="text-text-3">→</span>
                    <Num label={t('arw.bonus')} value={pts} onChange={(v) => up((c) => { c.friends.milestones[i] = [at, v ?? 0] })} suffix={t('arw.pointsUnit')} />
                    <button type="button" onClick={() => up((c) => { c.friends.milestones.splice(i, 1) })} aria-label={t('remove')} className="grid size-ctl-sm place-items-center rounded-full text-text-2 hover:bg-error-soft hover:text-error">{Icon.close}</button>
                  </div>
                ))}
                {cfg.friends.milestones.length < 6 && (
                  <Button size="sm" variant="ghost" icon={Icon.plus} className="self-start" onClick={() => up((c) => { const last = c.friends.milestones[c.friends.milestones.length - 1]; c.friends.milestones.push([last ? last[0] * 2 : 3, last ? last[1] * 2 : 100]) })}>{t('arw.addMilestone')}</Button>
                )}
              </div>
            </Card>
          </section>

          {/* premium */}
          <section>
            <SectionTitle className="mb-3" title={t('arw.plans')} sub={t('arw.plansSub')} />
            <div className="grid gap-3 md:grid-cols-2">
              {(['driver', 'owner'] as const).map((role) => (
                <Card key={role}>
                  <p className="mb-2 font-display font-semibold">{t(`role.${role}`)}</p>
                  {(['m1', 'm3'] as const).map((pid) => (
                    <div key={pid} className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-0">
                      <Num label={t('arw.days')} value={cfg.plans[role][pid].days} suffix={t('arw.daysUnit')} onChange={(v) => up((c) => { c.plans[role][pid].days = v ?? 0 })} />
                      <span className="text-text-3">=</span>
                      <Num label={t('arw.points')} value={cfg.plans[role][pid].points} suffix={t('arw.pointsUnit')} onChange={(v) => up((c) => { c.plans[role][pid].points = v ?? 0 })} />
                    </div>
                  ))}
                  <p className="mt-2 text-xs text-text-3">{t('arw.planOff')}</p>
                </Card>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle className="mb-3" title={t('arw.free')} sub={t('arw.freeSub')} />
              <Card>
                <Row label={t('arw.trial')} sub={t('arw.trialSub')}><Num label={t('arw.trial')} value={cfg.free.trial_days} suffix={t('arw.daysUnit')} onChange={(v) => up((c) => { c.free.trial_days = v ?? 0 })} /></Row>
                <Row label={t('arw.gold')} sub={t('arw.goldSub')}><Num label={t('arw.gold')} value={cfg.free.gold_days} suffix={t('arw.daysUnit')} onChange={(v) => up((c) => { c.free.gold_days = v ?? 0 })} /></Row>
              </Card>
            </section>
            <section>
              <SectionTitle className="mb-3" title={t('arw.limits')} sub={t('arw.limitsSub')} />
              <Card>
                {(['history', 'posts'] as const).map((k) => (
                  <Row key={k} label={t(`arw.limit.${k}`)}>
                    <div className="flex items-center gap-2">
                      <Num label={t('arw.freeUser')} value={cfg.limits[k][0]} suffix={t('arw.freeUser')} onChange={(v) => up((c) => { c.limits[k][0] = v ?? 1 })} />
                      <Num label={t('rw.premium')} value={cfg.limits[k][1]} suffix={t('rw.premium')} onChange={(v) => up((c) => { c.limits[k][1] = v ?? 1 })} />
                    </div>
                  </Row>
                ))}
              </Card>
            </section>
            <section>
              <SectionTitle className="mb-3" title={t('arw.streak')} sub={t('arw.streakSub')} />
              <Card>
                <Switch checked={cfg.streak.on} onChange={(v) => up((c) => { c.streak.on = v })} label={t('arw.streakOn')} />
                <Row label={t('arw.streakDays')}><Num label={t('arw.streakDays')} value={cfg.streak.days} suffix={t('arw.daysUnit')} onChange={(v) => up((c) => { c.streak.days = v ?? 7 })} /></Row>
                <Row label={t('arw.bonus')}><Num label={t('arw.bonus')} value={cfg.streak.points} suffix={t('arw.pointsUnit')} onChange={(v) => up((c) => { c.streak.points = v ?? 0 })} /></Row>
                <p className="mt-2 text-xs text-text-3">{t('arw.dailyHint')}</p>
              </Card>
            </section>
            <section>
              <SectionTitle className="mb-3" title={t('arw.lb')} sub={t('arw.lbSub')} />
              <Card>
                <Switch checked={cfg.leaderboard.on} onChange={(v) => up((c) => { c.leaderboard.on = v })} label={t('arw.lbOn')} />
                <Row label={t('arw.lbTop')}><Num label={t('arw.lbTop')} value={cfg.leaderboard.top} onChange={(v) => up((c) => { c.leaderboard.top = v ?? 3 })} /></Row>
                <Row label={t('arw.lbPoints')}><Num label={t('arw.lbPoints')} value={cfg.leaderboard.points} suffix={t('arw.pointsUnit')} onChange={(v) => up((c) => { c.leaderboard.points = v ?? 0 })} /></Row>
                <Row label={t('arw.lbDays')}><Num label={t('arw.lbDays')} value={cfg.leaderboard.premium_days} suffix={t('arw.daysUnit')} onChange={(v) => up((c) => { c.leaderboard.premium_days = v ?? 0 })} /></Row>
              </Card>
            </section>
          </div>

          {/* challenges */}
          <section>
            <SectionTitle className="mb-3" title={t('arw.ch')} sub={t('arw.chSub')}
              right={cfg.challenges.length < 20 ? <Button size="sm" icon={Icon.plus} onClick={() => up((c) => { c.challenges.push(newChallenge()) })}>{t('arw.chAdd')}</Button> : undefined} />
            {cfg.challenges.length === 0 && <p className="rounded-lg border border-dashed border-border p-card text-sm text-text-2">{t('arw.chNone')}</p>}
            <div className="flex flex-col gap-3">
              {cfg.challenges.map((ch, i) => (
                <ChallengeEditor key={i} ch={ch} kinds={meta.challenge_kinds}
                  onChange={(n) => up((c) => { c.challenges[i] = n })} onRemove={() => up((c) => { c.challenges.splice(i, 1) })} />
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button variant="ghost" icon={Icon.refresh} onClick={() => setReset(true)}>{t('arw.reset')}</Button>
            <span className="flex-1" />
            {dirty && <Badge tone="action" icon={Icon.alert}>{t('appearance.unsaved')}</Badge>}
            <Button icon={Icon.check} disabled={!dirty} loading={busy} onClick={() => void save()}>{t('arw.save')}</Button>
          </div>
        </div>
      )}
      <ConfirmDialog open={reset} title={t('arw.resetQ')} body={t('arw.resetBody')} confirmLabel={t('arw.reset')}
        onCancel={() => setReset(false)} onConfirm={() => { setReset(false); if (defaults) setCfg(structuredClone({ ...defaults, challenges: cfg?.challenges || [] })) }} />
    </AppShell>
  )
}

function newChallenge(): ChallengeCfg {
  const now = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { id: `c${now.getTime().toString(36)}`, title_hi: '', title_en: '', kind: 'referral', target: 2, points: 200, roles: ['driver', 'owner'],
    start: iso(now), end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)), on: true }
}

function ChallengeEditor({ ch, kinds, onChange, onRemove }: { ch: ChallengeCfg; kinds: string[]; onChange: (c: ChallengeCfg) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const set = (p: Partial<ChallengeCfg>) => onChange({ ...ch, ...p })
  const input = 'h-ctl-md w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-primary'
  return (
    <Card className={ch.on ? '' : 'opacity-70'}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-semibold">{t('arw.chTitleHi')}</span>
          <input className={input} value={ch.title_hi} maxLength={80} placeholder="इस महीने 3 दोस्त बुलाओ" onChange={(e) => set({ title_hi: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">{t('arw.chTitleEn')}</span>
          <input className={input} value={ch.title_en || ''} maxLength={80} placeholder="Invite 3 friends this month" onChange={(e) => set({ title_en: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">{t('arw.chKind')}</span>
          <select className={input} value={ch.kind} onChange={(e) => set({ kind: e.target.value })}>
            {kinds.map((k) => <option key={k} value={k}>{t(`rw.kind.${k}`)}</option>)}
          </select></label>
        <div className="flex gap-2">
          <Num label={t('arw.chTarget')} value={ch.target} suffix={t('arw.times')} onChange={(v) => set({ target: v ?? 1 })} />
          <Num label={t('arw.points')} value={ch.points} suffix={t('arw.pointsUnit')} onChange={(v) => set({ points: v ?? 1 })} />
        </div>
        <label className="block"><span className="mb-1 block text-sm font-semibold">{t('arw.chStart')}</span>
          <input type="date" className={input} value={ch.start} onChange={(e) => set({ start: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">{t('arw.chEnd')}</span>
          <input type="date" className={input} value={ch.end} onChange={(e) => set({ end: e.target.value })} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['driver', 'owner'] as const).map((r) => (
          <button key={r} type="button" aria-pressed={ch.roles.includes(r)}
            onClick={() => set({ roles: ch.roles.includes(r) ? ch.roles.filter((x) => x !== r) : [...ch.roles, r] })}
            className="min-h-ctl-sm rounded-full border border-border px-3 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary">{t(`role.${r}`)}</button>
        ))}
        <span className="flex-1" />
        <Toggle on={ch.on} onChange={(v) => set({ on: v })} label={t('arw.on')} />
        <button type="button" onClick={onRemove} className="min-h-ctl-sm rounded-md px-3 text-sm font-semibold text-error hover:bg-error-soft">{t('remove')}</button>
      </div>
    </Card>
  )
}

function StatsRow({ s }: { s: RewardsStats }) {
  const { t } = useTranslation()
  const prem = Object.values(s.premium).reduce((a, b) => a + b, 0)
  const tile = (label: string, value: ReactNode, sub?: ReactNode) => (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-xs">
      <p className="text-xs font-semibold text-text-2">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-text-3">{sub}</p>}
    </div>
  )
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile(t('arw.st.given'), nf(s.given_30d), t('arw.st.30d'))}
        {tile(t('arw.st.spent'), nf(s.spent_30d), t('arw.st.30d'))}
        {tile(t('arw.st.earners'), nf(s.earners_30d), t('arw.st.30d'))}
        {tile(t('arw.st.premium'), nf(prem), Object.entries(s.premium).map(([k, v]) => `${t(`arw.src.${k}`)} ${v}`).join(' · ') || '—')}
      </div>
      <div className="rounded-lg border border-border bg-surface p-3 shadow-xs">
        <p className="mb-1.5 text-xs font-semibold text-text-2">{t('arw.st.top')}</p>
        {s.top_inviters.length === 0 ? <p className="text-sm text-text-3">{t('arw.st.noneTop')}</p> : (
          <ol className="flex flex-col gap-1 text-sm">
            {s.top_inviters.slice(0, 5).map((x, i) => (
              <li key={x.id} className="flex items-center gap-2"><span className="w-5 text-text-3">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium">{x.business_name || x.name || '—'}<span className="text-text-3"> · {x.district || ''}</span></span>
                <span className="font-semibold">{x.friends}</span></li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0">
      <div className="min-w-[11rem] flex-1"><p className="font-medium leading-snug">{label}</p>{sub && <p className="text-xs text-text-3">{sub}</p>}</div>
      {children}
    </div>
  )
}

function Num({ label, value, onChange, suffix, placeholder }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string; placeholder?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input type="number" inputMode="numeric" min={0} aria-label={label} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
        className="h-ctl-md w-24 rounded-md border border-border bg-surface px-2.5 text-right text-base font-semibold tabular-nums outline-none focus:border-primary" />
      {suffix && <span className="text-sm text-text-2">{suffix}</span>}
    </label>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative shrink-0 rounded-full transition-colors ${on ? 'bg-success' : 'bg-border-strong'}`} style={{ width: 48, height: 28 }}>
      <span className="absolute rounded-full bg-white shadow transition-[left]" style={{ width: 24, height: 24, top: 2, left: on ? 22 : 2 }} />
    </button>
  )
}
