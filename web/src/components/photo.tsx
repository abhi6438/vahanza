import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { photoSrc, uploadPhoto } from '../lib/api'
import { useAuth } from '../lib/auth'
import { track } from '../lib/track'

const userIcon = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" />
  </svg>
)

/** Shrinks a camera photo to max 512 px JPEG (~50–120 KB) so it uploads fast on 2G/3G. */
export async function shrinkImage(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82))
}

export function initials(name: string | null | undefined) {
  const w = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return /^[A-Za-z]/.test(w[0]) ? w.map((x) => x[0]).join('').slice(0, 2).toUpperCase() : Array.from(w[0])[0]
}

export function Avatar({ url, name, size = 56 }: { url?: string | null; name?: string | null; size?: number }) {
  const src = photoSrc(url)
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft font-display font-bold text-brand" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}

/** Hook used by the setup screen and the home reminder. */
export function usePhotoUpload() {
  const { setPhotoUrl } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file: File | undefined, from: string) {
    if (!file) return false
    setBusy(true)
    setError('')
    try {
      const { photo_url } = await uploadPhoto(await shrinkImage(file))
      setPhotoUrl(photo_url)
      track('photo_added', { from })
      return true
    } catch {
      setError('photo.fail')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, upload }
}

/** Round photo button on the first setup step. Optional. */
export function PhotoPicker({ owner }: { owner?: boolean }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { busy, error, upload } = usePhotoUpload()
  const src = photoSrc(profile?.photo_url)
  return (
    <div className="flex flex-col items-center">
      <label className="relative grid h-28 w-28 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-brand bg-brand-soft text-brand">
        {src ? (
          <img src={src} alt={t('photo.yours')} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-sm font-bold">
            {userIcon}
            {owner ? t('photo.addLogo') : t('photo.add')}
          </span>
        )}
        {busy && <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-bold text-white">{t('photo.uploading')}</span>}
        <input type="file" accept="image/*" className="sr-only" aria-label={t('photo.add')} onChange={(e) => void upload(e.target.files?.[0], 'setup')} />
      </label>
      <p className="mt-2 max-w-xs text-center text-sm text-muted">
        {error ? <span className="text-danger">{t(error)}</span> : src ? t('photo.tapToChange') : owner ? t('photo.whyOwner') : t('photo.whyDriver')}
      </p>
    </div>
  )
}

/** Reminder card on home while there is no photo. Hidden for 3 days after "Later". */
export function PhotoNudge({ role, onLater }: { role: 'driver' | 'owner'; onLater: () => void }) {
  const { t } = useTranslation()
  const { busy, error, upload } = usePhotoUpload()
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent bg-accent-soft p-3.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-card text-accent-ink">{userIcon}</span>
      <div className="flex-1">
        <strong className="block">{t('photo.nudgeTitle')}</strong>
        <span className="text-sm">{error ? t(error) : role === 'driver' ? t('photo.whyDriver') : t('photo.whyOwner')}</span>
        <button type="button" onClick={onLater} className="mt-1 block text-sm font-semibold text-accent-ink underline">{t('later')}</button>
      </div>
      <label className="cursor-pointer rounded-xl bg-accent px-4 py-2.5 font-bold text-accent-ink">
        {busy ? '…' : t('photo.addShort')}
        <input type="file" accept="image/*" className="sr-only" aria-label={t('photo.add')} onChange={(e) => void upload(e.target.files?.[0], 'nudge')} />
      </label>
    </div>
  )
}
