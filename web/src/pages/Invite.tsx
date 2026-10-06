import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CommunityArt } from '../assets/illustrations'
import { boosted, DigitalCardDialog, inviteText, useGrowth } from '../components/growth'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, Card, ErrorState, Icon, Note, Skeleton } from '../components/ui'
import { useAuth } from '../lib/auth'
import { canShareSheet, refLink, shareOther, shareWhatsApp } from '../lib/share'
import { track, trackScreen } from '../lib/track'

/** "Invite friends": your link, how the reward works, and how many joined. */
export default function Invite() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const toast = useToast()
  const { g, error } = useGrowth()
  const [card, setCard] = useState(false)
  useEffect(() => { trackScreen('invite') }, [])
  const lang = i18n.language
  const isDriver = profile?.role === 'driver'

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('invite.copied'), { tone: 'success' })
      track('ref_share', { via: 'copy' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    }
  }

  return (
    <AppShell title={t('invite.title')} back width="narrow">
      <div className="flex flex-col gap-4">
        <Card className="overflow-hidden !p-0">
          <div className="surface-hero flex items-center gap-3 px-5 py-5">
            <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/85 [&>svg]:text-action">{Icon.gift}{t('invite.kicker')}</p>
            <p className="mt-1 font-display text-2xl font-semibold leading-tight tracking-[-0.01em]">{t(isDriver ? 'invite.headDriver' : 'invite.headOwner', { days: g?.boost_days ?? 7 })}</p>
            </div>
            <div className="hidden w-28 shrink-0 rounded-xl bg-white/90 p-1 sm:block"><CommunityArt /></div>
          </div>
          <ol className="flex flex-col gap-3 px-5 py-4">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary shadow-sm">{n}</span>
                <span className="pt-0.5">{t(`invite.step${n}`, { days: g?.boost_days ?? 7 })}</span>
              </li>
            ))}
          </ol>
          <Link to="/rewards" className="flex items-center gap-2 border-t border-border px-5 py-3 font-semibold text-primary [&>svg]:size-icon-sm">
            <span className="premium-fill grid size-7 shrink-0 place-items-center rounded-full [&>svg]:size-icon-sm">{Icon.crown}</span>
            <span className="flex-1">{t('invite.pointsLink')}</span>{Icon.chevron}
          </Link>
        </Card>

        {error && <ErrorState onRetry={() => window.location.reload()} />}
        {!g && !error && <Skeleton className="h-40" />}
        {g && (
          <>
            <Card>
              <p className="text-sm text-text-2">{t('invite.yourLink')}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2.5 text-sm">{refLink(g.ref_code).replace(/^https?:\/\//, '')}</code>
                <Button variant="outline" aria-label={t('invite.copy')} title={t('invite.copy')} className="shrink-0 !px-3" onClick={() => void copy(refLink(g.ref_code))}>{Icon.copy}</Button>
              </div>
              <p className="mt-2 text-sm text-text-2">{t('invite.code')}: <strong className="tracking-widest text-text">{g.ref_code}</strong></p>
              <Button variant="whatsapp" size="lg" block icon={Icon.whatsapp} className="mt-4"
                onClick={() => shareWhatsApp(inviteText(g.ref_code, lang, profile?.role), 'ref_share', { from: 'invite' })}>
                {t('invite.whatsapp')}
              </Button>
              <div className={`mt-2 grid gap-2 ${isDriver && canShareSheet() ? 'grid-cols-2' : ''}`}>
                {isDriver && <Button variant="outline" icon={Icon.idcard} onClick={() => { setCard(true); track('card_open', { from: 'invite' }) }}>{t('card.mine')}</Button>}
                {canShareSheet() && <Button variant="outline" icon={Icon.share} onClick={() => void shareOther(inviteText(g.ref_code, lang, profile?.role), 'ref_share', { from: 'invite' })}>{t('share.more')}</Button>}
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="text-center">
                <p className="font-display text-3xl font-semibold">{g.joined}</p>
                <p className="text-sm text-text-2">{t('invite.joined')}</p>
              </Card>
              <Card className="text-center">
                <p className="font-display text-3xl font-semibold text-success">{g.completed}</p>
                <p className="text-sm text-text-2">{t('invite.completed')}</p>
              </Card>
            </div>
            {boosted(g)
              ? <Note tone="success" icon={Icon.sparkle}>{t('growth.topUntil', { date: new Date(g.boost_until!).toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'long' }) })}</Note>
              : <Note>{t('invite.howTop', { days: g.boost_days })}</Note>}
            <p className="text-center text-sm text-text-2">{t('invite.fair')}</p>
            {isDriver && <DigitalCardDialog open={card} onClose={() => setCard(false)} code={g.ref_code} />}
          </>
        )}
      </div>
    </AppShell>
  )
}
