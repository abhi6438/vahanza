/** Pieces shared by the home / list screens: city name, vehicle filter, contact buttons. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, contactDriver } from '../lib/api'
import { useAuth } from '../lib/auth'
import { pick, placeName, VEHICLES } from '../lib/catalog'
import { track } from '../lib/track'
import { VehicleArt } from './form'
import { Button, Chip, Icon } from './ui'

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
export function VehicleFilter({ value, onChange, verified, onVerified }: { value: string | null; onChange: (v: string | null) => void; verified: boolean; onVerified: (v: boolean) => void }) {
  const { t, i18n } = useTranslation()
  return (
    <div role="group" aria-label={t('home.filter')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:-mx-6 md:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      <Chip selected={verified} onClick={() => onVerified(!verified)} icon={verified ? undefined : <span className="text-success [&>svg]:size-icon-sm">{Icon.verified}</span>}>
        {t('home.verifiedOnly')}
      </Chip>
      <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
      <Chip selected={!value} onClick={() => onChange(null)}>{t('home.allVehicles')}</Chip>
      {VEHICLES.map((v) => (
        <Chip key={v.key} selected={value === v.key} onClick={() => onChange(value === v.key ? null : v.key)} icon={<VehicleArt kind={v.key} className="h-4 w-7" />}>
          {pick(v.label, i18n.language)}
        </Chip>
      ))}
    </div>
  )
}

/** Call / WhatsApp. The number is fetched only on tap (and recorded), never shown in a list. */
export function ContactButtons({ reveal, message, target }: { reveal: (via: 'call' | 'whatsapp') => Promise<{ phone: string }>; message: string; target: 'driver' | 'owner' }) {
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
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="success" icon={Icon.phone} loading={busy === 'call'} disabled={busy !== ''} onClick={() => void go('call')}>{t('card.call')}</Button>
        <Button variant="whatsapp" icon={Icon.whatsapp} loading={busy === 'whatsapp'} disabled={busy !== ''} onClick={() => void go('whatsapp')}>WhatsApp</Button>
      </div>
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
