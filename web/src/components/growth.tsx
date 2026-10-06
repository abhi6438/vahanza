import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { myGrowth, type Growth, type Post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { label, placeName, rupees, VEHICLES } from '../lib/catalog'
import { canShareSheet, jobLink, refLink, shareImage, shareOther, shareWhatsApp } from '../lib/share'
import { track } from '../lib/track'
import { useToast } from './toast'
import { LookingCard } from './work'
import { Button, Card, Dialog, Icon, Skeleton } from './ui'

/** "Rewa: 3 drivers wanted for Truck · ₹18,000/month savings. See and call directly: <link>" */
export function jobShareText(post: Pick<Post, 'groups' | 'base_cities' | 'savings_monthly' | 'share_code'>, lang: string, fallbackCity = '') {
  const need = post.groups.reduce((s, g) => s + g.drivers_needed, 0)
  const vehicles = [...new Set(post.groups.map((g) => label(VEHICLES, g.vehicle_type as never, lang)))].join(', ')
  const city = post.base_cities[0] ? placeName(post.base_cities[0], lang) : fallbackCity
  const link = jobLink(post.share_code || '')
  return lang === 'en'
    ? `${city ? `${city}: ` : ''}${need} driver(s) wanted for ${vehicles}. Savings ${rupees(post.savings_monthly)}/month. See the job and call the owner directly on ${brand.name} (free): ${link}`
    : `${city ? `${city} में ` : ''}${vehicles} के लिए ${need} ड्राइवर चाहिए। बचत ${rupees(post.savings_monthly)}/महीना। ${brand.name} पर काम देखें और मालिक को सीधे कॉल करें (बिल्कुल मुफ़्त): ${link}`
}

/** WhatsApp share for a job (owners share their own post, drivers forward a job to a friend). */
export function ShareJobButton({ post, from, fallbackCity, compact, iconOnly }: { post: Pick<Post, 'groups' | 'base_cities' | 'savings_monthly' | 'share_code' | 'status'>; from: string; fallbackCity?: string; compact?: boolean; iconOnly?: boolean }) {
  const { t, i18n } = useTranslation()
  if (!post.share_code || post.status !== 'live') return null
  const text = jobShareText(post, i18n.language, fallbackCity)
  // iconOnly: sits in the same row as another button (job lists), so the card stays short
  if (iconOnly) return (
    <Button variant="outline" aria-label={t('share.job')} title={t('share.job')} className="shrink-0 !border-whatsapp/50 !px-3 !text-whatsapp"
      onClick={() => shareWhatsApp(text, 'job_share', { from })}>
      {Icon.whatsapp}
    </Button>
  )
  return (
    <div className="mt-2 flex gap-2">
      <Button variant="outline" size={compact ? 'sm' : 'md'} block icon={Icon.whatsapp} className="!border-whatsapp/50 !text-whatsapp"
        onClick={() => shareWhatsApp(text, 'job_share', { from })}>
        {t('share.job')}
      </Button>
      {canShareSheet() && (
        <Button variant="outline" size={compact ? 'sm' : 'md'} aria-label={t('share.more')} title={t('share.more')} className="shrink-0 !px-3"
          onClick={() => void shareOther(text, 'job_share', { from })}>
          {Icon.share}
        </Button>
      )}
    </div>
  )
}

/** Loads /me/growth once per screen. */
export function useGrowth() {
  const [g, setG] = useState<Growth | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { myGrowth().then(setG).catch(() => setError(true)) }, [])
  return { g, error }
}

export const boosted = (g: Growth | null) => !!g?.boost_until && new Date(g.boost_until) > new Date()

export function inviteText(code: string, lang: string, role: string | null | undefined) {
  const link = refLink(code)
  if (lang === 'en') {
    return role === 'owner'
      ? `I find drivers on ${brand.name}: drivers near you, call them directly, no commission. Join free: ${link}`
      : `I find driving work on ${brand.name}: jobs near you, call the owner directly, no commission. Join free: ${link}`
  }
  return role === 'owner'
    ? `मैं ${brand.name} पर ड्राइवर ढूंढता हूँ। पास के ड्राइवर, सीधे कॉल, कोई कमीशन नहीं। आप भी मुफ़्त जुड़ें: ${link}`
    : `मैं ${brand.name} पर ड्राइवर का काम ढूंढता हूँ। पास के मालिकों का काम, सीधे कॉल, कोई कमीशन नहीं। आप भी मुफ़्त जुड़ें: ${link}`
}

