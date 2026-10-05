import { useEffect, useState, type ReactNode } from 'react'
import { useToast } from './toast'
import { Button, Dialog, Icon } from './ui'
import { useTranslation } from 'react-i18next'
import { ApiError, blockPerson, ratePerson, sendReport, toRate, type ReportReason, type ToRate } from '../lib/api'
import { pick, type Pair } from '../lib/catalog'
import { track } from '../lib/track'
import { Avatar } from './photo'

/** Bottom sheet (phone) / centred dialog (desktop). Thin wrapper kept for older call sites. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <Dialog open={open} onClose={onClose} title={title}>{children}</Dialog>
}

const REASONS: { key: ReportReason; label: Pair }[] = [
  { key: 'asked_money', label: ['पैसे माँगे (एडवांस, फ़ीस)', 'Asked for money (advance, fee)'] },
  { key: 'wrong_number', label: ['नंबर गलत / बंद है', 'Wrong or switched-off number'] },
  { key: 'fake', label: ['नकली प्रोफ़ाइल / पोस्ट', 'Fake profile / post'] },
  { key: 'behaviour', label: ['बुरा व्यवहार', 'Bad behaviour'] },
  { key: 'other', label: ['कुछ और', 'Something else'] },
]

/**
 * "⋮" on someone else's card: report or block.
 * target: what is reported (a profile or a post); personId: who gets blocked.
 */
