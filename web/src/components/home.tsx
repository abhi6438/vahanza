/** Pieces shared by the home / list screens: city name and contact buttons (search + filter: components/search.tsx). */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, contactDriver } from '../lib/api'
import { useAuth } from '../lib/auth'
import { placeName } from '../lib/catalog'
import { track } from '../lib/track'
import { Button, Icon } from './ui'

/** Name of the user's own city, for list titles ("Drivers near Rewa"). */
export function usePlaceName() {
  const { i18n } = useTranslation()
  const { profile } = useAuth()
  return profile?.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, i18n.language) : ''
}

/**
 * Vehicle filter + "verified only".
 * Phones: one row that scrolls sideways (thumb-friendly). Desktop: chips wrap, nothing hidden.
 */
/** Call / WhatsApp. The number is fetched only on tap (and recorded), never shown in a list. */
export function ContactButtons({ reveal, message, target, extra }: { reveal: (via: 'call' | 'whatsapp') => Promise<{ phone: string }>; message: string; target: 'driver' | 'owner'; /** more buttons in the same row (WhatsApp becomes an icon) */ extra?: ReactNode }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'' | 'call' | 'whatsapp'>('')
  const [error, setError] = useState('')
  async function go(via: 'call' | 'whatsapp') {
    setBusy(via)
    setError('')
    try {
      const { phone } = await reveal(via)
      track(via === 'call' ? 'tap_call' : 'tap_whatsapp', { target })
      if (via === 'call') window.location.href = `tel:+${phone}`
      else window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'too_many_contacts' ? t('err.too_many_contacts') : t('error.generic'))
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="mt-2.5">
      {extra ? (
        <div className="flex gap-2">
          <Button variant="success" icon={Icon.phone} className="min-w-0 flex-1 whitespace-nowrap" loading={busy === 'call'} disabled={busy !== ''} onClick={() => void go('call')}>{t('card.call')}</Button>
          <Button variant="whatsapp" aria-label="WhatsApp" title="WhatsApp" className="shrink-0 !px-3" loading={busy === 'whatsapp'} disabled={busy !== ''} onClick={() => void go('whatsapp')}>{Icon.whatsapp}</Button>
          {extra}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="success" icon={Icon.phone} loading={busy === 'call'} disabled={busy !== ''} onClick={() => void go('call')}>{t('card.call')}</Button>
          <Button variant="whatsapp" icon={Icon.whatsapp} loading={busy === 'whatsapp'} disabled={busy !== ''} onClick={() => void go('whatsapp')}>WhatsApp</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </div>
  )
}

/** Contact buttons for a driver card (used by owners). */
export function DriverContact({ driverId, name }: { driverId: string; name: string }) {
  const { i18n } = useTranslation()
  const msg = i18n.language === 'en' ? `Hello ${name}, I saw your profile on the app. Do you need driving work?` : `नमस्ते ${name} जी, ऐप पर आपकी प्रोफ़ाइल देखी। क्या आपको ड्राइवर का काम चाहिए?`
  return <ContactButtons target="driver" message={msg} reveal={(via) => contactDriver(driverId, via)} />
}
