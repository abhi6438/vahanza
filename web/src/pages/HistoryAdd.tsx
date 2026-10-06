import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { SuccessArt } from '../assets/illustrations'
import { Chips, Label, OptionList, TextField, VehicleGrid } from '../components/form'
import { HistoryItem, MonthPicker, OwnerPicker } from '../components/history'
import { CityPicker } from '../components/places'
import { Wizard } from '../components/Wizard'
import { Button, Icon, Note, scrollToTop } from '../components/ui'
import { ApiError, history, type HistoryEntry, type HistoryIn, type HistorySent, type OwnerHit } from '../lib/api'
import { useAuth } from '../lib/auth'
import { AREA, placeName, VEHICLES, WHEELED, WHEELS, WORK, type VehicleKey } from '../lib/catalog'
import { askText, waLink } from '../lib/history'
import { track, trackScreen } from '../lib/track'

type Step = 'owner' | 'other' | 'vehicle' | 'from' | 'till' | 'work' | 'review' | 'done'

/**
 * "काम का अनुभव जोड़ें": one question per screen, big buttons, few words (many drivers read little).
 *   owner → (not on the app: name, city, number) → vehicle → from → till → kind of work → check & send
 * Sending asks the owner to confirm: on the app by bell / push, otherwise by a WhatsApp link.
 */
