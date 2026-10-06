import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from '../../components/form'
import { admin, rewards, type AdminUser } from '../../lib/api'
import { PremiumBadge, TickBadge } from '../../components/rewards'
import { useToast } from '../../components/toast'
import { Button, Chip, Dialog, Icon } from '../../components/ui'
import { placeName } from '../../lib/catalog'
import { pinApi } from '../../lib/pin'
import { track, trackScreen } from '../../lib/track'
import { AdminLayout, ago, nf } from './AdminLayout'

/** Search users by name or phone; give the verified badge; block or unblock. */
export default function AdminUsers() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [flag, setFlag] = useState<string | null>(null)
  const [items, setItems] = useState<AdminUser[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { trackScreen('admin_users') }, [])
  useEffect(() => {
    const id = window.setTimeout(() => {
      setError(false)
      admin.users({ q, role, flag }).then((r) => { setItems(r.items); setMore(r.has_more) }).catch(() => setError(true))
    }, 300)
    return () => window.clearTimeout(id)
  }, [q, role, flag])
  async function loadMore() {
    const r = await admin.users({ q, role, flag, offset: items?.length || 0 })
    setItems((cur) => [...(cur || []), ...r.items])
    setMore(r.has_more)
  }
  const update = (u: AdminUser) => setItems((cur) => cur?.map((x) => (x.id === u.id ? u : x)) || null)
  const chip = 'rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary'

  return (
    <AdminLayout>
      <div className="mb-3 max-w-md"><TextField value={q} onChange={setQ} label={t('admin.u.search')} placeholder={t('admin.u.search')} /></div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[null, 'driver', 'owner'].map((r) => (
          <button key={r || 'all'} type="button" className={chip} aria-pressed={role === r} onClick={() => setRole(r)}>{r ? t(`role.${r}`) : t('admin.u.all')}</button>
        ))}
        <span className="mx-1 w-px bg-line" />
        {['verified', 'blocked', 'test'].map((f) => (
          <button key={f} type="button" className={chip} aria-pressed={flag === f} onClick={() => setFlag(flag === f ? null : f)}>{t(`admin.u.${f}`)}</button>
        ))}
      </div>
      {error && <p className="rounded-md bg-surface p-4 text-error">{t('error.server')}</p>}
      {!items && !error && <div className="h-40 animate-pulse rounded-lg bg-surface" />}
      {items?.length === 0 && <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-text-2">{t('admin.u.none')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items?.map((u) => <UserRow key={u.id} u={u} onChange={update} />)}
      </div>
      {more && <button type="button" onClick={() => void loadMore()} className="mt-4 min-h-ctl-md w-full rounded-md border-2 border-brand font-semibold text-brand">{t('admin.u.more')}</button>}
    </AdminLayout>
  )
}

