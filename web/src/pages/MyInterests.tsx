import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TabPage } from '../components/home'
import { JobItem } from '../components/jobs'
import { PushAsk } from '../components/notify'
import { myInterests, type Job } from '../lib/api'
import { trackScreen } from '../lib/track'

/** Driver's "My interests" tab: jobs they tapped "interested" on, and whether the owner has seen it. */
export default function MyInterests() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Job[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    trackScreen('my_interests')
    myInterests().then((r) => setItems(r.items)).catch(() => setError(true))
  }, [])
  return (
    <TabPage>
      <div className="bg-header px-4 pb-5 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">{t('tabs.interests')}</h1>
          <p className="text-sm opacity-90">{t('job.interestsSub')}</p>
        </div>
      </div>
      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
        {items === null && !error && <div className="h-48 animate-pulse rounded-2xl bg-card" />}
        {error && <p className="rounded-xl bg-card p-4 text-muted">{t('error.server')}</p>}
        {items?.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-4 text-muted">{t('job.noInterests')}</p>}
        {!!items?.length && <PushAsk from="interests" why={t('notif.whyDriverSeen')} />}
        {items?.map((j) => <JobItem key={j.id} job={j} showStatus />)}
      </main>
    </TabPage>
  )
}
