import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { notifications, type Notif } from '../lib/api'
import { pick, VEHICLES } from '../lib/catalog'
import { enablePush, pushState, type PushState } from '../lib/push'
import { storage } from '../lib/storage'

const POLL_MS = 60_000
const REFRESH = 'vz-unread'

/** Tell every bell on screen to re-count (after reading, or when a push arrives). */
export const refreshUnread = () => window.dispatchEvent(new Event(REFRESH))

export function useUnread() {
  const [n, setN] = useState(0)
  const load = useCallback(() => {
    if (document.visibilityState === 'hidden') return
    notifications.unread().then((r) => setN(r.unread)).catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const id = window.setInterval(load, POLL_MS)
    const onMsg = (e: MessageEvent) => e.data?.type === 'vz-push' && load()
    document.addEventListener('visibilitychange', load)
    window.addEventListener(REFRESH, load)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener(REFRESH, load)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [load])
  return n
}

const bellSvg = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

/** 🔔 with the unread count, for the home header. */
export function Bell({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const n = useUnread()
  return (
    <Link to="/notifications" aria-label={n ? t('notif.bellN', { n }) : t('notif.title')} className={`relative ${className}`}>
      {bellSvg}
      {n > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink ring-2 ring-header">
          {n > 9 ? '9+' : n}
        </span>
      )}
    </Link>
  )
}

/** Title + line for one notification, in the app's language. */
export function notifText(n: Notif, t: (k: string, o?: Record<string, unknown>) => string, lang: string) {
  const d = n.data || {}
  const vehicles = (d.vehicles_raw || []).map((v) => pick(VEHICLES.find((x) => x.key === v)?.label, lang) || v).join(', ')
  const o = { owner: d.owner || '', driver: d.driver || '', vehicles, n: d.n ?? '', savings: d.savings || '' }
  return { title: t(`notif.${n.kind}.title`, o), body: t(`notif.${n.kind}.body`, o) }
}

/** Where tapping a notification goes. */
export function notifLink(n: Notif) {
  switch (n.kind) {
    case 'new_post': return '/home'
    case 'new_interest': return n.data.post_id ? `/posts?open=${n.data.post_id}` : '/posts'
    case 'interest_seen': return '/interests'
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
    return state === 'on' && force ? <p className="rounded-2xl bg-call/10 px-4 py-3 font-semibold text-call">✓ {t('notif.pushOn')}</p> : null
  }
  if (state === 'denied') {
    return force ? <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">{t('notif.pushDenied')}</p> : null
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
    <section className="rounded-2xl border-2 border-brand bg-brand-soft p-4">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">{bellSvg}</span>
        <div>
          <p className="font-bold">{t('notif.askTitle')}</p>
          <p className="text-sm">{why}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {!force && <button type="button" onClick={() => void later()} className="min-h-12 flex-1 rounded-xl border-2 border-line bg-card font-bold text-muted">{t('notif.later')}</button>}
        <button type="button" disabled={busy} onClick={() => void turnOn()} className="min-h-12 flex-[2] rounded-xl bg-brand font-bold text-white disabled:opacity-50">{t('notif.turnOn')}</button>
      </div>
    </section>
  )
}
