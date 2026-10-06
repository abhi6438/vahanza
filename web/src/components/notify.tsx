import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { notifications, type Notif } from '../lib/api'
import { pick, VEHICLES } from '../lib/catalog'
import { enablePush, pushState, type PushState } from '../lib/push'
import { storage } from '../lib/storage'
import { Button, Icon, Note } from './ui'

const POLL_MS = 60_000
const REFRESH = 'vz-unread'

/** Tell every bell on screen to re-count (after reading, or when a push arrives). */
export const refreshUnread = () => window.dispatchEvent(new Event(REFRESH))

/** One shared unread counter for every bell / nav badge on screen (one poll, not one per component). */
const unreadStore = (() => {
  let n = 0
  let timer = 0
  const subs = new Set<(n: number) => void>()
  const load = () => {
    if (document.visibilityState === 'hidden') return
    notifications.unread().then((r) => { n = r.unread; subs.forEach((f) => f(n)) }).catch(() => {})
  }
  const onMsg = (e: MessageEvent) => e.data?.type === 'vz-push' && load()
  return {
    get: () => n,
    subscribe(f: (n: number) => void) {
      subs.add(f)
      if (subs.size === 1) {
        load()
        timer = window.setInterval(load, POLL_MS)
        document.addEventListener('visibilitychange', load)
        window.addEventListener(REFRESH, load)
        navigator.serviceWorker?.addEventListener('message', onMsg)
      }
      return () => {
        subs.delete(f)
        if (!subs.size) {
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', load)
          window.removeEventListener(REFRESH, load)
          navigator.serviceWorker?.removeEventListener('message', onMsg)
        }
      }
    },
  }
})()

export function useUnread() {
  const [n, setN] = useState(unreadStore.get)
  useEffect(() => unreadStore.subscribe(setN), [])
  return n
}

/** 🔔 with the unread count. */
export function Bell({ tone = 'plain' }: { tone?: 'plain' | 'onDark' }) {
  const { t } = useTranslation()
  const n = useUnread()
  const look = tone === 'onDark' ? 'text-white/90 hover:bg-white/12 hover:text-white' : 'text-text-2 hover:bg-surface-2 hover:text-text'
  return (
    <Link to="/notifications" aria-label={n ? t('notif.bellN', { n }) : t('notif.title')} title={t('notif.title')}
      className={`press relative grid size-ctl-md shrink-0 place-items-center rounded-full text-[length:var(--icon-size-md)] ${look}`}>
      <span className={`grid ${n > 0 ? 'origin-top animate-[vz-ring_2.4s_ease-in-out_1]' : ''}`}>{Icon.bell}</span>
      {n > 0 && <CountDot n={n} ring={tone === 'onDark' ? 'ring-header' : 'ring-surface'} />}
    </Link>
  )
}

export function CountDot({ n, ring = 'ring-surface', className = 'absolute right-1 top-1' }: { n: number; ring?: string; className?: string }) {
  return (
    <span className={`anim-check grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-action px-1 text-[0.625rem] font-semibold leading-none text-on-action ring-2 ${ring} ${className}`}>
      {n > 9 ? '9+' : n}
    </span>
  )
}

/** Title + line for one notification, in the app's language. */
export function notifText(n: Notif, t: (k: string, o?: Record<string, unknown>) => string, lang: string) {
  const d = n.data || {}
  const vehicles = (d.vehicles_raw || []).map((v) => pick(VEHICLES.find((x) => x.key === v)?.label, lang) || v).join(', ')
  const o = { owner: d.owner || '', driver: d.driver || '', vehicles, n: d.n ?? '', savings: d.savings || '', days: d.days ?? '', name: d.name || '' }
  // the verification result reads differently when it was not accepted
  if (n.kind === 'verify_result') {
    const key = d.ok ? 'notif.verify_result.ok' : 'notif.verify_result.no'
    return { title: t(`${key}.title`), body: t(`${key}.body`, { reason: d.reason ? t(`verify.reason.${d.reason}`) : '' }) }
  }
  if (n.kind === 'history_answered') {
    const a = d.answer || 'yes'
    return { title: t(`notif.history_answered.${a}.title`), body: t(`notif.history_answered.${a}.body`) }
  }
  return { title: t(`notif.${n.kind}.title`, o), body: t(`notif.${n.kind}.body`, o) }
}

/** Where tapping a notification goes. */
export function notifLink(n: Notif) {
  switch (n.kind) {
    case 'new_post': return '/home'
    case 'new_interest': return n.data.post_id ? `/posts?open=${n.data.post_id}` : '/posts'
    case 'interest_seen': return '/interests'
    case 'profile_views': return '/home'
    case 'licence_expiry': return '/setup?step=licence'
    case 'referral_joined': return '/invite'
    case 'hire_confirm': case 'weekly_jobs': case 'come_back': case 'still_looking': return '/home'
    case 'hire_done': case 'post_views': return '/posts'
    case 'verify_result': return '/verify'
    case 'history_request': return '/history-requests'
    case 'history_answered': return '/history'
    default: return '/posts'
  }
}

const SNOOZE_KEY = 'vz-push-ask-snooze'
const SNOOZE_DAYS = 7

/**
 * "Get an alert on your phone" card, shown at a moment where it clearly helps
 * (after posting, after showing interest, on the bell page). Hides itself when push is on,
 * not possible, blocked by the user, or "Later" was tapped in the last week (except in Settings).
 */
export function PushAsk({ from, why, force = false }: { from: string; why: string; force?: boolean }) {
  const { t } = useTranslation()
  const [state, setState] = useState<PushState | 'hidden' | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    void (async () => {
      const snooze = Number((await storage.getItem(SNOOZE_KEY)) || 0)
      if (!force && snooze > Date.now()) { if (live) setState('hidden'); return }
      const s = await pushState()
      if (live) setState(s)
    })()
    return () => { live = false }
  }, [force])
  if (state === null || state === 'hidden' || state === 'unsupported' || state === 'on') {
    return state === 'on' && force ? <Note tone="success">{t('notif.pushOn')}</Note> : null
  }
  if (state === 'denied') {
    return force ? <Note tone="warn">{t('notif.pushDenied')}</Note> : null
  }
  async function turnOn() {
    setBusy(true)
    setState(await enablePush(from))
    setBusy(false)
  }
  async function later() {
    await storage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000))
    setState('hidden')
  }
  return (
    <section className="rounded-lg border border-primary/30 bg-primary-soft p-4">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-on-primary">{Icon.bell}</span>
        <div className="min-w-0">
          <p className="font-semibold">{t('notif.askTitle')}</p>
          <p className="text-sm text-text-2">{why}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {!force && <Button variant="outline" className="flex-1" onClick={() => void later()}>{t('notif.later')}</Button>}
        <Button variant="primary" className="flex-[2]" loading={busy} onClick={() => void turnOn()}>{t('notif.turnOn')}</Button>
      </div>
    </section>
  )
}