export default function HistoryAdd() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const { id } = useParams()
  const { profile } = useAuth()
  const [step, setStep] = useState<Step>('owner')
  const [owner, setOwner] = useState<OwnerHit | null>(null)
  const [other, setOther] = useState({ name: '', firm: '', place: '', phone: '' })
  const [isOther, setIsOther] = useState(false)
  const [vehicle, setVehicle] = useState<VehicleKey | null>(null)
  const [wheels, setWheels] = useState<number | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [till, setTill] = useState<string | null>(null)
  const [still, setStill] = useState(false)
  const [work, setWork] = useState<'full' | 'day' | 'trip' | null>(null)
  const [area, setArea] = useState<'local' | 'dist' | 'state' | 'india' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<HistorySent | null>(null)
  const [pickCity, setPickCity] = useState(false)

  useEffect(() => { trackScreen(id ? 'history_edit' : 'history_add') }, [id])
  // edit: load what was typed before
  useEffect(() => {
    if (!id) return
    history.mine().then((r) => {
      const e = r.items.find((x) => x.id === id)
      if (!e) return
      if (e.owner_on_app && e.owner_id) setOwner({ id: e.owner_id, name: e.owner_name, firm_name: e.firm_name, district: e.district, state: e.state, verified: e.owner_verified })
      else {
        setIsOther(true)
        setOther({ name: e.typed_owner_name || '', firm: e.typed_firm_name || '', place: e.district && e.state ? `${e.district}, ${e.state}` : '', phone: e.owner_phone || '' })
      }
      setVehicle(e.vehicle as VehicleKey); setWheels(e.wheels)
      setFrom(e.start_month.slice(0, 7)); setTill(e.end_month ? e.end_month.slice(0, 7) : null); setStill(!e.end_month)
      setWork(e.work_type); setArea(e.area)
    }).catch(() => {})
  }, [id])

  const reset = () => {
    setOwner(null); setIsOther(false); setOther({ name: '', firm: '', place: '', phone: '' }); setVehicle(null); setWheels(null)
    setFrom(null); setTill(null); setStill(false); setWork(null); setArea(null); setSent(null)
    if (id) nav('/history/new', { replace: true })
    go('owner')
  }
  const order: Step[] = ['owner', ...(isOther ? (['other'] as Step[]) : []), 'vehicle', 'from', 'till', 'work', 'review']
  const idx = Math.max(0, order.indexOf(step))
  const go = (s: Step) => { setError(''); setStep(s); scrollToTop() }
  const next = () => go(order[idx + 1])
  const back = () => (idx === 0 ? nav(-1) : go(order[idx - 1]))

  const body = (): HistoryIn => ({
    owner_id: !isOther ? owner?.id : null,
    owner_name: isOther ? other.name.trim() || null : null,
    firm_name: isOther ? other.firm.trim() || null : null,
    owner_place: isOther ? other.place || null : null,
    owner_phone: isOther ? other.phone.replace(/\D/g, '') || null : null,
    vehicle: vehicle!, wheels: WHEELED.includes(vehicle!) ? wheels : null,
    start_month: from!, end_month: still ? null : till, work_type: work, area,
  })

  async function send() {
    setBusy(true)
    setError('')
    try {
      const r = id ? await history.edit(id, body()) : await history.add(body())
      setSent(r)
      track(id ? 'history_edit' : 'history_add', { sent: r.sent, on_app: !isOther })
      go('done')
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setError(t(`hist.err.${code}`, { defaultValue: t('error.generic') }))
    } finally {
      setBusy(false)
    }
  }

  const phoneOk = !other.phone || /^[6-9]\d{9}$/.test(other.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))
  const preview: HistoryEntry | null = vehicle && from ? {
    id: 'preview', owner_on_app: !isOther, owner_name: isOther ? other.name : owner?.name || null, firm_name: isOther ? other.firm || null : owner?.firm_name || null,
    district: isOther ? other.place.split(',')[0] || null : owner?.district || null, state: isOther ? other.place.split(',')[1]?.trim() || null : owner?.state || null,
    owner_verified: !isOther && !!owner?.verified, vehicle, wheels, start_month: `${from}-01`, end_month: still || !till ? null : `${till}-01`,
    work_type: work, area, source: 'driver', status: 'pending', owner_stars: null, owner_tags: [], rehire: null,
  } : null

  if (step === 'done' && sent) return <Done sent={sent} entry={preview!} firstName={(profile?.name || '').split(' ')[0]} onAnother={reset} />

  const common = { step: idx, total: order.length, onBack: back, error }
  switch (step) {
    case 'owner':
      return (
        <Wizard {...common} title={t('hist.q.owner')} sub={t('hist.q.ownerSub')} canNext={!!owner} onNext={next}>
          <OwnerPicker value={owner} onPick={(o) => { setOwner(o); setIsOther(false) }} onOther={() => { setOwner(null); setIsOther(true); setStep('other'); scrollToTop() }} />
        </Wizard>
      )
    case 'other':
      return (
        <Wizard {...common} title={t('hist.q.other')} sub={t('hist.q.otherSub')} canNext={(!!other.name.trim() || !!other.firm.trim()) && phoneOk} onNext={next}>
          <Label first>{t('hist.f.ownerName')}</Label>
          <TextField value={other.name} onChange={(v) => setOther({ ...other, name: v })} label={t('hist.f.ownerName')} placeholder={t('hist.f.ownerNamePh')} big voice maxLength={60} />
          <Label optional>{t('hist.f.firm')}</Label>
          <TextField value={other.firm} onChange={(v) => setOther({ ...other, firm: v })} label={t('hist.f.firm')} placeholder={t('hist.f.firmPh')} voice maxLength={80} />
          <Label hint={t('hist.f.phoneHint')}>{t('hist.f.phone')}</Label>
          <TextField value={other.phone} onChange={(v) => setOther({ ...other, phone: v.replace(/[^\d+ ]/g, '') })} label={t('hist.f.phone')} placeholder="98XXXXXXXX" inputMode="tel" big maxLength={14} />
          {!phoneOk && <p className="mt-1 text-sm text-error">{t('hist.err.bad_phone')}</p>}
          <Label optional>{t('hist.f.city')}</Label>
          {other.place && !pickCity
            ? <Button variant="secondary" icon={Icon.pin} onClick={() => setPickCity(true)}>{placeName(other.place, lang)} · {t('hist.change')}</Button>
            : <CityPicker multi={false} value={[]} onToggle={(v) => { setOther({ ...other, place: v }); setPickCity(false) }} />}
        </Wizard>
      )
    case 'vehicle':
      return (
        <Wizard {...common} title={t('hist.q.vehicle')} canNext={!!vehicle} onNext={next}>
          <VehicleGrid options={VEHICLES} value={vehicle ? [vehicle] : []} onPick={(k) => setVehicle(k)} />
          {vehicle && WHEELED.includes(vehicle) && (
            <>
              <Label optional>{t('hist.q.wheels')}</Label>
              <div className="flex flex-wrap gap-2">
                {WHEELS.map((w) => (
                  <button key={w} type="button" aria-pressed={wheels === w} onClick={() => setWheels(wheels === w ? null : w)}
                    className="press min-h-ctl-lg min-w-[4.5rem] rounded-md border border-border bg-surface px-3 text-lg font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary">{w}</button>
                ))}
              </div>
            </>
          )}
        </Wizard>
      )
    case 'from':
      return (
        <Wizard {...common} title={t('hist.q.from')} sub={t('hist.q.fromSub')} canNext={!!from} onNext={next}>
          <MonthPicker value={from} onChange={(v) => { setFrom(v); if (till && till < v) setTill(null) }} />
        </Wizard>
      )
    case 'till':
      return (
        <Wizard {...common} title={t('hist.q.till')} canNext={still || !!till} onNext={next}>
          <MonthPicker value={till} onChange={(v) => { setTill(v); setStill(false) }} min={from} allowNow nowOn={still} onNow={() => setStill(!still)} />
        </Wizard>
      )
    case 'work':
      return (
        <Wizard {...common} title={t('hist.q.work')} sub={t('hist.q.workSub')} onNext={next} nextLabel={work || area ? t('next') : t('hist.skip')}>
          <OptionList options={WORK} value={work} onChange={(v) => setWork(work === v ? null : v)} />
          <Label optional>{t('hist.q.area')}</Label>
          <Chips options={AREA} value={area} onChange={(v) => setArea(area === v ? null : v)} />
        </Wizard>
      )
    default:
      return (
        <Wizard {...common} title={t('hist.q.review')} sub={isOther && !other.phone ? t('hist.q.reviewNoPhone') : t('hist.q.reviewSub')}
          footer={<Button size="lg" block loading={busy} icon={Icon.check} onClick={() => void send()}>{t('hist.send')}</Button>}>
          {preview && <HistoryItem e={preview} />}
          <div className="mt-4"><Note icon={Icon.lock}>{t('hist.privacy')}</Note></div>
        </Wizard>
      )
  }
}

