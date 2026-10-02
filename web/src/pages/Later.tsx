import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { TabPage } from '../components/home'
import { useAuth } from '../lib/auth'
import { trackScreen } from '../lib/track'

/** "My posts" (owner) / "My interests" (driver) — the next part being built. */
export default function Later() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isDriver = profile?.role === 'driver'
  useEffect(() => { trackScreen(isDriver ? 'my_interests' : 'my_posts') }, [isDriver])
  return (
    <TabPage>
      <div className="bg-header px-4 pb-5 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <h1 className="mx-auto max-w-md font-display text-2xl font-bold">{isDriver ? t('tabs.interests') : t('tabs.posts')}</h1>
      </div>
      <main className="mx-auto max-w-md px-4 py-6">
        <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
          <p className="font-semibold">{isDriver ? t('later.interests') : t('later.posts')}</p>
          <Link to="/home" className="mt-4 inline-block rounded-xl bg-brand px-5 py-3 font-bold text-white">{t('later.back')}</Link>
        </div>
      </main>
    </TabPage>
  )
}
