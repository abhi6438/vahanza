import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { storage } from '../lib/storage'
import type { Completion } from '../lib/completion'
import { track } from '../lib/track'
import { PhotoNudge } from './photo'
import { useAuth } from '../lib/auth'
import { ButtonLink, Note } from './ui'

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
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t('complete.title', { n: percent })}</h2>
        <span className="font-display text-xl font-bold text-primary">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('complete.title', { n: percent })}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
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
