import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { BigButton, H, Sub } from '../components/ui'
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
  useEffect(() => { trackScreen('language') }, [])

  return (
    <AuthLayout title={"भाषा चुनें · Language"} back={false} footer={<BigButton onClick={() => { void setLang(lang); nav('/login') }}>{t('continue')}</BigButton>}>
        <H>{t('lang.title')}</H>
        <Sub>{t('lang.sub')}</Sub>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.code}
              aria-pressed={lang === o.code}
              onClick={() => setLang(o.code)}
              className="flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4 text-left aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary"
            >
              <span className="grid h-14 w-14 place-items-center rounded-md bg-brand-soft font-display text-3xl font-bold text-brand">{o.glyph}</span>
              <span>
                <strong className="block text-[22px] leading-tight">{o.name}</strong>
                <span className="text-sm text-text-2">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 mb-2 font-bold">{t('lang.soon')}</p>
        <div className="flex flex-wrap gap-1.5">
          {['बघेली', 'मराठी', 'ગુજરાતી', 'पंजाबी', 'தமிழ்', 'తెలుగు'].map((l) => (
            <span key={l} className="rounded-full bg-line/60 px-2.5 py-0.5 text-sm text-text-2">{l}</span>
          ))}
        </div>
      </AuthLayout>
  )
}
