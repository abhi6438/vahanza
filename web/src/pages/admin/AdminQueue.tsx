import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { admin, history, photoSrc, type AdminHistory, type QueuePost, type QueueProfile, type QueueReport, type VerifyItem, type VerifyReason } from '../../lib/api'
import { HistoryItem } from '../../components/history'
import { placeName, rupees } from '../../lib/catalog'
import { period } from '../../lib/history'
import { track, trackScreen } from '../../lib/track'
import { AdminLayout, ago } from './AdminLayout'

/** Only what needs a human: posts under check, profiles flagged by automatic checks, open reports. */
export default function AdminQueue() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ posts: QueuePost[]; profiles: QueueProfile[]; reports: QueueReport[]; verifications: VerifyItem[]; history: AdminHistory[] } | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    Promise.all([admin.queue(), admin.verifications().catch(() => ({ items: [] as VerifyItem[] })), history.adminList('todo').catch(() => ({ items: [] as AdminHistory[] }))])
      .then(([q, v, h]) => setData({ ...q, verifications: v.items, history: h.items })).catch(() => setError(true))
  }, [])
  useEffect(() => { trackScreen('admin_queue'); load() }, [load])
  const total = data ? data.posts.length + data.profiles.length + data.reports.length + data.verifications.length + data.history.length : undefined

  return (
    <AdminLayout queue={total}>
      <p className="mb-4 text-text-2">{t('admin.q.sub')}</p>
      {error && <p className="rounded-md bg-surface p-4 text-error">{t('error.server')}</p>}
      {!data && !error && <div className="h-40 animate-pulse rounded-lg bg-surface" />}
      {data && total === 0 && <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center font-semibold">{t('admin.q.empty')}</p>}
      {data && (
        <div className="flex flex-col gap-6">
          {data.verifications.length > 0 && (
            <Section title={t('admin.q.verify', { n: data.verifications.length })}>
              {data.verifications.map((v) => <VerifyRow key={v.id} v={v} onDone={load} />)}
            </Section>
          )}
          {data.history.length > 0 && (
            <Section title={t('admin.q.history', { n: data.history.length })}>
              {data.history.map((h) => <HistoryRow key={h.id} h={h} onDone={load} />)}
            </Section>
          )}
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
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Flags({ flags }: { flags: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {flags.map((f) => <span key={f} className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink">! {t(`admin.flag.${f}`, { defaultValue: f })}</span>)}
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
    <div className="rounded-lg border border-border bg-surface p-card shadow-sm">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-semibold">{p.business_name || p.owner_name}</p>
          <p className="text-sm text-text-2">{phoneText(p.owner_phone)} · {p.district ? placeName(`${p.district}, ${p.state}`, i18n.language) : '—'}</p>
        </div>
        <span className="text-sm text-text-2">{ago(p.created_at, i18n.language)}</span>
      </div>
      <p className="mt-2">{t('post.savings')} <strong>{rupees(p.savings_monthly)}</strong>{t('card.perMonthSavings')} · {t('post.totalN', { n: p.drivers_needed })}</p>
      <Flags flags={p.check_flags} />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void act('approve')} className="min-h-ctl-md flex-1 rounded-md bg-success font-semibold text-on-success disabled:opacity-50">{t('admin.approve')}</button>
        <button type="button" disabled={busy} onClick={() => void act('reject')} className="min-h-ctl-md flex-1 rounded-md border border-border font-semibold text-error disabled:opacity-50">{t('admin.reject')}</button>
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
    <div className="rounded-lg border border-border bg-surface p-card shadow-sm">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-semibold">{p.name}{p.business_name ? ` · ${p.business_name}` : ''}</p>
          <p className="text-sm text-text-2">{t(`role.${p.role}`)} · {phoneText(p.phone)} · {p.district ? placeName(`${p.district}, ${p.state}`, i18n.language) : '—'}</p>
        </div>
        <span className="text-sm text-text-2">{ago(p.created_at, i18n.language)}</span>
      </div>
      <Flags flags={p.check_flags} />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void act('clear')} className="min-h-ctl-md flex-1 rounded-md bg-success font-semibold text-on-success disabled:opacity-50">{t('admin.looksOk')}</button>
        <button type="button" disabled={busy} onClick={() => void act('block')} className="min-h-ctl-md flex-1 rounded-md border border-border font-semibold text-error disabled:opacity-50">{t('admin.block')}</button>
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
  const btn = 'min-h-ctl-md flex-1 rounded-md border border-border px-2 text-sm font-semibold disabled:opacity-50'
  return (
    <div className="rounded-lg border border-border bg-surface p-card shadow-sm">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-semibold">{r.target_business || r.target_name || '—'} <span className="font-normal text-text-2">· {t(r.target_type === 'post' ? 'admin.q.aPost' : 'admin.q.aProfile')}</span></p>
          <p className="text-sm text-text-2">{phoneText(r.target_phone)}</p>
        </div>
        <span className="text-sm text-text-2">{ago(r.created_at, i18n.language)}</span>
      </div>
      <p className="mt-2"><span className="rounded-lg bg-error-soft px-2 py-1 text-sm font-semibold text-error">⚑ {t(`admin.reason.${r.reason}`, { defaultValue: r.reason })}</span>
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

const REASONS: VerifyReason[] = ['blurry', 'mismatch', 'wrong_doc', 'expired', 'other']

/** Document + selfie side by side; approve gives the Verified badge, reject needs a reason. Photos are deleted after. */
function VerifyRow({ v, onDone }: { v: VerifyItem; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  async function act(action: 'approve' | 'reject', reason?: VerifyReason) {
    setBusy(true)
    try { await admin.reviewVerification(v.id, action, reason); track('admin_verify', { action, reason }); onDone() } finally { setBusy(false) }
  }
  const pic = (url: string | null, label: string) => {
    const src = photoSrc(url)
    return src
      ? <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border bg-surface-2"><img src={src} alt={label} className="h-40 w-full object-contain" /><span className="block px-2 py-1 text-xs text-text-2">{label}</span></a>
      : <div className="grid h-40 place-items-center rounded-md border border-dashed border-border text-sm text-text-2">{label}</div>
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-card shadow-sm">
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{v.name}{v.business_name ? ` · ${v.business_name}` : ''}</p>
          <p className="truncate text-sm text-text-2">{t(`role.${v.role}`)} · {phoneText(v.phone)} · {v.district ? placeName(`${v.district}, ${v.state}`, i18n.language) : '—'}</p>
        </div>
        <span className="shrink-0 text-sm text-text-2">{ago(v.submitted_at, i18n.language)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {pic(v.doc_url, t(v.kind === 'driver_licence' ? 'verify.docDriver' : 'verify.docOwner'))}
        {pic(v.selfie_url, t('verify.selfie'))}
      </div>
      {rejecting ? (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold">{t('admin.v.why')}</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" disabled={busy} onClick={() => void act('reject', r)}
                className="min-h-ctl-sm rounded-full border border-border px-3 text-sm font-medium hover:border-error hover:text-error disabled:opacity-50">{t(`verify.reason.${r}`)}</button>
            ))}
            <button type="button" onClick={() => setRejecting(false)} className="min-h-ctl-sm px-2 text-sm text-text-2 underline">{t('cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void act('approve')} className="min-h-ctl-md flex-1 rounded-md bg-success font-semibold text-on-success disabled:opacity-50">{t('admin.v.approve')}</button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="min-h-ctl-md flex-1 rounded-md border border-border font-semibold text-error disabled:opacity-50">{t('admin.reject')}</button>
        </div>
      )}
      <p className="mt-2 text-xs text-text-2">{t('admin.v.deleted')}</p>
    </div>
  )
}

/** Work history no owner answered (7 days) or the owner said "not true": call and decide. */
function HistoryRow({ h, onDone }: { h: AdminHistory; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const fixed = h.status === 'owner_fixed' && !!h.owner_start_month
  async function act(action: 'ok' | 'keep' | 'reject') {
    setBusy(true)
    try { await history.adminCheck(h.id, action); track('admin_history_check', { action }); onDone() } finally { setBusy(false) }
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <p className="mb-2 text-sm"><span className="font-semibold">{h.driver_name}</span>{h.driver_phone && <a className="ml-2 text-primary underline" href={`tel:+${h.driver_phone}`}>{t('admin.hist.callDriver')}</a>}</p>
      <HistoryItem e={h} compact />
      <p className="mt-2 text-sm text-text-2">
        {fixed ? t('admin.hist.ownerFixed') : h.status === 'disputed' ? t('admin.hist.disputed') : t('admin.hist.noAnswer', { n: h.invite_count || 0 })}
        {h.owner_phone && <a className="ml-2 font-semibold text-primary underline" href={`tel:+${h.owner_phone}`}>{t('admin.hist.callOwner')} (+{h.owner_phone})</a>}
      </p>
      {fixed && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-surface-2 px-3 py-2"><p className="text-text-2">{t('admin.hist.driverDates')}</p><p className="font-semibold">{period(h.start_month, h.end_month, i18n.language)}</p></div>
          <div className="rounded-md bg-primary-soft px-3 py-2 text-primary"><p>{t('admin.hist.ownerDates')}</p><p className="font-semibold">{period(h.owner_start_month!, h.owner_end_month ?? null, i18n.language)}</p></div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void act('ok')} className="min-h-ctl-md flex-1 rounded-md bg-success px-3 font-semibold text-on-success disabled:opacity-50">{t(fixed ? 'admin.hist.useOwner' : 'admin.hist.ok')}</button>
        {fixed && <button type="button" disabled={busy} onClick={() => void act('keep')} className="min-h-ctl-md flex-1 rounded-md border border-success px-3 font-semibold text-success disabled:opacity-50">{t('admin.hist.keepDriver')}</button>}
        <button type="button" disabled={busy} onClick={() => void act('reject')} className="min-h-ctl-md flex-1 rounded-md border border-border px-3 font-semibold text-error disabled:opacity-50">{t('admin.hist.reject')}</button>
      </div>
    </div>
  )
}
