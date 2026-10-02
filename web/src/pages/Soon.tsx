import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TabPage } from '../components/home'
import { Icon } from '../components/ui'
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
  return (
    <TabPage>
      <div className="bg-header px-4 pb-5 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">{t('soon')}</h1>
          <p className="text-sm opacity-90">{t('soonPage.sub')}</p>
        </div>
      </div>
      <main className="mx-auto grid max-w-md grid-cols-2 gap-3 px-4 py-4">
        {ITEMS.map((s) => (
          <div key={s.k} className="flex flex-col rounded-2xl border border-line bg-card p-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-ink">{Icon.sparkle}</span>
            <strong className="mt-2 leading-tight">{en ? s.n[1] : s.n[0]}</strong>
            <p className="mt-1 flex-1 text-sm text-muted">{en ? s.d[1] : s.d[0]}</p>
            <button type="button" aria-pressed={on.includes(s.k)} onClick={() => toggle(s.k)}
              className="mt-2 min-h-10 rounded-xl border-2 border-brand text-sm font-bold text-brand aria-pressed:bg-brand aria-pressed:text-white">
              {on.includes(s.k) ? t('soonPage.on') : t('soonPage.notify')}
            </button>
          </div>
        ))}
      </main>
    </TabPage>
  )
}
