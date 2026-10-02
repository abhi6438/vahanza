import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BigButton, Screen, TopBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { loadTheme, saveTheme, type ThemePref } from '../lib/theme'
import { track, trackScreen } from '../lib/track'

export default function Settings() {
  const { t } = useTranslation()
  const { lang, setLang, logout } = useAuth()
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
