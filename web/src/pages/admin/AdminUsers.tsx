import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from '../../components/form'
import { admin, type AdminUser } from '../../lib/api'
import { placeName } from '../../lib/catalog'
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
  const chip = 'rounded-full border-2 border-line bg-card px-3 py-1.5 text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-brand-soft'

  return (
    <AdminLayout>
      <h1 className="mb-3 font-display text-2xl font-bold">{t('admin.tab.users')}</h1>
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
      {error && <p className="rounded-xl bg-card p-4 text-danger">{t('error.server')}</p>}
      {!items && !error && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
      {items?.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-4 text-muted">{t('admin.u.none')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items?.map((u) => <UserRow key={u.id} u={u} onChange={update} />)}
      </div>
      {more && <button type="button" onClick={() => void loadMore()} className="mt-4 min-h-11 w-full rounded-xl border-2 border-brand font-bold text-brand">{t('admin.u.more')}</button>}
    </AdminLayout>
  )
}

function UserRow({ u, onChange }: { u: AdminUser; onChange: (u: AdminUser) => void }) {
  const { t, i18n } = useTranslation()
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
  const phone = (u.phone || '').replace(/^91/, '')
  return (
    <div className={`rounded-2xl border bg-card p-4 ${u.blocked ? 'border-danger/40 opacity-75' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{u.name || '—'}{u.business_name ? ` · ${u.business_name}` : ''}</p>
          <p className="text-sm text-muted">{t(`role.${u.role}`)} · +91 {phone.slice(0, 5)} {phone.slice(5)}</p>
          <p className="text-sm text-muted">{u.district ? placeName(`${u.district}, ${u.state}`, i18n.language) : t('admin.u.noPlace')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {u.verified && <span className="rounded-full bg-call/15 px-2 py-0.5 text-xs font-bold text-call">✓ {t('badge.verified')}</span>}
          {u.blocked && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">{t('admin.u.blocked')}</span>}
          {u.is_test && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-ink">{t('home.testAccount')}</span>}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {t('admin.u.joined', { when: ago(u.created_at, i18n.language) })} · {t('admin.u.seen', { when: ago(u.last_seen_at, i18n.language) })}
        {u.role === 'owner' ? ` · ${t('admin.u.posts', { n: nf(u.posts) })}` : ` · ${t('admin.u.interests', { n: nf(u.interests) })}`}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void patch({ verified: !u.verified })}
          className="min-h-10 flex-1 rounded-xl border-2 border-brand text-sm font-bold text-brand disabled:opacity-50">
          {u.verified ? t('admin.u.unverify') : t('admin.u.verify')}
        </button>
        <button type="button" disabled={busy} onClick={() => void patch({ blocked: !u.blocked })}
          className="min-h-10 flex-1 rounded-xl border-2 border-line text-sm font-bold text-danger disabled:opacity-50">
          {u.blocked ? t('admin.u.unblock') : t('admin.block')}
        </button>
      </div>
    </div>
  )
}
