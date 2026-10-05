import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { geo, type PlaceHit } from '../lib/api'
import { placeName, searchCurated, stateName, type PlaceOption } from '../lib/catalog'
import { track } from '../lib/track'
import { Note, TextField } from './form'

export interface PlaceValue { district: string; state: string; pincode?: string | null; lat?: number | null; lng?: number | null }

const pinIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
    <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" />
  </svg>
)

export function placeText(p: PlaceValue, lang: string) {
  const name = placeName(`${p.district}, ${p.state}`, lang)
  return `${name}, ${stateName(p.state, lang)}${p.pincode ? ` · ${p.pincode}` : ''}`
}

/** City search: curated transport cities work offline; more districts come from the API. */
function useCitySearch(q: string, preferState?: string | null) {
  const [hits, setHits] = useState<PlaceOption[]>(() => searchCurated(q, preferState))
  useEffect(() => {
    const local = searchCurated(q, preferState)
    setHits(local)
    if (q.trim().length < 2) return
    const id = window.setTimeout(() => {
      geo.places(q.trim())
        .then((remote) => {
          const seen = new Set(local.map((x) => x.value))
          setHits([...local, ...remote.filter((r: PlaceHit) => !seen.has(r.value))].slice(0, 16))
        })
        .catch(() => {})
    }, 300)
    return () => window.clearTimeout(id)
  }, [q, preferState])
  return hits
}

const cityBtn = 'min-h-ctl-lg rounded-md border border-border bg-surface px-2 py-2 text-base font-semibold leading-tight aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary'

/** Pick one or more cities (e.g. where the vehicles run from). */
export function CityPicker({ value, onToggle, preferState, multi = true }: {
  value: string[]
  onToggle: (value: string, opt: PlaceOption) => void
  preferState?: string | null
  multi?: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [q, setQ] = useState('')
  const hits = useCitySearch(q, preferState)
  const shown = q ? hits : hits.filter((h) => !value.includes(h.value))
  return (
    <div>
      {multi && value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((v) => (
            <button key={v} type="button" onClick={() => onToggle(v, { value: v, en: v.split(',')[0], hi: null, state: '' })}
              className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 font-semibold text-white" aria-label={`${placeName(v, lang)} ${t('remove')}`}>
              {placeName(v, lang)} <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          ))}
        </div>
      )}
      <TextField value={q} onChange={setQ} label={t('place.search')} placeholder={t('place.searchPh')} voice />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {shown.map((h) => (
          <button key={h.value} type="button" className={cityBtn} aria-pressed={value.includes(h.value)} onClick={() => onToggle(h.value, h)}>
            {lang === 'en' ? h.en : h.hi || h.en}
            <span className="block text-xs font-normal text-text-2">{stateName(h.state, lang)}</span>
          </button>
        ))}
      </div>
      {q && shown.length === 0 && <p className="mt-3 text-text-2">{t('place.none')}</p>}
    </div>
  )
}

/** "Where do you live?" — GPS, pincode, or pick a city. */
export function PlaceField({ value, onChange }: { value: PlaceValue | null; onChange: (p: PlaceValue | null) => void }) {
  const { t, i18n } = useTranslation()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState<'' | 'gps' | 'pin'>('')
  const [msg, setMsg] = useState('')
  const [chooseCity, setChooseCity] = useState(false)
  const lastPin = useRef('')

  const fromHit = (h: PlaceHit, extra?: Partial<PlaceValue>): PlaceValue => {
    const [district] = h.value.split(',')
    return { district: district.trim(), state: h.state, pincode: h.pincode ?? null, lat: h.lat ?? null, lng: h.lng ?? null, ...extra }
  }

  async function lookupPin(p: string) {
    if (p === lastPin.current) return
    lastPin.current = p
    setBusy('pin')
    setMsg('')
    try {
      onChange(fromHit(await geo.pincode(p)))
      track('place_set', { via: 'pincode' })
    } catch {
      setMsg(t('place.pinNotFound'))
      setChooseCity(true)
    } finally {
      setBusy('')
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      setMsg(t('place.gpsFail'))
      return
    }
    setBusy('gps')
    setMsg('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const hit = await geo.reverse(lat, lng)
          onChange(fromHit(hit, { lat, lng }))
          track('place_set', { via: 'gps' })
        } catch {
          setMsg(t('place.gpsNoPlace'))
          setChooseCity(true)
        } finally {
          setBusy('')
        }
      },
      () => {
        setBusy('')
        setMsg(t('place.gpsFail'))
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    )
  }

  if (value) {
    return (
      <div className="flex min-h-ctl-lg items-center gap-2.5 rounded-lg border-2 border-brand bg-brand-soft px-3.5 py-2.5">
        <span className="text-brand">{pinIcon}</span>
        <span className="flex-1 font-semibold">{placeText(value, i18n.language)}</span>
        <button type="button" className="font-bold text-brand" onClick={() => { onChange(null); setPin(''); lastPin.current = ''; setChooseCity(false) }}>
          {t('change')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={useGps} disabled={busy !== ''}
        className="flex min-h-ctl-lg items-center justify-center gap-2 rounded-lg border-2 border-brand bg-surface px-4 text-base font-bold text-brand disabled:opacity-60">
        {pinIcon}
        {busy === 'gps' ? t('place.finding') : t('place.gps')}
      </button>
      <div className="flex items-center gap-3 text-sm text-text-2"><span className="h-px flex-1 bg-line" />{t('or')}<span className="h-px flex-1 bg-line" /></div>
      <TextField
        value={pin}
        inputMode="numeric"
        maxLength={6}
        label={t('place.pin')}
        placeholder={t('place.pinPh')}
        onChange={(v) => {
          const d = v.replace(/\D/g, '').slice(0, 6)
          setPin(d)
          if (d.length === 6 && /^[1-9]/.test(d)) void lookupPin(d)
        }}
      />
      {busy === 'pin' && <p className="text-text-2">{t('place.finding')}</p>}
      {msg && <Note tone="warn">{msg}</Note>}
      {chooseCity ? (
        <CityPicker
          multi={false}
          value={[]}
          onToggle={(_, h) => {
            onChange({ district: h.en, state: h.state, pincode: pin.length === 6 ? pin : null })
            track('place_set', { via: 'city' })
          }}
        />
      ) : (
        <button type="button" className="self-start font-bold text-brand underline" onClick={() => setChooseCity(true)}>{t('place.pickCity')}</button>
      )}
    </div>
  )
}
