import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DriverCard } from '../components/cards'
import { Chips, Label, OptionList, Stepper, TextField, Toggle, VehicleGrid } from '../components/form'
import { PhotoPicker } from '../components/photo'
import { placeText, PlaceField, type PlaceValue } from '../components/places'
import { Wizard } from '../components/Wizard'
import { ApiError, saveProfile, type DriverDetails } from '../lib/api'
import { useAuth } from '../lib/auth'
import { AREA, LANGS, LICENCES, PAY, rupees, VEHICLES, WHEELED, WHEELS, WHEN, WORK, type Opt } from '../lib/catalog'
import { driverCompletion } from '../lib/completion'
import { track, trackScreen } from '../lib/track'

interface Form {
  name: string
  place: PlaceValue | null
  vehicles: string[]
  max_wheels: number | null
  licence_type: DriverDetails['licence_type']
  licence_number: string
  experience_years: number | null
  savings_wanted: number | null
  savings_negotiable: boolean
  pay_prefs: string[]
  work_type: DriverDetails['work_type']
  area: DriverDetails['area']
  languages: string[]
  available_from: DriverDetails['available_from']
}

type Step = 'about' | 'vehicles' | 'when' | 'licence' | 'money' | 'work' | 'preview'
/**
 * first  (just signed up): only name + place, then straight to home
 * complete (from the home card): the rest, one short step at a time, each step saved
 * edit   (from "Edit" on home): everything
 */
const FLOWS: Record<'first' | 'complete' | 'edit', Step[]> = {
  first: ['about'],
  complete: ['vehicles', 'when', 'licence', 'money', 'work', 'preview'],
  edit: ['about', 'vehicles', 'when', 'licence', 'money', 'work', 'preview'],
}
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const wheelOpts: Opt[] = WHEELS.map((w) => ({ key: String(w), label: [`${w} चक्का`, `${w} wheeler`] }))

