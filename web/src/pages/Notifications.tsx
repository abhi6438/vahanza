import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { notifLink, notifText, PushAsk, refreshUnread } from '../components/notify'
import { AppShell } from '../components/shell'
import { Button, EmptyState, ErrorState, Icon, Skeleton } from '../components/ui'
import { useIsDesktop } from '../lib/layout'
import { notifications, type Notif } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ago } from '../lib/time'
import { track, trackScreen } from '../lib/track'

const DOT: Record<Notif['kind'], string> = {
  new_post: 'bg-primary', new_interest: 'bg-success', interest_seen: 'bg-action', post_live: 'bg-success', post_rejected: 'bg-error',
  profile_views: 'bg-action', licence_expiry: 'bg-warning', referral_joined: 'bg-success',
}
const KIND_ICON: Record<Notif['kind'], ReactNode> = {
  new_post: Icon.briefcase, new_interest: Icon.heart, interest_seen: Icon.user, post_live: Icon.check, post_rejected: Icon.alert,
  profile_views: Icon.user, licence_expiry: Icon.doc, referral_joined: Icon.users,
}

/** The bell page: newest first, unread ones highlighted. Tapping one opens the right screen. */
export default function Notifications() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const nav = useNavigate()
  const desktop = useIsDesktop()
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
  const readAllBtn = unread > 0 ? <Button variant="ghost" size="sm" icon={Icon.check} onClick={() => void readAll()}>{t('notif.readAll')}</Button> : undefined
  return (
    <AppShell title={t('notif.title')} back={!desktop} width="narrow" actions={readAllBtn} mobileActions={readAllBtn}>
      <div className="mb-4"><PushAsk from="bell" why={why} /></div>
      {error && <ErrorState onRetry={() => { setError(false); notifications.list().then((r) => { setItems(r.items); setMore(r.has_more) }).catch(() => setError(true)) }} />}
      {items === null && !error && <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {items?.length === 0 && <EmptyState icon={Icon.bell} title={t('notif.none')} body={why} />}
      {!!items?.length && (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {items.map((n) => {
            const { title, body } = notifText(n, t, i18n.language)
            return (
              <li key={n.id} className="border-b border-border last:border-0">
                <button type="button" onClick={() => void open(n)}
                  className={`flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${n.read_at ? '' : 'bg-primary-soft/60'}`}>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full ${n.read_at ? 'bg-surface-2 text-text-2' : 'bg-primary-soft text-primary'}`}>{KIND_ICON[n.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 ${n.read_at ? 'font-medium' : 'font-semibold'}`}>{title}</span>
                      <span className="shrink-0 text-xs text-text-2">{ago(n.created_at, i18n.language)}</span>
                    </span>
                    <span className="block text-[0.95rem] text-text-2">{body}</span>
                  </span>
                  {!n.read_at && <span className={`mt-2 size-2.5 shrink-0 rounded-full ${DOT[n.kind]}`} aria-label={t('notif.new')} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {more && <Button variant="outline" block className="mt-3" onClick={() => void loadMore()}>{t('notif.older')}</Button>}
    </AppShell>
  )
}
