import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contactOwner, removeInterest, showInterest, work, type Job } from '../lib/api'
import { placeName } from '../lib/catalog'
import { track } from '../lib/track'
import { JobCard } from './cards'
import { ShareJobButton } from './growth'
import { ContactButtons } from './home'
import { useToast } from './toast'
import { CardMenu } from './trust'
import { Button, Icon } from './ui'

/** A job in the driver's list: call / WhatsApp the owner, or send "I'm interested" (owner then sees the profile). */
export function JobItem({ job, showStatus, onBlocked }: { job: Job; showStatus?: boolean; onBlocked?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [interested, setInterested] = useState(job.interested)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
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
      toast(interested ? t('job.interestRemovedToast') : t('job.interestSentToast'), { tone: 'success' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <JobCard
      onOpen={() => void work.viewJob(job.id).catch(() => {})}
      data={{ title: owner, photo_url: job.owner_photo, verified: job.owner_verified, tick: job.owner_tick, premium: job.owner_premium, distance_km: job.distance_km, rating_avg: job.owner_rating_avg, rating_count: job.owner_rating_count, jobsDone: job.owner_jobs_done, fastReply: job.owner_fast_reply, place: job.owner_district && job.owner_state ? placeName(`${job.owner_district}, ${job.owner_state}`, lang) : '', post: job }}
      menu={job.owner_id ? <CardMenu target={{ type: 'post', id: job.id }} personId={job.owner_id} name={owner} onBlocked={onBlocked} /> : undefined}
      actions={job.status !== 'live' ? (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2.5 text-center text-sm font-medium text-text-2">{t('job.closed')}</p>
      ) : (
        <>
          <ContactButtons target="owner" message={msg} reveal={(via) => contactOwner(job.id, via)} />
          <div className="mt-2 flex gap-2">
            <Button variant={interested ? 'outline' : 'ghost'} block className={interested ? '!border-primary !bg-primary-soft !text-primary' : 'border border-primary/40'}
              aria-pressed={interested} loading={busy} icon={interested ? Icon.check : Icon.heart} onClick={() => void toggle()}>
              {interested ? t('job.interestSent') : t('job.interest')}
            </Button>
            <ShareJobButton post={job} from="job_list" iconOnly fallbackCity={job.owner_district ? placeName(`${job.owner_district}, ${job.owner_state}`, lang) : ''} />
          </div>
          {showStatus && interested && (
            <p className={`mt-2 text-center text-sm ${job.interest_status === 'seen' ? 'font-medium text-success' : 'text-text-2'}`}>{job.interest_status === 'seen' ? t('job.seen') : t('job.notSeen')}</p>
          )}
        </>
      )} />
  )
}
