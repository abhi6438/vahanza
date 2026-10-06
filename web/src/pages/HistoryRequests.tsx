import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommunityArt } from '../assets/illustrations'
import { AnswerPanel } from '../components/history'
import { Avatar } from '../components/photo'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { EmptyState, ErrorState, Icon, Skeleton } from '../components/ui'
import { history, type HistoryAnswer, type HistoryRequest } from '../lib/api'
import { label, placeName, VEHICLES } from '../lib/catalog'
import { duration, monthsBetween, period } from '../lib/history'
import { useIsDesktop } from '../lib/layout'
import { track, trackScreen } from '../lib/track'

/** Owner: "these drivers say they worked for you" — yes / no / dates differ, then stars + "hire again?". */
export default function HistoryRequests() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const desktop = useIsDesktop()
  const [items, setItems] = useState<HistoryRequest[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState('')
  const load = () => history.requests().then((r) => setItems(r.items)).catch(() => setError(true))
  useEffect(() => { trackScreen('history_requests'); void load() }, [])

  async function answer(r: HistoryRequest, a: HistoryAnswer) {
    setBusy(r.id)
    try {
      await history.answer(r.id, a)
      track('history_answer', { answer: a.answer, stars: a.stars || 0, rehire: a.rehire ?? null, via: 'app' })
      toast(t(`hist.ansDone.${a.answer}`), { tone: 'success' })
      setItems((cur) => cur?.filter((x) => x.id !== r.id) || null)
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally { setBusy('') }
  }

  return (
    <AppShell title={t('hist.reqTitle')} back={!desktop} width="narrow">
      <p className="mb-4 text-text-2">{t('hist.reqSub')}</p>
      {error && <ErrorState onRetry={() => { setError(false); void load() }} />}
      {!items && !error && <Skeleton className="h-64" />}
      {items?.length === 0 && <EmptyState art={<CommunityArt />} title={t('hist.reqNone')} body={t('hist.reqNoneBody')} />}
      <div className="flex flex-col gap-4">
        {items?.map((r) => {
          const first = (r.driver_name || '').split(' ')[0]
          return (
            <article key={r.id} className="anim-rise rounded-xl border border-border bg-surface p-card shadow-sm">
              <div className="flex items-center gap-3">
                <Avatar url={r.driver_photo} name={r.driver_name} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold leading-snug">{r.driver_name}</p>
                  {r.driver_district && <p className="text-sm text-text-2">{r.driver_district}</p>}
                </div>
              </div>
              <p className="mt-3 text-lg leading-snug">{t('hist.reqSays', { name: first, vehicle: label(VEHICLES, r.vehicle as never, lang) })}</p>
              <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-3 py-2 font-semibold [&>svg]:size-icon-sm">
                {Icon.calendar}{period(r.start_month, r.end_month, lang)}
                <span className="font-normal text-text-2">({duration(monthsBetween(r.start_month, r.end_month), lang)})</span>
                {r.district && r.state && <span className="font-normal text-text-2">· {placeName(`${r.district}, ${r.state}`, lang)}</span>}
              </p>
              <p className="mb-3 mt-4 font-semibold">{t('hist.reqQ')}</p>
              <AnswerPanel driverName={first} start={r.start_month} end={r.end_month} busy={busy === r.id} onAnswer={(a) => void answer(r, a)} />
            </article>
          )
        })}
      </div>
    </AppShell>
  )
}
