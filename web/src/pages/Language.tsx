import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BigButton, H, Screen, Sub, TopBar } from '../components/ui'
import { useAuth, type Lang } from '../lib/auth'
import { trackScreen } from '../lib/track'

const OPTIONS: { code: Lang; glyph: string; name: string; sub: string }[] = [
  { code: 'hi', glyph: 'अ', name: 'हिंदी', sub: 'Hindi' },
  { code: 'en', glyph: 'A', name: 'English', sub: 'अंग्रेज़ी' },
]

export default function Language() {
  const { t } = useTranslation()
  const { lang, setLang } = useAuth()
  const nav = useNavigate()
  useEffect(() => trackScreen('language'), [])

  return (
    <>
      <TopBar title="भाषा चुनें · Language" back={false} />
      <Screen footer={<BigButton onClick={() => nav('/role')}>{t('continue')}</BigButton>}>
        <H>{t('lang.title')}</H>
        <Sub>{t('lang.sub')}</Sub>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.code}
              aria-pressed={lang === o.code}
              onClick={() => setLang(o.code)}
              className="flex items-center gap-3.5 rounded-2xl border-2 border-line bg-card p-4 text-left aria-pressed:border-brand aria-pressed:bg-brand-soft"
            >
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-soft font-display text-3xl font-bold text-brand">{o.glyph}</span>
              <span>
                <strong className="block text-[22px] leading-tight">{o.name}</strong>
                <span className="text-sm text-muted">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 mb-2 font-bold">{t('lang.soon')}</p>
        <div className="flex flex-wrap gap-1.5">
          {['बघेली', 'मराठी', 'ગુજરાતી', 'पंजाबी', 'தமிழ்', 'తెలుగు'].map((l) => (
            <span key={l} className="rounded-full bg-line/60 px-2.5 py-0.5 text-sm text-muted">{l}</span>
          ))}
        </div>
      </Screen>
    </>
  )
}