export default function SetupDriver() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { profile, driver, applyMe } = useAuth()
  // decided once when the screen opens (saving the first step flips setup_done)
  const [mode] = useState<keyof typeof FLOWS>(() => (!profile?.setup_done ? 'first' : params.has('edit') ? 'edit' : 'complete'))
  const STEPS = FLOWS[mode]
  const [step, setStep] = useState(() => {
    // open at the step asked for (from the home card), else the first one still missing
    const want = (params.get('step') || driverCompletion(profile, driver).missing[0]?.step) as Step | undefined
    const i = want ? STEPS.indexOf(want) : -1
    return i >= 0 ? i : 0
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState<Form>(() => ({
    name: profile?.name || '',
    place: profile?.district && profile.state ? { district: profile.district, state: profile.state, pincode: profile.pincode } : null,
    vehicles: driver?.vehicles || [],
    max_wheels: driver?.max_wheels ?? null,
    licence_type: driver?.licence_type ?? null,
    licence_number: '',
    experience_years: driver?.experience_years ?? null,
    savings_wanted: driver?.savings_wanted ?? null,
    savings_negotiable: driver?.savings_negotiable ?? true,
    pay_prefs: driver?.pay_prefs || [],
    work_type: driver?.work_type ?? null,
    area: driver?.area ?? null,
    languages: driver?.languages || [],
    available_from: driver?.available_from ?? null,
  }))

  // Sensible starting values appear only when the user reaches that question,
  // so unanswered questions stay empty (and show as "missing" on home).
  useEffect(() => {
    const cur = STEPS[step]
    setF((x) => {
      if (cur === 'money' && (x.experience_years == null || x.savings_wanted == null))
        return { ...x, experience_years: x.experience_years ?? 5, savings_wanted: x.savings_wanted ?? 15000 }
      if (cur === 'work' && !x.work_type) return { ...x, work_type: 'full' }
      if (cur === 'when' && !x.languages.length) return { ...x, languages: [lang === 'en' ? 'en' : 'hi'] }
      return x
    })
    trackScreen(`driver_${mode}_${cur}`)
    window.scrollTo(0, 0)
  }, [step, STEPS, mode, lang])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }))
  const hasWheeled = f.vehicles.some((v) => WHEELED.includes(v as never))

  const canBy: Record<Step, boolean> = {
    about: f.name.trim().length > 1 && !!f.place,
    vehicles: f.vehicles.length > 0 && (!hasWheeled || !!f.max_wheels),
    when: f.languages.length > 0 && !!f.available_from,
    licence: !!f.licence_type,
    money: true,
    work: !!f.work_type && !!f.area,
    preview: true,
  }
  const can = canBy[STEPS[step]]

  const details = (): DriverDetails => ({
    vehicles: f.vehicles,
    max_wheels: hasWheeled ? f.max_wheels : null,
    licence_type: f.licence_type,
    experience_years: f.experience_years,
    savings_wanted: f.savings_wanted,
    savings_negotiable: f.savings_negotiable,
    pay_prefs: f.pay_prefs,
    work_type: f.work_type,
    area: f.area,
    languages: f.languages,
    available_from: f.available_from,
  })

  /** Saves after every step, so leaving half-way never loses answers. */
  async function save(): Promise<boolean> {
    if (!f.place) return false
    setBusy(true)
    setError('')
    try {
      const me = await saveProfile({
        name: f.name,
        place: f.place,
        driver: mode === 'first' ? undefined : { ...details(), licence_number: f.licence_number || null },
        finish: true,
      })
      applyMe(me)
      return true
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      if (code === 'name_has_number' || code === 'name_short' || code === 'name_long') {
        setError(t(`err.${code}`))
        const i = STEPS.indexOf('about')
        if (i >= 0) setStep(i)
      } else setError(t('error.generic'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function next() {
    if (STEPS[step] !== 'preview' && !(await save())) return
    if (step < STEPS.length - 1) return setStep(step + 1)
    track(mode === 'first' ? 'signup_profile_basic' : mode === 'edit' ? 'profile_updated' : 'profile_completed', { role: 'driver' })
    nav('/home', { replace: true })
  }
  const toHome = () => nav('/home', { replace: true })
  const back = step > 0 ? () => setStep(step - 1) : mode !== 'first' ? toHome : undefined
  const last4 = f.licence_number.replace(/[^A-Za-z0-9]/g, '').slice(-4)

  const titles: Record<Step, [string, string?]> = {
    about: [t('setup.about'), mode === 'first' ? t('setup.firstSub') : undefined],
    vehicles: [t('setup.d.vehicles'), t('pickMany')],
    licence: [t('setup.d.licence'), t('setup.d.licenceSub')],
    money: [t('setup.d.money')],
    work: [t('setup.d.work')],
    when: [t('setup.d.when')],
    preview: [t('setup.d.preview'), t('setup.previewSub')],
  }
  const [title, sub] = titles[STEPS[step]]
  const isLast = step === STEPS.length - 1

  return (
    <Wizard step={step} total={STEPS.length} title={title} sub={sub} onBack={back} canNext={can} onNext={() => void next()} busy={busy} error={error}
      onLater={mode === 'complete' && !isLast ? toHome : undefined}
      nextLabel={mode === 'first' ? t('setup.start') : isLast ? t('done') : undefined}>
      {STEPS[step] === 'about' && (
        <>
          <PhotoPicker />
          <Label>{t('setup.yourName')}</Label>
          <TextField big value={f.name} onChange={(v) => set('name', v)} label={t('setup.yourName')} placeholder={t('setup.d.namePh')} maxLength={60} />
          <Label>{t('setup.d.whereLive')}</Label>
          <PlaceField value={f.place} onChange={(p) => set('place', p)} />
        </>
      )}

      {STEPS[step] === 'vehicles' && (
        <>
          <VehicleGrid options={VEHICLES} value={f.vehicles} onPick={(k) => set('vehicles', toggle(f.vehicles, k))} />
          {hasWheeled && (
            <>
              <Label>{t('setup.d.biggest')}</Label>
              <Chips options={wheelOpts} value={f.max_wheels ? String(f.max_wheels) : null} onChange={(k) => set('max_wheels', Number(k))} />
            </>
          )}
        </>
      )}

      {STEPS[step] === 'licence' && (
        <>
          <OptionList art options={LICENCES} value={f.licence_type} onChange={(k) => set('licence_type', k)} />
          <Label optional>{t('setup.d.licenceNo')}</Label>
          <TextField upper value={f.licence_number} onChange={(v) => set('licence_number', v.slice(0, 24))} label={t('setup.d.licenceNo')} placeholder="MP17 20190012345" />
          <p className="mt-1.5 text-sm text-muted">{last4.length === 4 ? t('setup.d.othersSee', { last4 }) : t('setup.d.onlyLast4')}</p>
        </>
      )}

      {STEPS[step] === 'money' && (
        <>
          <Label first>{t('setup.d.exp')}</Label>
          <Stepper label={t('setup.d.exp')} value={f.experience_years ?? 5} min={0} max={50} onChange={(v) => set('experience_years', v)} unit={t('years')} />
          <Label hint={t('setup.d.savingsHint')}>{t('setup.d.savings')}</Label>
          <Stepper label={t('setup.d.savings')} value={f.savings_wanted ?? 15000} step={1000} min={3000} max={100000} format={rupees} onChange={(v) => set('savings_wanted', v)} />
          <div className="mt-3">
            <Toggle on={f.savings_negotiable} onChange={(v) => set('savings_negotiable', v)}>{t('setup.negotiable')}</Toggle>
          </div>
          <Label optional hint={t('setup.d.payHint')}>{t('setup.d.pay')}</Label>
          <Chips multi options={PAY} value={f.pay_prefs as never[]} onChange={(k) => set('pay_prefs', toggle(f.pay_prefs, k))} />
        </>
      )}

      {STEPS[step] === 'work' && (
        <>
          <Label first>{t('setup.d.workType')}</Label>
          <Chips options={WORK} value={f.work_type} onChange={(k) => set('work_type', k)} />
          <Label>{t('setup.d.area')}</Label>
          <OptionList options={AREA} value={f.area} onChange={(k) => set('area', k)} />
        </>
      )}

      {STEPS[step] === 'when' && (
        <>
          <Label first>{t('setup.d.langs')}</Label>
          <Chips multi options={LANGS} value={f.languages} onChange={(k) => set('languages', toggle(f.languages, k))} />
          <Label>{t('setup.d.start')}</Label>
          <Chips options={WHEN} value={f.available_from} onChange={(k) => set('available_from', k)} />
        </>
      )}

      {STEPS[step] === 'preview' && f.place && (
        <>
          <DriverCard self data={{ name: f.name.trim(), photo_url: profile?.photo_url, place: placeText({ ...f.place, pincode: null }, lang), verified: !!profile?.verified, d: details() }} />
        </>
      )}
    </Wizard>
  )
}
