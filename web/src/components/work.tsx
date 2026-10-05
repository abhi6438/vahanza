import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { work, type Hire, type HireCandidate } from '../lib/api'
import { useAuth } from '../lib/auth'
import { placeName } from '../lib/catalog'
import { track } from '../lib/track'
import { Avatar } from './photo'
import { useToast } from './toast'
import { Badge, Button, Card, Dialog, Icon, Note, Skeleton } from './ui'

/**
 * Sprint 10: "काम मिल गया" and keeping the lists fresh.
 *   HireDialog     owner marks a post filled and picks whom they hired
 *   PendingHires   driver: "Singh Roadways says you got the job — right?"
 *   LookingCard    driver: "still looking for work?" every 14 days
 *   badges         "✓ 3 jobs" and "replies fast" on cards
 */

export function JobsDoneBadge({ n }: { n?: number | null }) {
  const { t } = useTranslation()
  if (!n) return null
  return <Badge tone="success" icon={Icon.briefcase}>{t('work.jobsDone', { n })}</Badge>
}

export function FastReplyBadge({ on }: { on?: boolean }) {
  const { t } = useTranslation()
  if (!on) return null
  return <Badge tone="primary" icon={Icon.sparkle}>{t('work.fastReply')}</Badge>
}

/** Owner: "who did you hire?" when marking a post filled. Hired drivers are asked to confirm. */
export function HireDialog({ postId, open, onClose, onDone }: { postId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [items, setItems] = useState<HireCandidate[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!open) return
    setItems(null)
    setPicked([])
    setError(false)
    work.candidates(postId).then((r) => setItems(r.items)).catch(() => setError(true))
  }, [open, postId])

  async function save(ids: string[]) {
    setBusy(true)
    try {
      const r = await work.markHired(postId, ids)
      track('hire_marked', { picked: ids.length })
      toast(r.asked > 0 ? t('work.askedToast', { n: r.asked }) : t('post.statusToast.filled'), { tone: 'success' })
      onDone()
      onClose()
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const lang = i18n.language
  return (
    <Dialog open={open} onClose={onClose} title={t('work.whoHired')} size="lg"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="action" block loading={busy} disabled={!picked.length} icon={Icon.check} onClick={() => void save(picked)}>
            {picked.length ? t('work.markN', { n: picked.length }) : t('work.pickFirst')}
          </Button>
          <Button variant="ghost" block disabled={busy} onClick={() => void save([])}>{t('work.notFromApp')}</Button>
        </div>
      }>
      <p className="mb-3 text-sm text-text-2">{t('work.whoHiredSub')}</p>
      {error && <Note tone="error">{t('error.generic')}</Note>}
      {!items && !error && <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {items?.length === 0 && <Note>{t('work.noCandidates')}</Note>}
      <ul className="flex flex-col gap-2">
        {items?.map((c) => {
          const done = !!c.hire_status
          const on = picked.includes(c.id)
          return (
            <li key={c.id}>
              <label className={`flex min-h-16 items-center gap-3 rounded-md border px-3 py-2 ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'} ${done ? 'opacity-60' : ''}`}>
                <input type="checkbox" className="size-5 accent-[var(--c-brand)]" checked={on || done} disabled={done}
                  onChange={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />
                <Avatar url={c.photo_url} name={c.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name || '—'}</span>
                  <span className="block truncate text-sm text-text-2">
                    {[c.district && c.state ? placeName(`${c.district}, ${c.state}`, lang) : '', c.interested ? t('work.showedInterest') : t('work.youCalled')].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {done && <Badge tone={c.hire_status === 'confirmed' ? 'success' : 'neutral'}>{t(`work.status.${c.hire_status}`)}</Badge>}
              </label>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

/** Driver home: confirm jobs the owner said they gave. */
export function PendingHires() {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile, driver, fleet, applyMe } = useAuth()
  const [items, setItems] = useState<Hire[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { work.mine().then((r) => setItems(r.items.filter((h) => h.status === 'pending'))).catch(() => {}) }, [])
  const h = items[0]
  if (!h) return null
  const who = h.other_business || h.other_name || ''
  async function answer(confirm: boolean) {
    setBusy(h.id)
    try {
      const r = await work.answer(h.id, confirm)
      track('hire_answer', { confirm })
      if (confirm && profile && driver) applyMe({ exists: true, profile, driver: { ...driver, is_available: r.available }, fleet })
      toast(confirm ? t('work.confirmedToast') : t('work.declinedToast'), { tone: 'success' })
      setItems((cur) => cur.slice(1))
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card className="border-action/60">
      <div className="flex items-center gap-3">
        <Avatar url={h.other_photo} name={who} size={44} />
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{t('work.didYouGet', { owner: who })}</p>
          <p className="text-sm text-text-2">{t('work.didYouGetSub')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="success" icon={Icon.check} loading={busy === h.id} onClick={() => void answer(true)}>{t('work.yesGot')}</Button>
        <Button variant="outline" disabled={busy === h.id} onClick={() => void answer(false)}>{t('work.no')}</Button>
      </div>
    </Card>
  )
}

/** Driver home: "still looking for work?" (shown when the server says it is due). */
export function LookingCard({ due }: { due: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile, driver, fleet, applyMe } = useAuth()
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!due || hidden) return null
  async function answer(still: boolean) {
    setBusy(true)
    try {
      const r = await work.looking(still)
      track('still_looking', { still })
      if (profile && driver) applyMe({ exists: true, profile, driver: { ...driver, is_available: r.is_available }, fleet })
      toast(still ? t('work.stillToast') : t('work.notLookingToast'), { tone: 'success' })
      setHidden(true)
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="border-primary/40">
      <p className="flex items-center gap-2 font-semibold">{Icon.help}{t('work.stillQ')}</p>
      <p className="mt-1 text-sm text-text-2">{t('work.stillSub')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="primary" loading={busy} onClick={() => void answer(true)}>{t('work.stillYes')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void answer(false)}>{t('work.stillNo')}</Button>
      </div>
    </Card>
  )
}
