import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PushAsk } from '../components/notify'
import { BigButton, Screen, TopBar } from '../components/ui'
import { notifications, type NotifyPrefs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { loadTheme, saveTheme, type ThemePref } from '../lib/theme'
import { track, trackScreen } from '../lib/track'

export default function Settings() {
  const { t } = useTranslation()
  const { lang, setLang, logout, profile } = useAuth()
  const [theme, setTheme] = useState<ThemePref>('system')
  useEffect(() => {
    trackScreen('settings')
    void loadTheme().then(setTheme)
  }, [])

  const chip = 'flex-1 rounded-xl border-2 border-line bg-card py-2.5 font-semibold aria-pressed:border-brand aria-pressed:bg-brand-soft'
  return (
    <>
      <TopBar title={t('settings.title')} />
      <Screen>
        <p className="mb-2 font-bold">{t('settings.language')}</p>
        <div className="mb-5 flex gap-2">
          <button className={chip} aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हिंदी</button>
          <button className={chip} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
        <p className="mb-2 font-bold">{t('settings.theme')}</p>
        <div className="mb-6 flex gap-2">
          {(['system', 'light', 'dark'] as ThemePref[]).map((p) => (
            <button key={p} className={chip} aria-pressed={theme === p} onClick={() => { setTheme(p); void saveTheme(p); track('theme_set', { theme: p }) }}>
              {t(`settings.${p}`)}
            </button>
          ))}
        </div>
        {(profile?.role === 'driver' || profile?.role === 'owner') && <NotifySettings role={profile.role} />}
        <div className="flex flex-col gap-3">
          <BigButton variant="secondary" onClick={() => logout(false)}>{t('settings.logout')}</BigButton>
          <BigButton variant="secondary" onClick={() => logout(true)}>{t('settings.logoutAll')}</BigButton>
        </div>
        <div className="mt-6 space-y-1 text-sm text-muted">
          <p>{t('settings.help')}: <span className="select-all font-semibold text-ink">{brand.supportPhone}</span></p>
          <p>{t('settings.grievance')}: {brand.grievanceOfficer.name}, <span className="select-all">{brand.grievanceOfficer.email}</span></p>
          <p>{t('settings.version')}: {__APP_VERSION__}</p>
        </div>
      </Screen>
    </>
  )
}

/** Which alerts to get. Post approved / not approved always comes. */
function NotifySettings({ role }: { role: 'driver' | 'owner' }) {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null)
  useEffect(() => { notifications.prefs().then(setPrefs).catch(() => {}) }, [])
  const keys: (keyof NotifyPrefs)[] = role === 'driver' ? ['new_post', 'interest_seen'] : ['new_interest']
  async function flip(k: keyof NotifyPrefs) {
    if (!prefs) return
    const next = !prefs[k]
    setPrefs({ ...prefs, [k]: next })
    track('notify_pref', { kind: k, on: next })
    try { setPrefs(await notifications.setPrefs({ [k]: next })) } catch { setPrefs({ ...prefs }) }
  }
  return (
    <section className="mb-6">
      <p className="mb-2 font-bold">{t('notif.settings')}</p>
      <div className="mb-3"><PushAsk from="settings" force why={role === 'owner' ? t('notif.whyOwner') : t('notif.whyDriver')} /></div>
      <div className="flex flex-col gap-2">
        {keys.map((k) => (
          <label key={k} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-card px-4">
            <span className="flex-1 font-semibold">{t(`notif.pref.${k}`)}</span>
            <input type="checkbox" role="switch" className="peer sr-only" checked={prefs ? prefs[k] : true} disabled={!prefs} onChange={() => void flip(k)} />
            <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-call peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
          </label>
        ))}
      </div>
    </section>
  )
}
