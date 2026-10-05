import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth-layout'
import { BigButton, H, Icon, Sub } from '../components/ui'
import { useAuth, type Lang } from '../lib/auth'
import { getSeeking, inviteCode, seekPath } from '../lib/share'
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
    <AuthLayout title={"भाषा चुनें · Language"} back={false} footer={<BigButton onClick={() => { void setLang(lang); nav(inviteCode() ? '/login' : seekPath(getSeeking())) }}>{t('continue')}</BigButton>}>
        <H>{t('lang.title')}</H>
        <Sub>{t('lang.sub')}</Sub>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.code}
              aria-pressed={lang === o.code}
              onClick={() => setLang(o.code)}
              className="card-lift press group flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm aria-pressed:border-primary/70 aria-pressed:bg-primary-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--c-brand)]"
            >
              <span className="grid size-12 place-items-center rounded-lg bg-[linear-gradient(145deg,var(--c-brand),var(--ill-teal-deep))] font-display text-2xl font-semibold text-white shadow-sm">{o.glyph}</span>
              <span className="min-w-0 flex-1">
                <strong className="block font-display text-lg font-semibold leading-tight">{o.name}</strong>
                <span className="text-sm text-text-2">{o.sub}</span>
              </span>
              <span className="grid size-6 place-items-center rounded-full border-2 border-border-strong text-on-primary group-aria-pressed:border-primary group-aria-pressed:bg-primary [&>svg]:size-3.5">{lang === o.code && Icon.check}</span>
            </button>
          ))}
        </div>
        <p className="mb-2 mt-6 text-sm font-semibold text-text-2">{t('lang.soon')}</p>
        <div className="flex flex-wrap gap-1.5">
          {['बघेली', 'मराठी', 'ગુજરાતી', 'पंजाबी', 'தமிழ்', 'తెలుగు'].map((l) => (
            <span key={l} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-text-2 ring-1 ring-inset ring-border">{l}</span>
          ))}
        </div>
      </AuthLayout>
  )
}
