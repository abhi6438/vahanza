import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Note, TextField } from '../../components/form'
import { Button, Icon } from '../../components/ui'
import { admin, ApiError, type ImportPreviewRow, type ImportResult, type ImportRow, type Prospect, type ProspectStatus } from '../../lib/api'
import { pick, placeName, VEHICLES } from '../../lib/catalog'
import { track, trackScreen } from '../../lib/track'
import { AdminLayout, ago, nf } from './AdminLayout'

type Role = 'driver' | 'owner'
type Config = Awaited<ReturnType<typeof admin.inviteConfig>>
const chip = 'rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary'
const phoneText = (p: string | null) => (p ? `+91 ${p.replace(/^91/, '').replace(/(\d{5})(\d{5})/, '$1 $2')}` : '—')

/** Bulk import of drivers / transporters from CSV or Excel, then invite them to join. */
export default function AdminImport() {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [imports, setImports] = useState<ImportRow[] | null>(null)
  const [filterImport, setFilterImport] = useState<ImportRow | null>(null)
  const [reload, setReload] = useState(0)
  const loadImports = useCallback(() => { admin.imports().then((r) => setImports(r.items)).catch(() => setImports([])) }, [])
  useEffect(() => {
    trackScreen('admin_import')
    admin.inviteConfig().then(setCfg).catch(() => {})
    loadImports()
  }, [loadImports])
  const onImported = () => { loadImports(); setReload((n) => n + 1) }

  return (
    <AdminLayout>
      <p className="mb-5 text-text-2">{t('admin.imp.sub')}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Upload onDone={onImported} />
          <History items={imports} active={filterImport} onPick={(i) => setFilterImport(filterImport?.id === i.id ? null : i)} />
        </div>
        <People cfg={cfg} importFilter={filterImport} clearImport={() => setFilterImport(null)} reload={reload} onInvited={loadImports} />
      </div>
    </AdminLayout>
  )
}

