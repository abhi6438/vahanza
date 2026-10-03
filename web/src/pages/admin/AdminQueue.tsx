import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { admin, type QueuePost, type QueueProfile, type QueueReport } from '../../lib/api'
import { placeName, rupees } from '../../lib/catalog'
import { track, trackScreen } from '../../lib/track'
import { AdminLayout, ago } from './AdminLayout'

/** Only what needs a human: posts under check, profiles flagged by automatic checks, open reports. */
export default function AdminQueue() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ posts: QueuePost[]; profiles: QueueProfile[]; reports: QueueReport[] } | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    admin.queue().then(setData).catch(() => setError(true))
  }, [])
  useEffect(() => { trackScreen('admin_queue'); load() }, [load])
  const total = data ? data.posts.length + data.profiles.length + data.reports.length : undefined

  return (
    <AdminLayout queue={total}>
      <p className="mb-4 text-text-2">{t('admin.q.sub')}</p>
      {error && <p className="rounded-md bg-surface p-4 text-error">{t('error.server')}</p>}
      {!data && !error && <div className="h-40 animate-pulse rounded-lg bg-surface" />}
      {data && total === 0 && <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center font-semibold">{t('admin.q.empty')}</p>}
      {data && (
        <div className="flex flex-col gap-6">
          {data.posts.length > 0 && (
            <Section title={t('admin.q.posts', { n: data.posts.length })}>
              {data.posts.map((p) => <PostRow key={p.id} p={p} onDone={load} />)}
            </Section>
          )}
          {data.profiles.length > 0 && (
            <Section title={t('admin.q.profiles', { n: data.profiles.length })}>
              {data.profiles.map((p) => <ProfileRow key={p.id} p={p} onDone={load} />)}
            </Section>
          )}
          {data.reports.length > 0 && (
            <Section title={t('admin.q.reports', { n: data.reports.length })}>
              {data.reports.map((r) => <ReportRow key={r.id} r={r} onDone={load} />)}
            </Section>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Flags({ flags }: { flags: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {flags.map((f) => <span key={f} className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-bold text-accent-ink">! {t(`admin.flag.${f}`, { defaultValue: f })}</span>)}
    </div>
  )
}

const phoneText = (p: string | null) => (p ? `+91 ${p.replace(/^91/, '').replace(/(\d{5})(\d{5})/, '$1 $2')}` : '—')

function PostRow({ p, onDone }: { p: QueuePost; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  async function act(action: 'approve' | 'reject') {
    setBusy(true)
    try { await admin.reviewPost(p.id, action); track('admin_review_post', { action }); onDone() } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-bold">{p.business_name || p.owner_name}</p>
          <p className="text-sm text-text-2">{phoneText(p.owner_phone)} · {p.district ? placeName(`${p.district}, ${p.state}`, i18n.language) : '—'}</p>
        </div>
        <span className="text-sm text-text-2">{ago(p.created_at, i18n.language)}</span>
      </div>
      <p className="mt-2">{t('post.savings')} <strong>{rupees(p.savings_monthly)}</strong>{t('card.perMonthSavings')} · {t('post.totalN', { n: p.drivers_needed })}</p>
      <Flags flags={p.check_flags} />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void act('approve')} className="min-h-11 flex-1 rounded-md bg-success font-bold text-on-success disabled:opacity-50">{t('admin.approve')}</button>
        <button type="button" disabled={busy} onClick={() => void act('reject')} className="min-h-11 flex-1 rounded-md border border-border font-bold text-error disabled:opacity-50">{t('admin.reject')}</button>
      </div>
    </div>
  )
}

function ProfileRow({ p, onDone }: { p: QueueProfile; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  async function act(action: 'clear' | 'block') {
    if (action === 'block' && !window.confirm(t('admin.confirmBlock'))) return
    setBusy(true)
    try { await admin.reviewProfile(p.id, action); track('admin_review_profile', { action }); onDone() } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-bold">{p.name}{p.business_name ? ` · ${p.business_name}` : ''}</p>
          <p className="text-sm text-text-2">{t(`role.${p.role}`)} · {phoneText(p.phone)} · {p.district ? placeName(`${p.district}, ${p.state}`, i18n.language) : '—'}</p>
        </div>
        <span className="text-sm text-text-2">{ago(p.created_at, i18n.language)}</span>
      </div>
      <Flags flags={p.check_flags} />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void act('clear')} className="min-h-11 flex-1 rounded-md bg-success font-bold text-on-success disabled:opacity-50">{t('admin.looksOk')}</button>
        <button type="button" disabled={busy} onClick={() => void act('block')} className="min-h-11 flex-1 rounded-md border border-border font-bold text-error disabled:opacity-50">{t('admin.block')}</button>
      </div>
    </div>
  )
}

function ReportRow({ r, onDone }: { r: QueueReport; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  async function act(action: 'dismiss' | 'block_target' | 'close_post') {
    if (action === 'block_target' && !window.confirm(t('admin.confirmBlock'))) return
    setBusy(true)
    try { await admin.reviewReport(r.id, action); track('admin_review_report', { action }); onDone() } finally { setBusy(false) }
  }
  const btn = 'min-h-11 flex-1 rounded-md border border-border px-2 text-sm font-bold disabled:opacity-50'
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-bold">{r.target_business || r.target_name || '—'} <span className="font-normal text-text-2">· {t(r.target_type === 'post' ? 'admin.q.aPost' : 'admin.q.aProfile')}</span></p>
          <p className="text-sm text-text-2">{phoneText(r.target_phone)}</p>
        </div>
        <span className="text-sm text-text-2">{ago(r.created_at, i18n.language)}</span>
      </div>
      <p className="mt-2"><span className="rounded-lg bg-error-soft px-2 py-1 text-sm font-bold text-error">⚑ {t(`admin.reason.${r.reason}`, { defaultValue: r.reason })}</span>
        {r.open_reports > 1 && <span className="ml-2 text-sm font-semibold">{t('admin.q.nReports', { n: r.open_reports })}</span>}</p>
      {r.note && <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-sm">“{r.note}”</p>}
      <p className="mt-1 text-sm text-text-2">{t('admin.q.by', { name: r.reporter_name || '—' })}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} className={btn} onClick={() => void act('dismiss')}>{t('admin.q.dismiss')}</button>
        {r.target_type === 'post' && <button type="button" disabled={busy} className={btn} onClick={() => void act('close_post')}>{t('admin.q.closePost')}</button>}
        <button type="button" disabled={busy} className={`${btn} text-error`} onClick={() => void act('block_target')}>{t('admin.block')}</button>
      </div>
    </div>
  )
}
