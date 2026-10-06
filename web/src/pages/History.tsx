import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CommunityArt } from '../assets/illustrations'
import { HistoryItem } from '../components/history'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, ButtonLink, ConfirmDialog, EmptyState, ErrorState, Icon, Note, Skeleton } from '../components/ui'
import { ApiError, history, type HistoryEntry, type HistorySummary } from '../lib/api'
import { useAuth } from '../lib/auth'
import { askText, isConfirmed, period, waLink } from '../lib/history'
import { useIsDesktop } from '../lib/layout'
import { track, trackScreen } from '../lib/track'

/** The driver's work history: what owners see, who confirmed, and what still needs the owner. */
export default function History() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const { profile } = useAuth()
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const [sum, setSum] = useState<HistorySummary | null>(null)
  const [max, setMax] = useState(15)
  const [error, setError] = useState(false)
  const [del, setDel] = useState<HistoryEntry | null>(null)
  const [busy, setBusy] = useState('')
  const load = () => history.mine().then((r) => { setItems(r.items); setSum(r.summary); setMax(r.max) }).catch(() => setError(true))
  useEffect(() => { trackScreen('history'); void load() }, [])

  async function remind(e: HistoryEntry) {
    setBusy(e.id)
    try {
      const r = await history.remind(e.id)
      track('history_remind', { sent: r.sent })
      if (r.sent === 'link' && r.token && r.phone) window.open(waLink(r.phone, askText((profile?.name || '').split(' ')[0], e, r.token, i18n.language)), '_blank')
      else toast(t(r.sent === 'app' ? 'hist.reminded' : 'hist.err.capped'), { tone: r.sent === 'app' ? 'success' : 'error' })
      void load()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      toast(t(`hist.err.${code}`, { defaultValue: t('error.generic') }), { tone: 'error' })
    } finally { setBusy('') }
  }
  async function toggleHide(e: HistoryEntry) {
    await history.hide(e.id, !e.hidden).catch(() => {})
    void load()
  }
  async function remove() {
    if (!del) return
    setBusy(del.id)
    await history.remove(del.id).catch(() => {})
    setBusy(''); setDel(null); void load()
  }

  const full = (items?.length || 0) >= max
  const add = <ButtonLink to="/history/new" variant="primary" icon={Icon.plus} className={full ? 'pointer-events-none opacity-50' : ''}>{t('hist.add')}</ButtonLink>
  return (
    <AppShell title={t('hist.title')} back={!desktop} width="narrow" actions={add}>
      {error && <ErrorState onRetry={() => { setError(false); void load() }} />}
      {!items && !error && <Skeleton className="h-64" />}
      {items && sum && (
        <>
          {/* why it matters */}
          <section className="surface-hero mb-4 overflow-hidden rounded-xl p-card shadow-md">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold leading-snug">{t('hist.heroTitle')}</p>
                <p className="mt-1 text-sm text-white/80">{t('hist.heroBody')}</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-white/10 px-3 py-2 ring-1 ring-inset ring-white/15"><p className="font-display text-2xl font-semibold">{sum.confirmed}</p><p className="text-[0.7rem] text-white/75">{t('hist.statConfirmed')}</p></div>
                <div className="rounded-md bg-white/10 px-3 py-2 ring-1 ring-inset ring-white/15"><p className="font-display text-2xl font-semibold">{sum.confirmed_years >= 1 || !sum.confirmed ? sum.confirmed_years : Math.max(1, Math.round(sum.confirmed_years * 12))}</p><p className="text-[0.7rem] text-white/75">{t(sum.confirmed_years >= 1 || !sum.confirmed ? 'hist.statYears' : 'hist.statMonths')}</p></div>
              </div>
            </div>
          </section>

          {items.length === 0 ? (
            <EmptyState art={<CommunityArt />} title={t('hist.emptyTitle')} body={t('hist.emptyBody')}
              action={<Button size="lg" icon={Icon.plus} onClick={() => nav('/history/new')}>{t('hist.addFirst')}</Button>} />
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((e) => (
                <div key={e.id}>
                  <HistoryItem e={e} actions={
                    <>
                      {e.status === 'pending' && e.source === 'driver' && (e.owner_on_app || e.owner_phone) && (
                        <Button size="sm" variant={e.owner_on_app ? 'secondary' : 'success'} loading={busy === e.id} icon={e.owner_on_app ? Icon.bell : Icon.message} onClick={() => void remind(e)}>
                          {e.owner_on_app ? t('hist.remind') : t('hist.remindWa')}
                        </Button>
                      )}
                      {(e.status === 'needs_fix' || (e.status === 'pending' && e.source === 'driver')) && (
                        <Button size="sm" variant={e.status === 'needs_fix' ? 'primary' : 'outline'} icon={Icon.doc} onClick={() => nav(`/history/${e.id}/edit`)}>{t(e.status === 'needs_fix' ? 'hist.fix' : 'hist.edit')}</Button>
                      )}
                      {isConfirmed(e.status) && <Button size="sm" variant="ghost" icon={Icon.eye} onClick={() => void toggleHide(e)}>{e.hidden ? t('hist.show') : t('hist.hide')}</Button>}
                      {e.source === 'driver' && !isConfirmed(e.status) && <Button size="sm" variant="ghost" onClick={() => setDel(e)}>{t('hist.delete')}</Button>}
                    </>
                  } />
                  {e.status === 'needs_fix' && <div className="mt-1.5"><Note tone="warn">{t('hist.needsFixNote')}</Note></div>}
                  {e.status === 'owner_fixed' && e.owner_start_month && <div className="mt-1.5"><Note>{t('hist.ownerFixedNote', { when: period(e.owner_start_month, e.owner_end_month ?? null, i18n.language) })}</Note></div>}
                  {e.status === 'disputed' && <div className="mt-1.5"><Note tone="error">{t('hist.disputedNote')}</Note></div>}
                  {e.status === 'pending' && e.source === 'driver' && !e.owner_on_app && !e.owner_phone && <div className="mt-1.5"><Note>{t('hist.noPhoneNote')}</Note></div>}
                </div>
              ))}
              {!full && <Button variant="outline" size="lg" block icon={Icon.plus} className="mt-1" onClick={() => nav('/history/new')}>{t('hist.addMore')}</Button>}
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={!!del} title={t('hist.deleteQ')} confirmLabel={t('hist.delete')} danger busy={!!busy} onConfirm={() => void remove()} onCancel={() => setDel(null)} />
    </AppShell>
  )
}
