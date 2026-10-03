import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JobItem } from '../components/jobs'
import { PushAsk } from '../components/notify'
import { AppShell, CardGrid } from '../components/shell'
import { ButtonLink, CardSkeletons, EmptyState, ErrorState, Icon } from '../components/ui'
import { myInterests, type Job } from '../lib/api'
import { trackScreen } from '../lib/track'

/** Driver's "My interests": jobs they tapped "interested" on, and whether the owner has seen it. */
export default function MyInterests() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Job[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    myInterests().then((r) => setItems(r.items)).catch(() => setError(true))
  }, [])
  useEffect(() => { trackScreen('my_interests'); load() }, [load])
  const seen = items?.filter((j) => j.interest_status === 'seen').length || 0
  return (
    <AppShell title={t('tabs.interests')} sub={t('job.interestsSub')} width="wide">
      <p className="mb-4 text-text-2 lg:hidden">{t('job.interestsSub')}</p>
      {!!items?.length && (
        <div className="mb-4 flex flex-col gap-3">
          <p className="text-sm text-text-2">{t('job.seenCount', { seen, n: items.length })}</p>
          <PushAsk from="interests" why={t('notif.whyDriverSeen')} />
        </div>
      )}
      {error && <ErrorState onRetry={load} />}
      {items?.length === 0 && (
        <EmptyState icon={Icon.heart} title={t('job.noInterestsTitle')} body={t('job.noInterests')}
          action={<ButtonLink to="/home" variant="primary">{t('job.findJobs')}</ButtonLink>} />
      )}
      <CardGrid>
        {items === null && !error && <CardSkeletons count={2} height="h-64" />}
        {items?.map((j) => <JobItem key={j.id} job={j} showStatus />)}
      </CardGrid>
    </AppShell>
  )
}