// ------------------------------------------------------------------ upload + preview
function Upload({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [role, setRole] = useState<Role>('driver')
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<ImportResult['counts'] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function check(f: File, r: Role) {
    setFile(f); setPreview(null); setError(''); setDone(null); setBusy(true)
    try {
      const res = await admin.upload(r, f, true)
      setPreview(res)
      track('import_preview', { role: r, total: res.counts.total, bad: res.counts.bad })
    } catch (e) {
      setError(errorText(e, t))
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    if (!file) return
    setBusy(true)
    try {
      const res = await admin.upload(role, file, false, source.trim())
      setDone(res.counts); setPreview(null); setFile(null)
      if (input.current) input.current.value = ''
      track('import_saved', { role, added: res.counts.new, updated: res.counts.update })
      onDone()
    } catch (e) {
      setError(errorText(e, t))
    } finally {
      setBusy(false)
    }
  }
  const [dl, setDl] = useState(false)
  async function sample() {
    setDl(true)
    try {
      const blob = await admin.template(role)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = role === 'driver' ? 'vahanza-drivers.xlsx' : 'vahanza-owners.xlsx'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      track('import_template', { role })
    } catch {
      setError(t('error.server'))
    } finally {
      setDl(false)
    }
  }
  const ready = preview ? preview.counts.new + preview.counts.update : 0

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-lg font-bold">{t('admin.imp.addFile')}</h2>
      <p className="mb-2 text-sm font-semibold">{t('admin.imp.who')}</p>
      <div className="mb-3 flex gap-2">
        {(['driver', 'owner'] as Role[]).map((r) => (
          <button key={r} type="button" className={chip} aria-pressed={role === r} disabled={busy}
            onClick={() => { setRole(r); if (file) void check(file, r) }}>{t(r === 'driver' ? 'admin.imp.drivers' : 'admin.imp.owners')}</button>
        ))}
      </div>
      <div className="mb-3"><TextField value={source} onChange={setSource} label={t('admin.imp.source')} placeholder={t('admin.imp.sourcePh')} /></div>

      <div className="mb-3 rounded-md border border-border bg-surface-2 p-3">
        <p className="font-semibold">{t('admin.imp.step1')}</p>
        <p className="mt-0.5 text-sm text-text-2">{t('admin.imp.step1Sub')}</p>
        <Button variant="outline" size="sm" className="mt-2" icon={Icon.doc} loading={dl} onClick={() => void sample()}>{t('admin.imp.sample')}</Button>
      </div>
      <p className="mb-2 font-semibold">{t('admin.imp.step2')}</p>
      <label className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center ${busy ? 'border-border opacity-60' : 'border-brand bg-brand-soft/50'}`}>
        <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void check(f, role) }} />
        <span className="font-bold text-brand">{file ? file.name : t('admin.imp.pick')}</span>
        <span className="text-sm text-text-2">{t('admin.imp.pickSub')}</span>
      </label>

      {busy && <div className="mt-4 h-24 animate-pulse rounded-lg bg-bg" />}
      {error && <p className="mt-3 rounded-md bg-error-soft px-3 py-2 text-sm font-semibold text-error">{error}</p>}
      {done && <div className="mt-4"><Note tone="info">{t('admin.imp.saved', { added: done.new, updated: done.update })}</Note></div>}
      {preview && !busy && (
        <div className="mt-4">
          <Counts c={preview.counts} />
          {preview.columns && (
            <p className="mt-3 text-sm text-text-2">
              {t('admin.imp.columns')}{' '}
              {Object.entries(preview.columns).map(([h, f]) => <span key={h} className="mr-1 inline-block rounded-md bg-bg px-1.5 py-0.5 font-semibold text-ink">{h} → {t(`admin.imp.f.${f}`)}</span>)}
              {!!preview.ignored?.length && <> · {t('admin.imp.ignored')}: {preview.ignored.join(', ')}</>}
            </p>
          )}
          {!!preview.rows?.length && <PreviewTable rows={preview.rows} />}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setPreview(null); setFile(null); if (input.current) input.current.value = '' }}
              className="min-h-12 flex-1 rounded-md border border-border font-bold">{t('cancel')}</button>
            <button type="button" disabled={!ready} onClick={() => void save()}
              className="min-h-12 flex-[2] rounded-md bg-primary font-bold text-on-primary disabled:opacity-50">{t('admin.imp.save', { n: nf(ready) })}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Counts({ c }: { c: ImportResult['counts'] }) {
  const { t } = useTranslation()
  const tiles: [string, number, string][] = [
    ['new', c.new, 'text-call'], ['update', c.update, 'text-brand'], ['on_app', c.on_app, 'text-text-2'], ['bad', c.bad, 'text-error'],
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, n, cls]) => (
          <div key={k} className="rounded-md bg-bg p-2.5">
            <p className={`font-display text-2xl font-bold ${cls}`}>{nf(n)}</p>
            <p className="text-xs font-semibold text-text-2">{t(`admin.imp.c.${k}`)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-text-2">{t('admin.imp.totalRows', { n: nf(c.total) })}{c.warnings > 0 && <> · <span className="font-semibold text-accent-ink">{t('admin.imp.warnN', { n: nf(c.warnings) })}</span></>}</p>
    </div>
  )
}

const STATUS_PILL: Record<ImportPreviewRow['status'], string> = {
  new: 'bg-success-soft text-call', update: 'bg-brand-soft text-brand', on_app: 'bg-bg text-text-2', bad: 'bg-error-soft text-error',
}

function PreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="mt-3 max-h-96 overflow-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-text-2">
          <tr><th className="p-2">#</th><th className="p-2">{t('admin.imp.status')}</th><th className="p-2">{t('admin.imp.f.name')}</th><th className="p-2">{t('admin.imp.f.phone')}</th><th className="p-2">{t('admin.imp.place')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row} className="border-t border-border align-top">
              <td className="p-2 text-text-2">{r.row}</td>
              <td className="p-2"><span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold ${STATUS_PILL[r.status]}`}>{t(`admin.imp.s.${r.reason || r.status}`)}</span></td>
              <td className="p-2">
                {r.business_name || r.name || '—'}{r.business_name && r.name ? <span className="block text-xs text-text-2">{r.name}</span> : null}
                {r.warnings.length > 0 && <span className="mt-0.5 block text-xs font-semibold text-accent-ink">! {r.warnings.map((w) => t(`admin.imp.w.${w}`)).join(' · ')}</span>}
              </td>
              <td className="whitespace-nowrap p-2">{r.phone ? phoneText(r.phone) : <span className="text-error">{r.raw_phone || '—'}</span>}</td>
              <td className="p-2">{r.district ? placeName(`${r.district}, ${r.state}`, lang) : '—'}{r.vehicles.length > 0 && <span className="block text-xs text-text-2">{r.vehicles.map((v) => pick(VEHICLES.find((x) => x.key === v)?.label, lang)).join(', ')}{r.vehicle_count ? ` · ${r.vehicle_count}` : ''}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function errorText(e: unknown, t: (k: string, o?: Record<string, unknown>) => string) {
  if (e instanceof ApiError && e.code) {
    const d = (e.detail || {}) as { headers?: string[] }
    return t(`admin.imp.e.${e.code}`, { headers: (d.headers || []).join(', '), defaultValue: t('error.generic') })
  }
  return t('error.server')
}

// ------------------------------------------------------------------ past files
function History({ items, active, onPick }: { items: ImportRow[] | null; active: ImportRow | null; onPick: (i: ImportRow) => void }) {
  const { t, i18n } = useTranslation()
  if (!items) return <div className="h-32 animate-pulse rounded-lg bg-surface" />
  if (!items.length) return null
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-1 text-lg font-bold">{t('admin.imp.history')}</h2>
      <p className="mb-3 text-sm text-text-2">{t('admin.imp.historySub')}</p>
      <div className="flex flex-col gap-2">
        {items.map((i) => {
          const pct = (n: number) => (i.people ? Math.round((n / i.people) * 100) : 0)
          return (
            <button key={i.id} type="button" aria-pressed={active?.id === i.id} onClick={() => onPick(i)}
              className="rounded-md border border-border p-3 text-left aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary/50">
              <div className="flex justify-between gap-2">
                <p className="min-w-0 truncate font-bold">{i.source || i.filename || `#${i.id}`}</p>
                <span className="shrink-0 text-sm text-text-2">{ago(i.created_at, i18n.language)}</span>
              </div>
              <p className="text-sm text-text-2">{t(i.role === 'driver' ? 'admin.imp.drivers' : 'admin.imp.owners')} · {t('admin.imp.histLine', { added: nf(i.added), updated: nf(i.updated), bad: nf(i.bad) })}</p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-bg" aria-hidden>
                <span className="bg-success" style={{ width: `${pct(i.joined)}%` }} />
                <span className="bg-brand/60" style={{ width: `${Math.max(0, pct(i.invited) - pct(i.joined))}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold">
                <span className="text-call">{t('admin.imp.joinedN', { n: nf(i.joined) })}</span> · <span className="text-brand">{t('admin.imp.invitedN', { n: nf(i.invited) })}</span> · <span className="text-text-2">{t('admin.imp.peopleN', { n: nf(i.people) })}</span>
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ people + invites
const STATUSES: ProspectStatus[] = ['all', 'ready', 'invited', 'joined', 'opted_out']

function People({ cfg, importFilter, clearImport, reload, onInvited }: {
  cfg: Config | null; importFilter: ImportRow | null; clearImport: () => void; reload: number; onInvited: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ProspectStatus>('ready')
  const [role, setRole] = useState<Role | null>(null)
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ items: Prospect[]; counts: Record<ProspectStatus, number>; has_more: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const importId = importFilter?.id ?? null
  const load = useCallback(() => {
    admin.prospects({ status, role, q, import_id: importId }).then(setData).catch(() => setData({ items: [], counts: {} as never, has_more: false }))
  }, [status, role, q, importId])
  useEffect(() => { const id = window.setTimeout(load, 250); return () => window.clearTimeout(id) }, [load, reload])

  async function more() {
    if (!data) return
    const r = await admin.prospects({ status, role, q, import_id: importId, offset: data.items.length })
    setData({ ...r, items: [...data.items, ...r.items] })
  }
  const readyN = data?.counts?.ready ?? 0
  const smsBlocked = !cfg?.sms ? t('admin.imp.smsNotReady') : !cfg.app_url ? t('admin.imp.noAppUrl') : ''
  async function smsAll() {
    if (!window.confirm(t('admin.imp.smsConfirm', { n: nf(Math.min(readyN, 500)) }))) return
    setBusy(true); setMsg('')
    try {
      const r = await admin.inviteSms({ role, import_id: importId })
      setMsg(t('admin.imp.smsSent', { n: nf(r.sent) }))
      track('invite_sms', { n: r.sent })
      load(); onInvited()
    } catch (e) {
      setMsg(e instanceof ApiError && e.code ? t(`admin.imp.e.${e.code}`, { defaultValue: t('error.generic') }) : t('error.server'))
    } finally {
      setBusy(false)
    }
  }
  const replace = (p: Prospect) => setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? p : x)) } : d))
  // keep the person on screen (so the new status is visible) but refresh the counts and the file list
  const invitedOne = (p: Prospect) => {
    replace(p)
    admin.prospects({ status, role, q, import_id: importId }).then((r) => setData((d) => (d ? { ...d, counts: r.counts } : d))).catch(() => {})
    onInvited()
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-1 text-lg font-bold">{t('admin.imp.people')}</h2>
      <p className="mb-3 text-sm text-text-2">{t('admin.imp.peopleSub', { max: cfg?.max_invites ?? 3, days: cfg?.gap_days ?? 7 })}</p>
      {importFilter && (
        <p className="mb-3 flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
          <span className="min-w-0 flex-1 truncate">{t('admin.imp.fromFile', { name: importFilter.source || importFilter.filename || `#${importFilter.id}` })}</span>
          <button type="button" onClick={clearImport} className="font-bold underline">{t('admin.imp.showAll')}</button>
        </p>
      )}
      <div className="mb-3"><TextField value={q} onChange={setQ} label={t('admin.u.search')} placeholder={t('admin.u.search')} /></div>
      <div className="mb-2 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} type="button" className={chip} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {t(`admin.imp.st.${s}`)}{data?.counts?.[s] !== undefined && <span className="ml-1 text-text-2">{nf(data.counts[s])}</span>}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([null, 'driver', 'owner'] as (Role | null)[]).map((r) => (
          <button key={r || 'all'} type="button" className={chip} aria-pressed={role === r} onClick={() => setRole(r)}>{r ? t(`role.${r}`) : t('admin.u.all')}</button>
        ))}
      </div>

      <div className="mb-3 rounded-md bg-bg p-3">
        <button type="button" disabled={busy || !readyN || !!smsBlocked} onClick={() => void smsAll()}
          className="min-h-12 w-full rounded-md bg-brand px-3 font-bold text-white disabled:opacity-50">
          {t('admin.imp.smsAll', { n: nf(Math.min(readyN, 500)) })}
        </button>
        {smsBlocked && <p className="mt-2 text-sm text-text-2">{smsBlocked}</p>}
        {!smsBlocked && cfg?.sms_dry_run && <p className="mt-2 text-sm font-semibold text-accent-ink">{t('admin.imp.dryRun')}</p>}
        {msg && <p className="mt-2 text-sm font-semibold">{msg}</p>}
      </div>

      {!data && <div className="h-40 animate-pulse rounded-lg bg-bg" />}
      {data?.items.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-text-2">{t('admin.imp.nobody')}</p>}
      <div className="flex flex-col gap-2">
        {data?.items.map((p) => <PersonRow key={p.id} p={p} onChange={replace} onInvited={invitedOne} />)}
      </div>
      {data?.has_more && <button type="button" onClick={() => void more()} className="mt-3 min-h-11 w-full rounded-md border-2 border-brand font-bold text-brand">{t('admin.u.more')}</button>}
    </section>
  )
}

function PersonRow({ p, onChange, onInvited }: { p: Prospect; onChange: (p: Prospect) => void; onInvited: (p: Prospect) => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function whatsapp() {
    // open the tab inside the tap (pop-up blockers), then point it at wa.me
    const w = window.open('', '_blank')
    setBusy(true); setErr('')
    try {
      const r = await admin.inviteWhatsapp(p.id)
      if (w) w.location.href = r.url
      else window.location.href = r.url
      track('invite_whatsapp')
      onInvited({ ...p, invites: p.invites + 1, last_invited_at: new Date().toISOString(), last_channel: 'whatsapp', can_invite: false })
    } catch (e) {
      w?.close()
      setErr(e instanceof ApiError && e.code ? t(`admin.imp.e.${e.code}`, { defaultValue: t('error.generic') }) : t('error.server'))
    } finally {
      setBusy(false)
    }
  }
  async function optOut() {
    const r = await admin.optOut(p.id, !p.opted_out)
    onChange({ ...p, opted_out: r.opted_out, can_invite: !r.opted_out && p.can_invite })
  }
  const vehicles = p.vehicles.map((v) => pick(VEHICLES.find((x) => x.key === v)?.label, lang)).join(', ')
  let state: string
  if (p.joined_at) state = t('admin.imp.joinedAgo', { when: ago(p.joined_at, lang) })
  else if (p.opted_out) state = t('admin.imp.st.opted_out')
  else if (p.invites) state = t('admin.imp.invitedAgo', { n: p.invites, when: ago(p.last_invited_at, lang), via: p.last_channel === 'sms' ? 'SMS' : 'WhatsApp' })
  else state = t('admin.imp.notInvited')
  return (
    <div className={`rounded-md border p-3 ${p.joined_at ? 'border-call/40' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{p.business_name || p.name || '—'}{p.business_name && p.name ? <span className="font-normal text-text-2"> · {p.name}</span> : null}</p>
          <p className="text-sm text-text-2">{t(`role.${p.role}`)} · {phoneText(p.phone)}{p.district ? ` · ${placeName(`${p.district}, ${p.state}`, lang)}` : ''}</p>
          {(vehicles || p.vehicle_count) && <p className="text-sm text-text-2">{vehicles}{p.vehicle_count ? ` · ${t('admin.imp.nVehicles', { n: p.vehicle_count })}` : ''}</p>}
          <p className={`mt-1 text-sm font-semibold ${p.joined_at ? 'text-call' : p.opted_out ? 'text-error' : 'text-ink'}`}>{p.joined_at ? '✓ ' : ''}{state}</p>
        </div>
        {p.can_invite && (
          <button type="button" disabled={busy} onClick={() => void whatsapp()}
            className="min-h-11 shrink-0 rounded-md bg-success px-3 text-sm font-semibold text-on-success disabled:opacity-50">WhatsApp</button>
        )}
      </div>
      {err && <p className="mt-1 text-sm text-error">{err}</p>}
      {!p.joined_at && (
        <button type="button" onClick={() => void optOut()} className="mt-1 text-xs font-semibold text-text-2 underline">
          {p.opted_out ? t('admin.imp.undoOptOut') : t('admin.imp.optOut')}
        </button>
      )}
    </div>
  )
}
