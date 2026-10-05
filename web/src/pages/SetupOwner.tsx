import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FleetRow } from '../components/cards'
import { Label, Note, Stepper, TextField, VehicleArt, VehicleGrid } from '../components/form'
import { PhotoPicker } from '../components/photo'
import { CityPicker, PlaceField, type PlaceValue } from '../components/places'
import { BigButton } from '../components/ui'
import { Wizard } from '../components/Wizard'
import { ApiError, saveProfile, type FleetGroup } from '../lib/api'
import { useAuth } from '../lib/auth'
import { label, placeName, VEHICLES, WHEELED, WHEELS, type VehicleKey } from '../lib/catalog'
import { track, trackScreen } from '../lib/track'

interface Form {
  name: string
  business_name: string
  place: PlaceValue | null
  fleet: FleetGroup[]
}
/** Vehicle being added: 0 type → 1 wheels → 2 how many → 3 base cities. */
interface Adder { open: boolean; sub: 0 | 1 | 2 | 3; editIndex: number | null; g: FleetGroup }

const OWNER_VEHICLES = VEHICLES.filter((v) => v.key !== 'auto')
const blank = (): FleetGroup => ({ vehicle_type: 'truck', wheels: null, vehicle_count: 1, base_cities: [] })

export default function SetupOwner() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { profile, fleet: savedFleet, applyMe } = useAuth()
  // first: name + place only · complete: vehicles (from the home card) · edit: both
  const [mode] = useState<'first' | 'complete' | 'edit'>(() => (!profile?.setup_done ? 'first' : params.has('edit') ? 'edit' : 'complete'))
  const steps = mode === 'first' ? ['about'] : mode === 'complete' ? ['fleet'] : ['about', 'fleet']
  const [step, setStep] = useState(mode === 'complete' ? 1 : 0)   // 0 = about, 1 = fleet
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState<Form>(() => ({
    name: profile?.name || '',
    business_name: profile?.business_name || '',
    place: profile?.district && profile.state ? { district: profile.district, state: profile.state, pincode: profile.pincode } : null,
    fleet: savedFleet,
  }))
  const [a, setA] = useState<Adder>({ open: savedFleet.length === 0, sub: 0, editIndex: null, g: blank() })
  const shown = steps.indexOf(step === 0 ? 'about' : 'fleet')
  const toHome = () => nav('/home', { replace: true })

  useEffect(() => {
    trackScreen(step === 0 ? `owner_${mode}_about` : a.open ? `owner_${mode}_fleet_add_${a.sub}` : `owner_${mode}_fleet`)
    window.scrollTo(0, 0)
  }, [step, a.open, a.sub, mode])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }))
  const g = a.g
  const setG = (patch: Partial<FleetGroup>) => setA((x) => ({ ...x, g: { ...x.g, ...patch } }))
  const total = f.fleet.reduce((s, x) => s + x.vehicle_count, 0)

  function openAdder(editIndex: number | null = null) {
    setA({ open: true, sub: 0, editIndex, g: editIndex == null ? blank() : { ...f.fleet[editIndex] } })
  }
  function commitGroup(withCities = true) {
    const group = { ...g, base_cities: withCities ? g.base_cities : [] }
    const list = [...f.fleet]
    if (a.editIndex == null) list.push(group)
    else list[a.editIndex] = group
    set('fleet', list)
    setA({ open: false, sub: 0, editIndex: null, g: blank() })
    track('fleet_group_added', { vehicle: group.vehicle_type, count: group.vehicle_count, cities: group.base_cities.length })
  }
  function adderBack() {
    if (a.sub === 0) return f.fleet.length ? setA((x) => ({ ...x, open: false })) : mode === 'complete' ? toHome() : setStep(0)
    const prev = a.sub === 2 && !WHEELED.includes(g.vehicle_type as never) ? 0 : a.sub - 1
    setA((x) => ({ ...x, sub: prev as Adder['sub'] }))
  }

  async function save(withFleet: boolean): Promise<boolean> {
    if (!f.place) return false
    setBusy(true)
    setError('')
    try {
      const me = await saveProfile({
        name: f.name, business_name: f.business_name || null, place: f.place,
        fleet: withFleet ? f.fleet : undefined, finish: true,
      })
      applyMe(me)
      return true
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      if (code?.startsWith('name_')) {
        setError(t(`err.${code}`))
        setStep(0)
      } else if (code === 'fleet_in_use') setError(t('err.fleet_in_use'))
      else setError(t('error.generic'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function aboutNext() {
    if (!(await save(false))) return
    if (mode === 'first') {
      track('signup_profile_basic', { role: 'owner' })
      return toHome()
    }
    setStep(1)
  }

  async function fleetDone() {
    if (!(await save(true))) return
    track(mode === 'edit' ? 'profile_updated' : 'fleet_saved', { role: 'owner', vehicles: total, groups: f.fleet.length })
    const next = params.get('next')
    if (next && next.startsWith('/')) nav(next, { replace: true })
    else toHome()
  }

  // ---- step 1: about you ----
  if (step === 0) {
    return (
      <Wizard step={shown} total={steps.length} title={t('setup.about')} sub={mode === 'first' ? t('setup.firstSubOwner') : undefined}
        onBack={mode === 'edit' ? toHome : undefined} busy={busy} nextLabel={mode === 'first' ? t('setup.start') : undefined}
        canNext={f.name.trim().length > 1 && !!f.place} onNext={() => void aboutNext()} error={error}>
        <PhotoPicker owner />
        <Label>{t('setup.yourName')}</Label>
        <TextField big value={f.name} onChange={(v) => set('name', v)} label={t('setup.yourName')} placeholder={t('setup.o.namePh')} maxLength={60} voice />
        <Label optional>{t('setup.o.business')}</Label>
        <TextField value={f.business_name} onChange={(v) => set('business_name', v)} label={t('setup.o.business')} placeholder={t('setup.o.businessPh')} maxLength={80} voice />
        <Label>{t('setup.o.where')}</Label>
        <PlaceField value={f.place} onChange={(p) => set('place', p)} />
      </Wizard>
    )
  }

  // ---- step 2: fleet list ----
  if (!a.open) {
    return (
      <Wizard step={shown} total={steps.length} title={t('setup.o.fleet')} sub={t('setup.o.fleetSub')} onBack={mode === 'edit' ? () => setStep(0) : toHome}
        canNext={f.fleet.length > 0} onNext={() => void fleetDone()} busy={busy} error={error} nextLabel={t('save')}>
        <div className="flex flex-col gap-2.5">
          {f.fleet.map((x, i) => (
            <FleetRow key={x.id || i} g={x} onEdit={() => openAdder(i)} onRemove={() => set('fleet', f.fleet.filter((_, j) => j !== i))} />
          ))}
        </div>
        <p className="mb-4 mt-3 text-text-2">{t('setup.o.total', { n: total })}</p>
        <BigButton variant="secondary" onClick={() => openAdder()}>+ {t('setup.o.addMore')}</BigButton>
      </Wizard>
    )
  }

  // ---- step 2: adding one kind of vehicle ----
  const vname = label(VEHICLES, g.vehicle_type as never, lang)
  const summary = [
    a.sub > 0 && (a.sub > 2 ? `${g.vehicle_count} ${vname}` : vname),
    a.sub > 1 && g.wheels && t('wheels', { n: g.wheels }),
    a.sub === 3 && g.base_cities.length > 0 && t('fleet.from', { cities: g.base_cities.map((c) => placeName(c, lang)).join(', ') }),
  ].filter(Boolean)
  const adderTitles = [t('setup.o.which'), t('setup.o.wheels'), t('setup.o.count'), t('setup.o.bases')]
  const adderSubs = [f.fleet.length ? undefined : t('setup.o.oneKind'), undefined, undefined, t('setup.o.basesSub')]
  const footer =
    a.sub === 2 ? <BigButton onClick={() => setA((x) => ({ ...x, sub: 3 }))}>{t('next')}</BigButton>
    : a.sub === 3 ? <BigButton disabled={!g.base_cities.length} onClick={() => commitGroup()}>+ {a.editIndex == null ? t('setup.o.addToList') : t('save')}</BigButton>
    : f.fleet.length ? <BigButton variant="secondary" onClick={() => setA((x) => ({ ...x, open: false }))}>{t('cancel')}</BigButton>
    : <p className="py-2 text-center text-text-2">{t('setup.o.pickAbove')}</p>

  return (
    <Wizard step={shown} total={steps.length} title={adderTitles[a.sub]} sub={adderSubs[a.sub]} onBack={adderBack} footer={footer}>
      {summary.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-brand-soft p-3">
          <VehicleArt kind={g.vehicle_type} className="h-9 w-14" />
          <span className="font-bold">{summary.join(' · ')}</span>
        </div>
      )}
      {a.sub === 0 && (
        <VehicleGrid options={OWNER_VEHICLES} value={a.editIndex != null ? [g.vehicle_type as VehicleKey] : []} onPick={(k) => {
          const wheeled = WHEELED.includes(k)
          setA((x) => ({ ...x, g: { ...x.g, vehicle_type: k, wheels: wheeled ? x.g.wheels : null }, sub: wheeled ? 1 : 2 }))
        }} />
      )}
      {a.sub === 1 && (
        <div className="grid grid-cols-3 gap-2.5">
          {WHEELS.map((w) => (
            <button key={w} type="button" aria-pressed={g.wheels === w} onClick={() => setA((x) => ({ ...x, g: { ...x.g, wheels: w }, sub: 2 }))}
              className="flex min-h-20 flex-col items-center justify-center rounded-lg border border-border bg-surface font-display text-3xl font-bold leading-none aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary">
              {w}
              <small className="mt-1 font-sans text-sm font-semibold text-text-2">{t('wheeler')}</small>
            </button>
          ))}
        </div>
      )}
      {a.sub === 2 && (
        <>
          <Stepper label={t('setup.o.count')} value={g.vehicle_count} min={1} max={500} unit={vname} onChange={(v) => setG({ vehicle_count: v })} />
          <div className="mt-4 flex justify-center gap-2">
            {[1, 2, 3, 5, 10].map((n) => (
              <button key={n} type="button" aria-pressed={g.vehicle_count === n} onClick={() => setG({ vehicle_count: n })}
                className="h-12 w-12 rounded-md border border-border bg-surface text-lg font-bold aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:ring-1 aria-pressed:ring-primary">{n}</button>
            ))}
          </div>
        </>
      )}
      {a.sub === 3 && (
        <>
          <CityPicker value={g.base_cities} preferState={f.place?.state}
            onToggle={(v) => setG({ base_cities: g.base_cities.includes(v) ? g.base_cities.filter((c) => c !== v) : [...g.base_cities, v].slice(0, 20) })} />
          <button type="button" className="mt-5 w-full py-2 text-center font-bold text-brand underline" onClick={() => commitGroup(false)}>{t('setup.o.noCity')}</button>
          {g.base_cities.length === 0 && <div className="mt-2"><Note>{t('setup.o.basesWhy')}</Note></div>}
        </>
      )}
    </Wizard>
  )
}
