import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { clearPinSkipped, pinApi, pinSkipped } from '../lib/pin'
import { storage } from '../lib/storage'
import type { Completion } from '../lib/completion'
import { track } from '../lib/track'
import { PhotoNudge } from './photo'
import { useAuth } from '../lib/auth'
import { ButtonLink, Icon, Note } from './ui'

const SNOOZE_DAYS = 3

/** Profile-completion card, or the photo reminder when only the photo is left. */
export function ProfileNudges({ role, done }: { role: 'driver' | 'owner'; done: Completion }) {
  const { profile } = useAuth()
  const [showPhoto, setShowPhoto] = useState(false)
  const onlyPhotoLeft = done.missing.length === 1 && done.missing[0].key === 'photo'
  useEffect(() => {
    if (profile?.photo_url || !onlyPhotoLeft) return setShowPhoto(false)
    void storage.getItem('photo-nudge-until').then((v) => {
      const show = !v || Date.now() > Number(v)
      setShowPhoto(show)
      if (show) track('photo_nudge_shown')
    })
  }, [profile?.photo_url, onlyPhotoLeft])
  const later = () => {
    setShowPhoto(false)
    void storage.setItem('photo-nudge-until', String(Date.now() + SNOOZE_DAYS * 86400000))
    track('photo_nudge_later')
  }
  if (done.missing.length > 0 && !onlyPhotoLeft) return <div><CompleteCard role={role} percent={done.percent} missing={done.missing} listable={done.listable} /></div>
  if (showPhoto) return <div><PhotoNudge role={role} onLater={later} /></div>
  return null
}

/** "Your profile is 40% complete" — the rest of the setup, one step at a time, whenever the user wants. */
export function CompleteCard({ role, percent, missing, listable, compact }: { role: 'driver' | 'owner'; percent: number; missing: { key: string; step: string }[]; listable: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const first = missing[0]
  const href = (step: string) => (step === 'about' ? '/setup?edit' : `/setup?step=${step}`)
  const shown = compact ? missing.slice(0, 3) : missing
  return (
    <section className="rounded-lg border border-border bg-surface p-card shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t('complete.title', { n: percent })}</h2>
        <span className="font-display text-xl font-semibold text-primary">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('complete.title', { n: percent })}>
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-brand),var(--ill-teal-mid))] transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${percent}%` }} />
      </div>
      {!compact && <p className="mt-3 text-sm text-text-2">{t(role === 'driver' ? 'complete.whyDriver' : 'complete.whyOwner')}</p>}
      {!listable && role === 'driver' && <div className="mt-3"><Note tone="warn">{t('complete.hiddenDriver')}</Note></div>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {shown.map((m) => (
          <li key={m.key}>
            <Link to={href(m.step)} className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium hover:bg-surface-2">+ {t(`complete.item.${m.key}`)}</Link>
          </li>
        ))}
      </ul>
      <ButtonLink to={href(first.step)} onClick={() => track('complete_profile_tap', { role, percent })} variant="primary" block className="mt-4">
        {t('complete.cta')}
      </ButtonLink>
    </section>
  )
}

/** Sprint 11: "make an MPIN" — only for people who skipped it after login. Hidden for 3 days after ✕. */
export function PinNudge() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  useEffect(() => {
    void (async () => {
      const snoozed = Number(await storage.getItem('vz-pin-nudge-off') || 0)
      if (!(await pinSkipped()) || Date.now() - snoozed < SNOOZE_DAYS * 86_400_000) return
      const m = await pinApi.mine().catch(() => null)
      if (m?.has_pin) return void clearPinSkipped()
      setShow(!!m)
    })()
  }, [])
  if (!show) return null
  return (
    <div className="anim-rise flex items-start gap-3 rounded-lg border border-primary/25 bg-[linear-gradient(135deg,var(--c-brand-soft),var(--c-card))] p-card shadow-sm">
      <span className="icon-tile size-10 bg-primary text-on-primary shadow-sm">{Icon.lock}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('pin.nudgeTitle')}</p>
        <p className="text-sm text-text-2">{t('pin.nudgeSub')}</p>
        <ButtonLink to="/pin" variant="primary" size="sm" className="mt-2" onClick={() => track('pin_nudge_tap')}>{t('pin.create')}</ButtonLink>
      </div>
      <button type="button" aria-label={t('close')} className="press -mr-1 -mt-1 grid size-ctl-sm shrink-0 place-items-center rounded-full text-text-2 hover:bg-surface"
        onClick={() => { setShow(false); void storage.setItem('vz-pin-nudge-off', String(Date.now())) }}>{Icon.close}</button>
    </div>
  )
}
