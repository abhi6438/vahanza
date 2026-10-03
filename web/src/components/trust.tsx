import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, blockPerson, ratePerson, sendReport, toRate, type ReportReason, type ToRate } from '../lib/api'
import { pick, type Pair } from '../lib/catalog'
import { track } from '../lib/track'
import { Avatar } from './photo'

/** Bottom sheet (phone) / centered dialog (desktop). Closes on backdrop tap and Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-3xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <h2 className="mb-3 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
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
      onBlocked?.()
    } catch {
      setError(t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const row = 'flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-line px-4 text-left font-semibold'
  return (
    <>
      <button type="button" aria-label={t('trust.more')} onClick={() => setOpen('menu')}
        className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
      </button>

      <Sheet open={open === 'menu'} onClose={close} title={name}>
        <div className="flex flex-col gap-2.5">
          <button type="button" className={row} onClick={() => setOpen('report')}>⚑ {t('trust.report')}</button>
          <button type="button" className={`${row} text-danger`} onClick={() => setOpen('block')}>⊘ {t('trust.block')}</button>
          <button type="button" className="mt-1 min-h-12 font-bold text-muted" onClick={close}>{t('cancel')}</button>
        </div>
      </Sheet>

      <Sheet open={open === 'report'} onClose={close} title={t('trust.reportTitle')}>
        <p className="mb-3 text-sm text-muted">{t('trust.reportSub')}</p>
        <div className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <button key={r.key} type="button" aria-pressed={reason === r.key} onClick={() => setReason(r.key)}
              className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3.5 text-left font-semibold aria-pressed:border-danger aria-pressed:bg-danger/5">
              <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${reason === r.key ? 'border-danger bg-danger' : 'border-line'}`} />
              {pick(r.label, i18n.language)}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder={t('trust.notePh')}
          className="mt-3 w-full rounded-xl border-2 border-line bg-bg px-3 py-2 outline-none focus:border-brand" aria-label={t('trust.notePh')} />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button type="button" disabled={!reason || busy} onClick={() => void submitReport()}
          className="mt-3 min-h-14 w-full rounded-2xl bg-danger text-lg font-bold text-white disabled:opacity-50">{t('trust.send')}</button>
      </Sheet>

      <Sheet open={open === 'done'} onClose={close} title={t('trust.reported')}>
        <p className="mb-4">{t('trust.reportedSub')}</p>
        <button type="button" className="min-h-14 w-full rounded-2xl border-2 border-line font-bold" onClick={() => setOpen('block')}>{t('trust.alsoBlock')}</button>
        <button type="button" className="mt-2 min-h-14 w-full rounded-2xl bg-brand font-bold text-white" onClick={close}>{t('ok')}</button>
      </Sheet>

      <Sheet open={open === 'block'} onClose={close} title={t('trust.blockTitle', { name })}>
        <p className="mb-4">{t('trust.blockSub')}</p>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="min-h-14 flex-1 rounded-2xl border-2 border-line font-bold" onClick={close}>{t('cancel')}</button>
          <button type="button" disabled={busy} className="min-h-14 flex-1 rounded-2xl bg-danger font-bold text-white disabled:opacity-50" onClick={() => void doBlock()}>{t('trust.blockYes')}</button>
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
  if (thanks && !p) return <p className="mt-4 rounded-2xl bg-call/10 px-4 py-3 font-semibold text-call">{t('trust.thanks')}</p>

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
    <section className="mt-4 rounded-2xl border-2 border-accent bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar url={p.photo_url} name={nameShown} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t('trust.howWas', { name: nameShown })}</p>
          <p className="text-sm text-muted">{t('trust.rateSub')}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between" role="radiogroup" aria-label={t('trust.stars')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`} onClick={() => setStars(n)}
            className={`grid h-12 w-12 place-items-center rounded-xl text-3xl leading-none ${n <= stars ? 'text-accent' : 'text-line'}`}>★</button>
        ))}
      </div>
      {stars > 0 && <p className="text-center text-sm font-semibold">{pick(STAR_WORDS[stars], lang)}</p>}
      {stars >= 3 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {TAGS[p.role].map((g) => (
            <button key={g.key} type="button" aria-pressed={tags.includes(g.key)} onClick={() => setTags(tags.includes(g.key) ? tags.filter((x) => x !== g.key) : [...tags, g.key])}
              className="rounded-full border-2 border-line px-3 py-1.5 text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-brand-soft">
              {pick(g.label, lang)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => { track('rating_skip'); next() }} className="min-h-12 flex-1 rounded-xl border-2 border-line font-bold text-muted">{t('trust.notNow')}</button>
        <button type="button" disabled={!stars || busy} onClick={() => void submit()} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-white disabled:opacity-50">{t('trust.rate')}</button>
      </div>
      {stars > 0 && stars <= 2 && <p className="mt-2 text-sm text-muted">{t('trust.lowHint')}</p>}
    </section>
  )
}
