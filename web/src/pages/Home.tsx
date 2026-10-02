import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui'
import { useAuth } from '../lib/auth'
import { trackScreen } from '../lib/track'

// Release 1 / Sprint 1: placeholder home. Sprint 2 adds profile setup, fleet and lists.
export default function Home() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  useEffect(() => trackScreen(profile?.role === 'driver' ? 'driver_home' : 'owner_home'), [profile?.role])
  const isDriver = profile?.role === 'driver'
  const phone = profile?.phone?.replace(/^91/, '') || ''

  return (
    <div className="min-h-full">
      <div className="bg-header px-4 pb-5 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>
        <div className="mx-auto flex max-w-md items-center gap-2.5">
          <div className="flex-1 font-display text-2xl font-bold">
            {t('home.hello')}{profile?.name ? `, ${profile.name}` : ''}
          </div>
          <Link to="/settings" aria-label={t('settings.title')} className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">{Icon.settings}</Link>
        </div>
        <div className="mx-auto mt-2 max-w-md text-sm opacity-90">+91 {phone.slice(0, 5)} {phone.slice(5)} · {isDriver ? t('role.driver') : t('role.owner')}</div>
      </div>
      <main className="mx-auto max-w-md px-4 py-4">
        <div className="rounded-2xl border border-line bg-card p-4">
          <span className="inline-block rounded-full bg-line/70 px-2.5 text-xs font-bold text-muted">{t('home.notVerified')}</span>
          <p className="mt-2 font-semibold">{t('home.loggedIn')}</p>
          <p className="mt-1 text-sm text-muted">{isDriver ? t('home.driverNext') : t('home.ownerNext')}</p>
        </div>
      </main>
    </div>
  )
}