/** Driver home: "8 owners saw your profile this week" + the invite / card shortcuts. */
export function GrowthCard() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { g, error } = useGrowth()
  const [card, setCard] = useState(false)
  if (error) return null
  if (!g) return <Skeleton className="h-36" />
  const isDriver = profile?.role === 'driver'
  return (
    <>
    {isDriver && <LookingCard due={!!g.looking_due} />}
    <Card>
      {isDriver && (
        <div className="flex items-center gap-3">
          <span className="grid size-avatar shrink-0 place-items-center rounded-full bg-warning-soft text-[length:var(--icon-size-md)] text-warning">{Icon.eye}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{g.views_week > 0 ? t('growth.viewsWeek', { n: g.views_week }) : t('growth.viewsNone')}</p>
            <p className="text-sm text-text-2">{g.views_week > 0 ? t('growth.viewsSub') : t('growth.viewsNoneSub')}</p>
            {g.views_total > 0 && (
              <Link to="/viewers" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary [&>svg]:size-icon-sm">
                <span className="premium-fill inline-grid size-4 place-items-center rounded-full [&>svg]:!size-2.5">{Icon.crown}</span>{t('rw.viewers.whoSaw')}{Icon.chevron}
              </Link>
            )}
          </div>
        </div>
      )}
      {boosted(g) && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {Icon.sparkle}{t('growth.topUntil', { date: new Date(g.boost_until!).toLocaleDateString(i18n.language === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' }) })}
        </p>
      )}
      <div className={`grid gap-2 ${isDriver ? 'mt-3 grid-cols-2' : ''}`}>
        {isDriver && <Button variant="outline" icon={Icon.idcard} onClick={() => { setCard(true); track('card_open', { from: 'home' }) }}>{t('card.mine')}</Button>}
        <Link to="/invite" onClick={() => track('invite_open', { from: 'home' })}
          className="flex min-h-ctl-md items-center justify-center gap-2 whitespace-nowrap rounded-md bg-action px-3 font-semibold text-on-action hover:brightness-95">
          {Icon.gift}{t('growth.invite')}
        </Link>
      </div>
      {isDriver && <DigitalCardDialog open={card} onClose={() => setCard(false)} code={g.ref_code} />}
    </Card>
    </>
  )
}

/** Opens the Digital Card from anywhere (loads the invite code first). */
export function DigitalCardLauncher({ onClose }: { onClose: () => void }) {
  const { g, error } = useGrowth()
  const { t } = useTranslation()
  const toast = useToast()
  useEffect(() => { if (error) { toast(t('error.generic'), { tone: 'error' }); onClose() } }, [error]) // eslint-disable-line react-hooks/exhaustive-deps
  return g ? <DigitalCardDialog open onClose={onClose} code={g.ref_code} /> : null
}

/** The driver's Digital Card: preview, put on WhatsApp Status, download. */
export function DigitalCardDialog({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const { t, i18n } = useTranslation()
  const { profile, driver } = useAuth()
  const toast = useToast()
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const lang = i18n.language
  useEffect(() => {
    if (!open || !profile) return
    let alive = true
    setFailed(false)
    const place = profile.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, lang) : ''
    // drawing code + QR library load only when the card is opened
    import('../lib/card-image').then(({ drawDriverCard }) => drawDriverCard({ name: profile.name || '', photoUrl: profile.photo_url, place, verified: profile.verified, driver, link: refLink(code), lang }))
      .then((b) => { if (!alive) return; setBlob(b); setUrl(URL.createObjectURL(b)) })
      .catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [open, profile, driver, code, lang])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const text = lang === 'en'
    ? `I am a driver looking for work. See my profile on ${brand.name}: ${refLink(code)}`
    : `मैं ड्राइवर हूँ, काम चाहिए। ${brand.name} पर मेरी प्रोफ़ाइल देखें: ${refLink(code)}`
  async function share() {
    if (!blob) return
    setBusy(true)
    const r = await shareImage(blob, `${brand.id}-card.png`, text)
    setBusy(false)
    if (r !== 'cancelled') track('card_share', { result: r })
    if (r === 'downloaded') toast(t('card.downloaded'), { tone: 'success' })
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('card.mine')} size="lg"
      footer={
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="whatsapp" icon={Icon.whatsapp} loading={busy} disabled={!blob} onClick={() => void share()}>{t('card.status')}</Button>
          <Button variant="outline" icon={Icon.whatsapp} onClick={() => shareWhatsApp(text, 'card_share', { as: 'link' })}>{t('card.sendLink')}</Button>
        </div>
      }>
      <p className="mb-3 text-sm text-text-2">{t('card.sub')}</p>
      {failed ? <p className="text-error">{t('error.generic')}</p> : url
        ? <img src={url} alt={t('card.mine')} className="mx-auto max-h-[56dvh] w-auto rounded-lg border border-border shadow-sm" />
        : <Skeleton className="mx-auto aspect-[9/16] h-[56dvh]" />}
      <p className="mt-3 flex items-center gap-1.5 text-sm text-text-2">{Icon.shield}{t('card.noNumber')}</p>
    </Dialog>
  )
}