function Done({ sent, entry, firstName, onAnother }: { sent: HistorySent; entry: HistoryEntry; firstName: string; onAnother: () => void }) {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const wa = sent.sent === 'link' && sent.token && sent.phone ? waLink(sent.phone, askText(firstName, entry, sent.token, i18n.language)) : null
  return (
    <Wizard step={0} total={1} title={t('hist.done.title')}
      footer={
        <div className="grid gap-2">
          {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={() => track('history_whatsapp')} className="press btn-success inline-flex min-h-ctl-lg items-center justify-center gap-2 rounded-md px-5 font-semibold text-on-success">{Icon.message}{t('hist.done.whatsapp')}</a>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" icon={Icon.plus} onClick={onAnother}>{t('hist.done.another')}</Button>
            <Button variant={wa ? 'secondary' : 'primary'} size="lg" onClick={() => nav('/history', { replace: true })}>{t('hist.done.finish')}</Button>
          </div>
        </div>
      }>
      <div className="text-center">
        <div className="mx-auto w-36"><SuccessArt /></div>
        <p className="mt-2 text-lg font-semibold">{t(`hist.done.${sent.sent}`)}</p>
        <p className="mt-1 text-text-2">{t(`hist.done.${sent.sent}Sub`)}</p>
      </div>
    </Wizard>
  )
}
