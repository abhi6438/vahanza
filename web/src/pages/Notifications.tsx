import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { notifLink, notifText, PushAsk, refreshUnread } from '../components/notify'
import { Screen, TopBar } from '../components/ui'
import { notifications, type Notif } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ago } from '../lib/time'
import { track, trackScreen } from '../lib/track'

const DOT: Record<Notif['kind'], string> = {
  new_post: 'bg-brand', new_interest: 'bg-call', interest_seen: 'bg-accent', post_live: 'bg-call', post_rejected: 'bg-danger',
}

/** The bell page: newest first, unread ones highlighted. Tapping one opens the right screen. */
export default function Notifications() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const nav = useNavigate()
  const [items, setItems] = useState<Notif[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    trackScreen('notifications')
    notifications.list().then((r) => { setItems(r.items); setMore(r.has_more) }).catch(() => setError(true))
  }, [])
  const unread = items?.filter((n) => !n.read_at).length || 0

  async function open(n: Notif) {
    track('notif_open', { kind: n.kind })
    if (!n.read_at) await notifications.read([n.id]).catch(() => {})
    refreshUnread()
    nav(notifLink(n))
  }
  async function readAll() {
    await notifications.read()
    const now = new Date().toISOString()
    setItems((cur) => cur?.map((n) => ({ ...n, read_at: n.read_at || now })) || null)
    refreshUnread()
    track('notif_read_all')
  }
  async function loadMore() {
    const last = items?.[items.length - 1]
    if (!last) return
    const r = await notifications.list(last.id)
    setItems([...(items || []), ...r.items])
    setMore(r.has_more)
  }

  const why = profile?.role === 'owner' ? t('notif.whyOwner') : t('notif.whyDriver')
  return (
    <>
      <TopBar title={t('notif.title')}
        right={unread > 0 ? <button type="button" onClick={() => void readAll()} className="min-h-11 rounded-xl px-2 text-sm font-bold text-brand">{t('notif.readAll')}</button> : undefined} />
      <Screen>
        <div className="mb-4"><PushAsk from="bell" why={why} /></div>
        {error && <p className="rounded-xl bg-card p-4 text-muted">{t('error.server')}</p>}
        {items === null && !error && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
        {items?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <p className="font-bold">{t('notif.none')}</p>
            <p className="mt-1 text-sm text-muted">{why}</p>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {items?.map((n) => {
            const { title, body } = notifText(n, t, i18n.language)
            return (
              <li key={n.id}>
                <button type="button" onClick={() => void open(n)}
                  className={`flex w-full gap-3 rounded-2xl border p-3.5 text-left ${n.read_at ? 'border-line bg-card' : 'border-brand bg-brand-soft'}`}>
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? 'bg-line' : DOT[n.kind]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{title}</span>
                    <span className="block text-[15px]">{body}</span>
                    <span className="mt-1 block text-sm text-muted">{ago(n.created_at, i18n.language)}</span>
                  </span>
                  {!n.read_at && <span className="sr-only">{t('notif.new')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {more && <button type="button" onClick={() => void loadMore()} className="mt-3 min-h-12 w-full rounded-xl border-2 border-line font-bold">{t('notif.older')}</button>}
      </Screen>
    </>
  )
}
