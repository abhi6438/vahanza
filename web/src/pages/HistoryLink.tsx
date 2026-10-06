import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { SearchArt, SuccessArt } from '../assets/illustrations'
import { AnswerPanel } from '../components/history'
import { Avatar } from '../components/photo'
import { BrandMark } from '../components/shell'
import { ButtonLink, EmptyState, Frame, Icon, Skeleton } from '../components/ui'
import { ApiError, history, type HistoryAnswer, type PublicHistory } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { label, VEHICLES } from '../lib/catalog'
import { duration, monthsBetween, period, whoName } from '../lib/history'
import { setSeeking } from '../lib/share'
import { track, trackScreen } from '../lib/track'

/**
 * /h/<token>: the owner (not on the app) opens the driver's WhatsApp / SMS link and answers in one tap.
 * No login, no language step. Afterwards: "Do you also look for drivers? Free on Vahanza".
 */
export default function HistoryLink() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { token = '' } = useParams()
  const { lang: appLang, setLang } = useAuth()
  const [data, setData] = useState<PublicHistory | null>(null)
  const [state, setState] = useState<'' | 'missing' | 'expired' | 'answered'>('')
  const [done, setDone] = useState<HistoryAnswer['answer'] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    trackScreen('history_link')
    history.publicGet(token).then((d) => { setData(d); if (d.status !== 'pending') setState('answered') })
      .catch((e) => setState(e instanceof ApiError && e.status === 410 ? 'expired' : 'missing'))
  }, [token])

  async function answer(a: HistoryAnswer) {
    setBusy(true)
    try {
      await history.publicAnswer(token, a)
      track('history_answer', { answer: a.answer, stars: a.stars || 0, rehire: a.rehire ?? null, via: 'link' })
      setDone(a.answer)
    } catch (e) {
      setState(e instanceof ApiError && e.status === 409 ? 'answered' : 'missing')
    } finally { setBusy(false) }
  }

  const header = (
    <header className="surface-hero shadow-md" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}>
      <div className="mx-auto flex h-header max-w-xl items-center gap-2.5 px-4">
        <BrandMark size={32} />
        <span className="flex-1 font-display text-xl font-semibold">{brand.name}</span>
        <button type="button" onClick={() => void setLang(appLang === 'hi' ? 'en' : 'hi')}
          className="press inline-flex min-h-ctl-sm items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/90 ring-1 ring-inset ring-white/20 [&>svg]:size-icon-sm">{Icon.globe}{appLang === 'hi' ? 'EN' : 'हि'}</button>
      </div>
    </header>
  )
  const first = data?.driver || t('role.driver')
  return (
    <Frame header={header}>
      <main id="main" className="mx-auto w-full max-w-xl px-4 pb-10 pt-5">
        {!data && !state && <Skeleton className="h-80" />}
        {(state === 'missing' || state === 'expired') && (
          <EmptyState art={<SearchArt />} title={t(state === 'expired' ? 'hist.link.expired' : 'hist.link.missing')} body={t('hist.link.missingBody')}
            action={<ButtonLink to="/drivers" variant="primary" onClick={() => setSeeking('driver')}>{t('hist.link.findDrivers')}</ButtonLink>} />
        )}
        {data && !done && state !== 'missing' && state !== 'expired' && (
          <article className="anim-rise rounded-xl border border-border bg-surface p-card shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar url={data.driver_photo} name={first} size={60} />
              <div>
                <p className="font-display text-xl font-semibold">{first}</p>
                <p className="text-sm text-text-2">{t('hist.link.driverOn', { brand: brand.name })}</p>
              </div>
            </div>
            <p className="mt-4 text-lg leading-snug">
              {t('hist.link.says', { name: first, vehicle: label(VEHICLES, data.vehicle as never, lang), who: whoName(data) || t('hist.link.you') })}
            </p>
            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-3 py-2 text-lg font-semibold [&>svg]:size-icon-md">
              {Icon.calendar}{period(data.start_month, data.end_month, lang)}
              <span className="text-base font-normal text-text-2">({duration(monthsBetween(data.start_month, data.end_month), lang)})</span>
            </p>
            {state === 'answered'
              ? <p className="mt-5 rounded-md bg-success-soft px-4 py-3 font-semibold text-success">{t('hist.link.already')}</p>
              : <>
                  <p className="mb-3 mt-5 text-lg font-semibold">{t('hist.reqQ')}</p>
                  <AnswerPanel driverName={first} start={data.start_month} end={data.end_month} busy={busy} onAnswer={(a) => void answer(a)} />
                </>}
          </article>
        )}
        {done && (
          <div className="anim-rise rounded-xl border border-border bg-surface p-card text-center shadow-sm">
            <div className="mx-auto w-36"><SuccessArt /></div>
            <p className="mt-2 font-display text-xl font-semibold">{t('hist.link.thanks')}</p>
            <p className="mt-1 text-text-2">{t(`hist.ansDone.${done}`)}</p>
          </div>
        )}
        {(done || state === 'answered') && (
          <section className="surface-hero mt-5 rounded-xl p-card shadow-md">
            <p className="font-display text-lg font-semibold">{t('hist.link.ctaTitle')}</p>
            <p className="mt-1 text-white/80">{t('hist.link.ctaBody')}</p>
            <ButtonLink to="/drivers" variant="action" size="lg" block className="mt-3" icon={Icon.users} onClick={() => { setSeeking('driver'); track('history_link_cta') }}>{t('hist.link.findDrivers')}</ButtonLink>
          </section>
        )}
        <p className="mt-6 text-center text-xs text-text-3"><Link to="/legal" className="underline">{t('hist.link.privacy')}</Link></p>
      </main>
    </Frame>
  )
}
