import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contactOwner, removeInterest, showInterest, type Job } from '../lib/api'
import { placeName } from '../lib/catalog'
import { track } from '../lib/track'
import { JobCard } from './cards'
import { ContactButtons } from './home'
import { CardMenu } from './trust'

/** A job in the driver's list: call / WhatsApp the owner, or send "I'm interested" (owner then sees the profile). */
export function JobItem({ job, showStatus, onBlocked }: { job: Job; showStatus?: boolean; onBlocked?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [interested, setInterested] = useState(job.interested)
  const [busy, setBusy] = useState(false)
  const owner = job.business_name || job.owner_name || ''
  const first = (job.owner_name || '').split(' ')[0]
  const msg = lang === 'en'
    ? `Hello ${first}, I saw your post for drivers on the app. I am interested.`
    : `नमस्ते ${first} जी, ऐप पर ड्राइवर वाली आपकी पोस्ट देखी। मुझे काम में रुचि है।`
  async function toggle() {
    setBusy(true)
    try {
      if (interested) await removeInterest(job.id)
      else await showInterest(job.id)
      track(interested ? 'interest_removed' : 'interest_sent')
      setInterested(!interested)
    } finally {
      setBusy(false)
    }
  }
  return (
    <JobCard
      data={{ title: owner, photo_url: job.owner_photo, verified: job.owner_verified, distance_km: job.distance_km, rating_avg: job.owner_rating_avg, rating_count: job.owner_rating_count, place: job.owner_district && job.owner_state ? placeName(`${job.owner_district}, ${job.owner_state}`, lang) : '', post: job }}
      menu={job.owner_id ? <CardMenu target={{ type: 'post', id: job.id }} personId={job.owner_id} name={owner} onBlocked={onBlocked} /> : undefined}
      actions={job.status !== 'live' ? (
        <p className="mt-3 rounded-xl bg-line/60 px-3 py-2 text-center text-sm font-semibold text-muted">{t('job.closed')}</p>
      ) : (
        <>
          <ContactButtons target="owner" message={msg} reveal={(via) => contactOwner(job.id, via)} />
          <button type="button" disabled={busy} aria-pressed={interested} onClick={() => void toggle()}
            className="mt-2 min-h-12 w-full rounded-xl border-2 border-brand font-bold text-brand aria-pressed:bg-brand-soft disabled:opacity-60">
            {interested ? t('job.interestSent') : t('job.interest')}
          </button>
          {showStatus && interested && (
            <p className="mt-2 text-center text-sm text-muted">{job.interest_status === 'seen' ? t('job.seen') : t('job.notSeen')}</p>
          )}
        </>
      )} />
  )
}