function UserRow({ u, onChange }: { u: AdminUser; onChange: (u: AdminUser) => void }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function patch(p: { verified?: boolean; blocked?: boolean }) {
    if (p.blocked && !window.confirm(t('admin.confirmBlock'))) return
    setBusy(true)
    try {
      const r = await admin.patchUser(u.id, p)
      track('admin_user_patch', p)
      onChange({ ...u, ...r })
    } finally {
      setBusy(false)
    }
  }
  async function resetPin() {
    if (!window.confirm(t('pin.adminResetQ'))) return
    setBusy(true)
    try {
      await pinApi.adminReset(u.id)
      track('admin_pin_reset')
      toast(t('pin.adminResetDone'), { tone: 'success' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const [prem, setPrem] = useState(false)
  async function reward(b: { black?: boolean; premium_days?: number; premium_off?: boolean; points?: number }, givenNote?: string) {
    let note: string | undefined = givenNote
    if (b.points === 0) {
      const v = window.prompt(t('admin.rw.pointsQ'))
      const n = Number(v)
      if (!v || !Number.isFinite(n) || !n) return
      b = { points: Math.round(n) }
      note = window.prompt(t('admin.rw.noteQ')) || undefined
    }
    setBusy(true)
    try {
      const r = await rewards.admin(u.id, { ...b, note })
      track('admin_rewards', { black: b.black ?? null, days: b.premium_days || 0, points: b.points || 0 })
      onChange({ ...u, tick: r.tick, tick_black: r.tick_black, points: r.points, premium_until: r.premium_until })
      toast(t('admin.rw.done'), { tone: 'success' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally { setBusy(false) }
  }
  const premium = !!u.premium_until && new Date(u.premium_until) > new Date()
  const phone = (u.phone || '').replace(/^91/, '')
  return (
    <div className={`rounded-lg border bg-surface p-4 ${u.blocked ? 'border-danger/40 opacity-75' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{u.name || '—'}{u.business_name ? ` · ${u.business_name}` : ''}</p>
          <p className="text-sm text-text-2">{t(`role.${u.role}`)} · +91 {phone.slice(0, 5)} {phone.slice(5)}</p>
          <p className="text-sm text-text-2">{u.district ? placeName(`${u.district}, ${u.state}`, i18n.language) : t('admin.u.noPlace')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {u.tick ? <TickBadge tick={u.tick} compact /> : u.verified && <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success [&>svg]:size-3.5">{Icon.verified}{t('badge.verified')}</span>}
          <PremiumBadge on={premium} />
          {u.blocked && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-error">{t('admin.u.blocked')}</span>}
          {u.is_test && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">{t('home.testAccount')}</span>}
        </div>
      </div>
      <p className="mt-2 text-sm text-text-2">
        {t('admin.u.joined', { when: ago(u.created_at, i18n.language) })} · {t('admin.u.seen', { when: ago(u.last_seen_at, i18n.language) })}
        {u.role === 'owner' ? ` · ${t('admin.u.posts', { n: nf(u.posts) })}` : ` · ${t('admin.u.interests', { n: nf(u.interests) })}`}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void patch({ verified: !u.verified })}
          className="min-h-ctl-sm flex-1 rounded-md border-2 border-brand text-sm font-semibold text-brand disabled:opacity-50">
          {u.verified ? t('admin.u.unverify') : t('admin.u.verify')}
        </button>
        <button type="button" disabled={busy} onClick={() => void patch({ blocked: !u.blocked })}
          className="min-h-ctl-sm flex-1 rounded-md border border-border text-sm font-semibold text-error disabled:opacity-50">
          {u.blocked ? t('admin.u.unblock') : t('admin.block')}
        </button>
        <button type="button" disabled={busy} onClick={() => void resetPin()} title={t('pin.adminResetSub')}
          className="min-h-ctl-sm shrink-0 rounded-md border border-border px-3 text-sm font-semibold text-text-2 disabled:opacity-50">
          {t('pin.adminReset')}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm">
        <span className="font-semibold">{t('admin.rw.points', { n: nf(u.points || 0) })}</span>
        <span className="flex-1" />
        <button type="button" disabled={busy} onClick={() => void reward({ black: !u.tick_black })}
          className="min-h-ctl-sm rounded-md border border-border bg-surface px-2.5 font-semibold disabled:opacity-50">{u.tick_black ? t('admin.rw.blackOff') : t('admin.rw.blackOn')}</button>
        <button type="button" disabled={busy} onClick={() => setPrem(true)}
          className="premium-fill inline-flex min-h-ctl-sm items-center gap-1 rounded-md px-2.5 font-semibold disabled:opacity-50 [&>svg]:size-icon-sm">{Icon.crown}{t('admin.rw.premium')}</button>
        <button type="button" disabled={busy} onClick={() => void reward({ points: 0 })}
          className="min-h-ctl-sm rounded-md border border-border bg-surface px-2.5 font-semibold disabled:opacity-50">{t('admin.rw.givePoints')}</button>
      </div>
      {prem && <PremiumDialog name={u.business_name || u.name || ''} until={premium ? u.premium_until! : null} busy={busy}
        onClose={() => setPrem(false)} onGive={(days, n) => { setPrem(false); void reward({ premium_days: days }, n) }}
        onEnd={(n) => { setPrem(false); void reward({ premium_off: true }, n) }} />}
    </div>
  )
}

/** Vahanza gives Premium to one person (days), or ends it. */
function PremiumDialog({ name, until, busy, onClose, onGive, onEnd }: { name: string; until: string | null; busy: boolean; onClose: () => void; onGive: (days: number, note?: string) => void; onEnd: (note?: string) => void }) {
  const { t, i18n } = useTranslation()
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  return (
    <Dialog open onClose={onClose} title={t('admin.rw.premiumFor', { name })}
      footer={<div className="flex w-full flex-wrap gap-2">
        {until && <Button variant="danger" disabled={busy} onClick={() => onEnd(note || undefined)}>{t('admin.rw.endPremium')}</Button>}
        <span className="flex-1" />
        <Button icon={Icon.crown} disabled={busy || days < 1} onClick={() => onGive(days, note || undefined)}>{t('admin.rw.giveN', { n: days })}</Button>
      </div>}>
      <p className="mb-3 text-sm text-text-2">{until ? t('admin.rw.activeUntil', { date: new Date(until).toLocaleDateString(i18n.language === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('admin.rw.notActive')}</p>
      <p className="mb-2 font-semibold">{t('admin.rw.howLong')}</p>
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 180, 365].map((d) => <Chip key={d} selected={days === d} onClick={() => setDays(d)}>{t('admin.rw.days', { n: d })}</Chip>)}
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.max(0, Math.min(3650, Math.round(Number(e.target.value) || 0))))}
            className="h-chip w-20 rounded-full border border-border bg-surface px-3 text-right font-semibold" aria-label={t('admin.rw.howLong')} />{t('arw.daysUnit')}
        </label>
      </div>
      <p className="mt-2 text-xs text-text-3">{until ? t('admin.rw.addsOn') : ''}</p>
      <label className="mt-4 block"><span className="mb-1 block text-sm font-semibold">{t('admin.rw.noteQ')}</span>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-ctl-md w-full rounded-md border border-border bg-surface px-3" /></label>
    </Dialog>
  )
}
