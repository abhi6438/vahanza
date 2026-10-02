import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { storage } from '../lib/storage'
import type { Completion } from '../lib/completion'
import { track } from '../lib/track'
import { PhotoNudge } from './photo'
import { useAuth } from '../lib/auth'

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
  if (done.missing.length > 0 && !onlyPhotoLeft) return <div className="mt-4"><CompleteCard role={role} percent={done.percent} missing={done.missing} listable={done.listable} /></div>
  if (showPhoto) return <div className="mt-4"><PhotoNudge role={role} onLater={later} /></div>
  return null
}

/** "Your profile is 40% complete" — the rest of the setup, one step at a time, whenever the user wants. */
export function CompleteCard({ role, percent, missing, listable }: { role: 'driver' | 'owner'; percent: number; missing: { key: string; step: string }[]; listable: boolean }) {
  const { t } = useTranslation()
  const first = missing[0]
  const href = (step: string) => (step === 'about' ? '/setup?edit' : `/setup?step=${step}`)
  return (
    <section className="rounded-2xl border-2 border-brand bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{t('complete.title', { n: percent })}</h2>
        <span className="font-display text-xl font-bold text-brand">{percent}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-[15px]">{t(role === 'driver' ? 'complete.whyDriver' : 'complete.whyOwner')}</p>
      {!listable && role === 'driver' && (
        <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-ink">{t('complete.hiddenDriver')}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {missing.map((m) => (
          <Link key={m.key} to={href(m.step)} className="rounded-full border-2 border-line px-3 py-1.5 text-sm font-semibold">
            + {t(`complete.item.${m.key}`)}
          </Link>
        ))}
      </div>
      <Link to={href(first.step)} onClick={() => track('complete_profile_tap', { role, percent })}
        className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-brand font-bold text-white">
        {t('complete.cta')}
      </Link>
    </section>
  )
}
