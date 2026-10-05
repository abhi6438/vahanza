import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { JobCard } from '../components/cards'
import { Chips, Label, Note, OptionList, Stepper, Toggle, VehicleArt } from '../components/form'
import { CityPicker } from '../components/places'
import { Wizard } from '../components/Wizard'
import { scrollToTop } from '../components/ui'
import { ApiError, createPost, type Post, type PostIn } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COVERAGE, FACILITIES, label, LICENCES, PAY, PAY_UNIT, placeName, rupees, VEHICLES, WORK } from '../lib/catalog'
import { track, trackScreen } from '../lib/track'

type Step = 'vehicles' | 'money' | 'cities' | 'licence' | 'facilities' | 'preview'
const STEPS: Step[] = ['vehicles', 'money', 'cities', 'licence', 'facilities', 'preview']
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Owner: "I need drivers" — one short question per screen, then a preview with the automatic check. */
export default function PostNew() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const nav = useNavigate()
  const { profile, fleet } = useAuth()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [need, setNeed] = useState<Record<string, number>>(() => (fleet.length === 1 && fleet[0].id ? { [fleet[0].id]: 1 } : {}))
  const [work, setWork] = useState<PostIn['work_type']>('full')
  const [savings, setSavings] = useState(20000)
  const [negotiable, setNegotiable] = useState(true)
  const [payTypes, setPayTypes] = useState<string[]>([])
  const [payVals, setPayVals] = useState<Record<string, number>>(() => Object.fromEntries(Object.entries(PAY_UNIT).map(([k, u]) => [k, u.def])))
  const [bases, setBases] = useState<string[] | null>(null)   // null = not touched yet: take cities from chosen vehicles
  const [coverage, setCoverage] = useState<PostIn['coverage']>(null)
  const [addCity, setAddCity] = useState(false)
  const [licence, setLicence] = useState<PostIn['licence_type']>(null)
  const [minExp, setMinExp] = useState(2)
  const [facilities, setFacilities] = useState<string[]>([])

  useEffect(() => {
    trackScreen(`post_new_${STEPS[step]}`)
    scrollToTop()
  }, [step])

  const chosen = fleet.filter((g) => g.id && need[g.id])
  const fromGroups = useMemo(() => [...new Set(chosen.flatMap((g) => g.base_cities))], [chosen])
  const cities = bases ?? fromGroups
  const salOk = savings >= 6000 && savings <= 80000

  if (!fleet.length) return <Navigate to="/setup?step=fleet&next=/posts/new" replace />

  const body = (): PostIn => ({
    groups: chosen.map((g) => ({ fleet_group_id: g.id!, drivers_needed: need[g.id!] })),
    work_type: work,
    savings_monthly: savings,
    savings_negotiable: negotiable,
    pay_mix: Object.fromEntries(payTypes.map((k) => [k, payVals[k]])),
    base_cities: cities,
    coverage,
    often_cities: [],
    licence_type: licence,
    min_experience: minExp,
    facilities,
  })

  const preview: Post = {
    id: 'preview', status: salOk ? 'live' : 'under_check', check_flags: [], created_at: '', expires_at: '',
    ...body(),
    groups: chosen.map((g) => ({ fleet_group_id: g.id!, vehicle_type: g.vehicle_type, wheels: g.wheels, drivers_needed: need[g.id!] })),
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const r = await createPost(body())
      track('post_created', { status: r.status, groups: chosen.length, drivers: preview.groups.reduce((s, g) => s + g.drivers_needed, 0), pay_types: payTypes.length, facilities: facilities.length })
      nav('/posts', { replace: true, state: { created: r.status } })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      setError(code === 'too_many_posts' ? t('err.too_many_posts') : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const can: Record<Step, boolean> = {
    vehicles: chosen.length > 0,
    money: true,
    cities: !!coverage,
    licence: !!licence,
    facilities: true,
    preview: true,
  }
  const titles: Record<Step, [string, string?]> = {
    vehicles: [t('post.q.vehicles'), t('post.q.vehiclesSub')],
    money: [t('post.q.money'), t('post.q.moneySub')],
    cities: [t('post.q.cities'), t('post.q.citiesSub')],
    licence: [t('post.q.licence')],
    facilities: [t('post.q.facilities'), t('post.q.facilitiesSub')],
    preview: [t('post.q.preview')],
  }
  const cur = STEPS[step]
  const [title, sub] = titles[cur]
  const isLast = step === STEPS.length - 1

  return (
    <Wizard step={step} total={STEPS.length} title={title} sub={sub} busy={busy} error={error} canNext={can[cur]}
      onBack={() => (step ? setStep(step - 1) : nav(-1))}
      onNext={() => (isLast ? void submit() : setStep(step + 1))}
      nextLabel={isLast ? t('post.submit') : undefined}>
      {cur === 'vehicles' && (
        <>
          <div className="flex flex-col gap-2.5">
            {fleet.map((g) => {
              const on = !!(g.id && need[g.id])
              return (
                <div key={g.id} className={`rounded-lg border-2 bg-surface p-3 ${on ? 'border-brand' : 'border-border'}`}>
                  <button type="button" aria-pressed={on} className="flex w-full items-center gap-3 text-left"
                    onClick={() => g.id && setNeed((n) => { const x = { ...n }; if (x[g.id!]) delete x[g.id!]; else x[g.id!] = 1; return x })}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-brand bg-primary text-on-primary' : 'border-border'}`}>
                      {on && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>}
                    </span>
                    <VehicleArt kind={g.vehicle_type} className="h-9 w-14" />
                    <span className="flex-1">
                      <strong className="block">{g.vehicle_count} {label(VEHICLES, g.vehicle_type as never, lang)}{g.wheels ? ` · ${t('wheels', { n: g.wheels })}` : ''}</strong>
                      <span className="text-sm text-text-2">{g.base_cities.length ? t('fleet.from', { cities: g.base_cities.map((c) => placeName(c, lang)).join(', ') }) : t('fleet.noCity')}</span>
                    </span>
                  </button>
                  {on && g.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-2 text-sm font-semibold">{t('post.howMany')}</p>
                      <Stepper label={t('post.howMany')} value={need[g.id]} min={1} max={Math.max(1, Math.min(500, g.vehicle_count * 3))} unit={t('post.drivers')}
                        onChange={(v) => setNeed((n) => ({ ...n, [g.id!]: v }))} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Label>{t('setup.d.workType')}</Label>
          <Chips options={WORK} value={work} onChange={setWork} />
        </>
      )}

      {cur === 'money' && (
        <>
          <Stepper label={t('post.q.money')} value={savings} step={1000} min={1000} max={200000} format={rupees} onChange={setSavings} />
          {!salOk && <div className="mt-3"><Note tone="warn">{t('post.salCheck')}</Note></div>}
          <div className="mt-3"><Toggle on={negotiable} onChange={setNegotiable}>{t('setup.negotiable')}</Toggle></div>
          <Label optional hint={t('post.payHint')}>{t('post.q.pay')}</Label>
          <Chips multi options={PAY} value={payTypes as never[]} onChange={(k) => setPayTypes(toggle(payTypes, k))} />
          <div className="mt-3 flex flex-col gap-3">
            {payTypes.map((k) => {
              const u = PAY_UNIT[k]
              return (
                <div key={k} className="rounded-lg border border-border bg-surface p-3">
                  <p className="mb-2 font-semibold">{label(PAY, k as never, lang)}</p>
                  <Stepper label={label(PAY, k as never, lang)} value={payVals[k]} step={u.step} min={u.min} max={u.max} format={(v) => u.fmt(v, lang)}
                    onChange={(v) => setPayVals((x) => ({ ...x, [k]: Math.round(v * 10) / 10 }))} />
                </div>
              )
            })}
          </div>
        </>
      )}

      {cur === 'cities' && (
        <>
          {cities.length > 0 && !addCity ? (
            // cities come pre-filled from the chosen vehicles; the long list opens only if the owner wants to add more
            <div className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <button key={c} type="button" onClick={() => setBases(cities.filter((x) => x !== c))}
                  className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 font-semibold text-white">
                  {placeName(c, lang)} <span aria-hidden className="text-lg leading-none">×</span>
                </button>
              ))}
              <button type="button" onClick={() => setAddCity(true)} className="rounded-full border-2 border-brand px-3.5 py-2 font-semibold text-brand">+ {t('post.addCity')}</button>
            </div>
          ) : (
            <CityPicker value={cities} preferState={profile?.state}
              onToggle={(v) => setBases(cities.includes(v) ? cities.filter((c) => c !== v) : [...cities, v].slice(0, 20))} />
          )}
          <Label>{t('post.q.coverage')}</Label>
          <OptionList options={COVERAGE} value={coverage} onChange={setCoverage} />
        </>
      )}

      {cur === 'licence' && (
        <>
          <OptionList art options={LICENCES} value={licence} onChange={setLicence} />
          <Label>{t('post.q.minExp')}</Label>
          <Stepper label={t('post.q.minExp')} value={minExp} min={0} max={30} unit={t('years')} onChange={setMinExp} />
        </>
      )}

      {cur === 'facilities' && <Chips multi options={FACILITIES} value={facilities} onChange={(k) => setFacilities(toggle(facilities, k))} />}

      {cur === 'preview' && (
        <>
          <div className={`mb-3 rounded-lg p-3.5 ${salOk ? 'bg-success-soft' : 'bg-accent-soft'}`}>
            <strong className={salOk ? 'text-call' : 'text-accent-ink'}>{salOk ? t('post.goesLive') : t('post.goesCheck')}</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>✓ {t('post.chk.otp')}</li>
              <li>✓ {t('post.chk.filled')}</li>
              <li>{salOk ? '✓' : '!'} {salOk ? t('post.chk.salOk') : t('post.chk.salOdd')}</li>
            </ul>
          </div>
          <JobCard self data={{ title: profile?.business_name || profile?.name || '', photo_url: profile?.photo_url, place: profile?.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, lang) : '', verified: !!profile?.verified, post: preview }} />
          <p className="mt-3 text-sm text-text-2">{t('post.numberNote')}</p>
        </>
      )}
    </Wizard>
  )
}