export function CardMenu({ target, personId, name, onBlocked }: {
  target: { type: 'profile' | 'post'; id: string }
  personId: string
  name: string
  onBlocked?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState<'' | 'menu' | 'report' | 'block' | 'done'>('')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = () => { setOpen(''); setReason(null); setNote(''); setError('') }

  async function submitReport() {
    if (!reason) return
    setBusy(true)
    setError('')
    try {
      await sendReport(target.type, target.id, reason, note.trim())
      track('report_sent', { reason, target: target.type })
      setReason(null)
      setNote('')
      setOpen('done')
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? t('trust.cantSelf') : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }
  async function doBlock() {
    setBusy(true)
    try {
      await blockPerson(personId)
      track('block', { target: target.type })
      close()
      toast(t('trust.blockedToast', { name }), { tone: 'success' })
      onBlocked?.()
    } catch {
      setError(t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const toast = useToast()
  const row = 'flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-4 text-left font-medium hover:bg-surface-2'
  return (
    <>
      <button type="button" aria-label={t('trust.more')} title={t('trust.more')} onClick={() => setOpen('menu')}
        className="-mr-2 -mt-1.5 grid size-11 shrink-0 place-items-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>

      <Sheet open={open === 'menu'} onClose={close} title={name}>
        <div className="flex flex-col gap-2.5">
          <button type="button" className={row} onClick={() => setOpen('report')}><span className="text-warning">{Icon.alert}</span>{t('trust.report')}</button>
          <button type="button" className={`${row} text-error`} onClick={() => setOpen('block')}>{Icon.ban}{t('trust.block')}</button>
          <Button variant="ghost" size="lg" block className="mt-1 !text-text-2" onClick={close}>{t('cancel')}</Button>
        </div>
      </Sheet>

      <Sheet open={open === 'report'} onClose={close} title={t('trust.reportTitle')}>
        <p className="mb-3 text-sm text-text-2">{t('trust.reportSub')}</p>
        <div role="radiogroup" aria-label={t('trust.reportTitle')} className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <button key={r.key} type="button" role="radio" aria-checked={reason === r.key} onClick={() => setReason(r.key)}
              className="flex min-h-12 items-center gap-3 rounded-md border border-border px-3.5 text-left font-medium aria-checked:border-error aria-checked:bg-error-soft">
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${reason === r.key ? 'border-error' : 'border-border'}`}>{reason === r.key && <span className="size-2.5 rounded-full bg-error" />}</span>
              {pick(r.label, i18n.language)}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder={t('trust.notePh')}
          className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-primary" aria-label={t('trust.notePh')} />
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        <Button size="lg" block disabled={!reason} loading={busy} onClick={() => void submitReport()} className="mt-3 !bg-error !text-on-error">{t('trust.send')}</Button>
      </Sheet>

      <Sheet open={open === 'done'} onClose={close} title={t('trust.reported')}>
        <p className="mb-4">{t('trust.reportedSub')}</p>
        <Button variant="outline" size="lg" block onClick={() => setOpen('block')}>{t('trust.alsoBlock')}</Button>
        <Button size="lg" block className="mt-2" onClick={close}>{t('ok')}</Button>
      </Sheet>

      <Sheet open={open === 'block'} onClose={close} title={t('trust.blockTitle', { name })}>
        <p className="mb-4 text-text-2">{t('trust.blockSub')}</p>
        {error && <p role="alert" className="mb-2 text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="lg" block onClick={close}>{t('cancel')}</Button>
          <Button size="lg" block loading={busy} className="!bg-error !text-on-error" onClick={() => void doBlock()}>{t('trust.blockYes')}</Button>
        </div>
      </Sheet>
    </>
  )
}

const TAGS: Record<'driver' | 'owner', { key: string; label: Pair }[]> = {
  // tags an owner gives a driver
  driver: [
    { key: 'time', label: ['समय पर आता है', 'On time'] },
    { key: 'safe', label: ['सुरक्षित चलाता है', 'Drives safely'] },
    { key: 'care', label: ['गाड़ी का ध्यान', 'Takes care of vehicle'] },
    { key: 'sober', label: ['नशा नहीं करता', 'Does not drink'] },
    { key: 'manner', label: ['अच्छा व्यवहार', 'Good behaviour'] },
  ],
  // tags a driver gives an owner
  owner: [
    { key: 'pay', label: ['समय पर पैसा', 'Pays on time'] },
    { key: 'manner', label: ['अच्छा व्यवहार', 'Good behaviour'] },
    { key: 'stay', label: ['रहना-खाना ठीक', 'Good stay and food'] },
    { key: 'leave', label: ['छुट्टी देते हैं', 'Gives leave'] },
    { key: 'vehicle', label: ['गाड़ी ठीक हालत में', 'Vehicle in good shape'] },
  ],
}
const STAR_WORDS: Pair[] = [['', ''], ['बहुत खराब', 'Very bad'], ['खराब', 'Bad'], ['ठीक', 'Okay'], ['अच्छा', 'Good'], ['बहुत अच्छा', 'Very good']]

/** "How was Ramesh?" — shown on home after a call / interest, one person at a time. */
export function RatePrompt() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [list, setList] = useState<ToRate[]>([])
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [thanks, setThanks] = useState(false)
  useEffect(() => { toRate().then((r) => setList(r.items)).catch(() => {}) }, [])
  const p = list[0]
  if (!p && !thanks) return null
  if (thanks && !p) return <p className="rounded-lg bg-success-soft px-4 py-3 font-medium text-success">{t('trust.thanks')}</p>

  const nameShown = p.business_name || p.name || ''
  const next = () => { setList((l) => l.slice(1)); setStars(0); setTags([]) }
  async function submit() {
    setBusy(true)
    try {
      await ratePerson(p.id, stars, tags)
      track('rating_sent', { stars, tags: tags.length, ratee: p.role })
      setThanks(true)
      next()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-lg border border-action/60 bg-surface p-4 shadow-sm" aria-label={t('trust.howWas', { name: nameShown })}>
      <div className="flex items-center gap-3">
        <Avatar url={p.photo_url} name={nameShown} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('trust.howWas', { name: nameShown })}</p>
          <p className="text-sm text-text-2">{p.worked ? <span className="font-medium text-success">✓ {t('work.workedTogether')}</span> : t('trust.rateSub')}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between" role="radiogroup" aria-label={t('trust.stars')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`} onClick={() => setStars(n)}
            className={`grid size-12 place-items-center rounded-md text-[1.75rem] transition-colors hover:bg-surface-2 ${n <= stars ? 'text-action' : 'text-border'}`}>{Icon.star}</button>
        ))}
      </div>
      {stars > 0 && <p className="text-center text-sm font-medium">{pick(STAR_WORDS[stars], lang)}</p>}
      {stars >= 3 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {TAGS[p.role].map((g) => (
            <button key={g.key} type="button" aria-pressed={tags.includes(g.key)} onClick={() => setTags(tags.includes(g.key) ? tags.filter((x) => x !== g.key) : [...tags, g.key])}
              className="min-h-9 rounded-full border border-border px-3 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary">
              {pick(g.label, lang)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => { track('rating_skip'); next() }}>{t('trust.notNow')}</Button>
        <Button className="flex-1" disabled={!stars} loading={busy} onClick={() => void submit()}>{t('trust.rate')}</Button>
      </div>
      {stars > 0 && stars <= 2 && <p className="mt-2 text-sm text-text-2">{t('trust.lowHint')}</p>}
    </section>
  )
}
