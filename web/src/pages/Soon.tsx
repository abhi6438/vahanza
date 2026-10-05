import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MechanicArt } from '../assets/illustrations'
import { AppShell } from '../components/shell'
import { Badge, Button, Icon } from '../components/ui'
import { storage } from '../lib/storage'
import { track, trackScreen } from '../lib/track'

const ITEMS: { k: string; n: [string, string]; d: [string, string] }[] = [
  { k: 'mech', n: ['मिस्त्री और SOS', 'Mechanic + SOS'], d: ['पास का अच्छा मिस्त्री, टोइंग', 'Good mechanic nearby, towing'] },
  { k: 'load', n: ['माल भाड़ा', 'Load booking'], d: ['माल भेजने वालों से सीधे भाड़ा', 'Get loads directly from senders'] },
  { k: 'ret', n: ['वापसी भाड़ा', 'Return load'], d: ['खाली वापसी नहीं, रास्ते का माल', 'No empty trip back home'] },
  { k: 'rent', n: ['गाड़ी किराये पर', 'Vehicle on rent'], d: ['जेसीबी, ट्रैक्टर, क्रेन घंटे/दिन पर', 'JCB, tractor, crane by hour/day'] },
  { k: 'bus', n: ['बस / टैक्सी बुकिंग', 'Bus / taxi booking'], d: ['शादी, यात्रा, तीर्थ के लिए', 'For weddings, tours, pilgrimage'] },
  { k: 'sell', n: ['पुरानी गाड़ी खरीदें/बेचें', 'Buy / sell used'], d: ['फ़ोटो और दाम के साथ', 'With photos and price'] },
  { k: 'ins', n: ['बीमा और लोन', 'Insurance + loan'], d: ['गाड़ी बीमा, EMI, दुर्घटना कवर', 'Vehicle insurance, EMI, cover'] },
  { k: 'lic', n: ['लाइसेंस और ट्रेनिंग', 'Licence + training'], d: ['HMV ट्रेनिंग, रिन्यूअल', 'HMV training, renewal'] },
  { k: 'route', n: ['रास्ते की मदद', 'Route help'], d: ['ढाबा, पार्किंग, पेट्रोल पंप', 'Dhabas, parking, fuel pumps'] },
  { k: 'tag', n: ['चालान और FASTag', 'Challan + FASTag'], d: ['चालान देखें, FASTag रिचार्ज', 'Check challans, recharge'] },
]

/** Coming-soon features. "Notify me" taps are counted, so the most wanted feature is built first. */
export default function Soon() {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  const [on, setOn] = useState<string[]>([])
  useEffect(() => {
    trackScreen('soon')
    void storage.getItem('soon-notify').then((v) => v && setOn(JSON.parse(v)))
  }, [])
  function toggle(k: string) {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k]
    setOn(next)
    void storage.setItem('soon-notify', JSON.stringify(next))
    track(on.includes(k) ? 'soon_notify_off' : 'soon_notify', { feature: k })
  }
  const [first, ...rest] = ITEMS
  const btn = (k: string) => (
    <Button variant={on.includes(k) ? 'primary' : 'outline'} size="sm" block aria-pressed={on.includes(k)} icon={on.includes(k) ? Icon.check : Icon.bell} onClick={() => toggle(k)} className="mt-3">
      {on.includes(k) ? t('soonPage.on') : t('soonPage.notify')}
    </Button>
  )
  return (
    <AppShell title={t('tabs.mechanic')} sub={t('soonPage.sub')} width="default">
      <p className="mb-4 text-text-2 lg:hidden">{t('soonPage.sub')}</p>
      <section className="anim-rise mb-5 flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm md:flex-row md:items-center">
        <span className="w-32 shrink-0 self-center md:w-36"><MechanicArt /></span>
        <div className="min-w-0 flex-1">
          <Badge tone="action">{t('soon')}</Badge>
          <p className="mt-2 font-display text-xl font-semibold tracking-[-0.01em]">{en ? first.n[1] : first.n[0]}</p>
          <p className="text-text-2">{en ? first.d[1] : first.d[0]}</p>
        </div>
        <div className="md:w-56">{btn(first.k)}</div>
      </section>
      <h2 className="mb-3 font-display text-lg font-semibold">{t('soonPage.more')}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {rest.map((s) => (
          <div key={s.k} className="card-lift flex flex-col rounded-lg border border-border bg-surface p-card shadow-sm">
            <span className="icon-tile size-10 bg-primary-soft text-primary">{Icon.sparkle}</span>
            <strong className="mt-2 font-semibold leading-snug">{en ? s.n[1] : s.n[0]}</strong>
            <p className="mt-1 flex-1 text-sm text-text-2">{en ? s.d[1] : s.d[0]}</p>
            {btn(s.k)}
          </div>
        ))}
      </div>
    </AppShell>
  )
}
