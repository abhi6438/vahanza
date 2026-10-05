import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchArt } from '../../assets/illustrations'
import { DriverCard } from '../../components/cards'
import { VehicleArt } from '../../components/form'
import { AppShell } from '../../components/shell'
import { useToast } from '../../components/toast'
import { Badge, Button, Chip, ConfirmDialog, EmptyState, ErrorState, Icon, Note, Segmented, Skeleton, Switch } from '../../components/ui'
import { adminTheme, type ThemeState } from '../../lib/api'
import { applyBrandTheme, brandDefault, paletteFor } from '../../lib/brand'
import { contrast, isHex, normalise, PRESETS, SUGGESTED, toStyle, type Preset, type ThemeConfig } from '../../lib/brand-theme'
import { useIsDesktop } from '../../lib/layout'
import { isDarkNow } from '../../lib/theme'
import { ago } from '../../lib/time'
import { track, trackScreen } from '../../lib/track'

/**
 * Admin → Settings → Appearance: the runtime Theme Builder.
 * The admin sets only primary / secondary / accent, light-dark default, corners and density; the live
 * preview renders real app components inside a box carrying the generated palette (.theme-scope), so
 * what you see here is exactly what users get. Save draft → Publish → every app picks it up on its
 * next start (or within 5 minutes when it comes back to the front). No new build.
 */
export default function AdminAppearance() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const desktop = useIsDesktop()
  const [state, setState] = useState<ThemeState | null>(null)
  const [error, setError] = useState(false)
  const [cfg, setCfg] = useState<ThemeConfig>(brandDefault)
  const [busy, setBusy] = useState<'' | 'draft' | 'publish' | 'reset'>('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [previewDark, setPreviewDark] = useState(isDarkNow)

  const load = () => {
    setError(false)
    adminTheme.get().then((s) => { setState(s); setCfg(s.draft ? normalise(s.draft) : s.published ? normalise(s.published) : brandDefault) }).catch(() => setError(true))
  }
  useEffect(() => { trackScreen('admin_appearance'); load() }, [])

  const published = state?.published ? normalise(state.published) : brandDefault
  const dirty = JSON.stringify(cfg) !== JSON.stringify(state?.draft ? normalise(state.draft) : published)
  const unpublished = JSON.stringify(cfg) !== JSON.stringify(published)
  const up = (patch: Partial<ThemeConfig>) => setCfg((c) => ({ ...c, ...patch }))

  async function run(kind: 'draft' | 'publish' | 'reset') {
    setBusy(kind)
    try {
      // the header colour goes along for the install manifest (the server has no colour maths)
      const body = { ...cfg, headerColor: paletteFor(cfg).light.header }
      const s = kind === 'draft' ? await adminTheme.saveDraft(body) : kind === 'publish' ? await adminTheme.publish(body) : await adminTheme.reset()
      setState(s)
      if (kind === 'reset') setCfg(brandDefault)
      if (kind !== 'draft') {
        // this device right away (others on their next start / within 5 minutes)
        applyBrandTheme(kind === 'publish' ? cfg : null)
        try { kind === 'publish' ? localStorage.setItem('vz-theme-published', JSON.stringify(cfg)) : localStorage.removeItem('vz-theme-published') } catch { /* storage blocked */ }
      }
      track(`theme_${kind}`, { primary: cfg.primaryColor, mode: cfg.mode, radius: cfg.radius, density: cfg.density })
      toast(t(`appearance.done.${kind}`), { tone: 'success' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy('')
      setConfirmReset(false)
    }
  }

  const status = !state ? null
    : dirty ? <Badge tone="action" icon={Icon.alert}>{t('appearance.unsaved')}</Badge>
      : unpublished ? <Badge tone="primary" icon={Icon.doc}>{t('appearance.draftSaved', { when: state.draft_at ? ago(state.draft_at, i18n.language) : '' })}</Badge>
        : <Badge tone="success" icon={Icon.check}>{state.published ? t('appearance.live', { when: state.published_at ? ago(state.published_at, i18n.language) : '' }) : t('appearance.liveDefault')}</Badge>

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" onClick={() => setCfg(DEFAULT_PICK)} disabled={JSON.stringify(cfg) === JSON.stringify(DEFAULT_PICK) || !!busy} icon={Icon.refresh}>{t('appearance.reset')}</Button>
      <span className="flex-1" />
      <Button variant="outline" onClick={() => void run('draft')} loading={busy === 'draft'} disabled={!!busy || !dirty}>{t('appearance.saveDraft')}</Button>
      <Button variant="primary" onClick={() => void run('publish')} loading={busy === 'publish'} disabled={!!busy || !unpublished} icon={Icon.upload}>{t('appearance.publish')}</Button>
    </div>
  )

  return (
    <AppShell title={t('appearance.title')} back={!desktop} width="wide">
      {error && <ErrorState onRetry={load} />}
      {!state && !error && <Skeleton className="h-96" />}
      {state && (
        <>
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">{t('appearance.heading')}</h1>
              <p className="mt-1 max-w-xl text-text-2">{t('appearance.sub')}</p>
            </div>
            {status}
          </header>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            {/* ---------------- controls */}
            <div className="flex min-w-0 flex-col gap-5">
              <Panel title={t('appearance.brand')} icon={Icon.palette}>
                <ColorField label={t('appearance.primary')} sub={t('appearance.primarySub')} value={cfg.primaryColor}
                  onChange={(v) => up({ primaryColor: v, preset: null })} big />
                <ContrastNote cfg={cfg} />
                <ThemePicker cfg={cfg} state={state} onPick={(p) => up(p)} />
                <Shades cfg={cfg} />
              </Panel>

              <Panel title={t('appearance.more')} icon={Icon.sparkle}>
                <ColorField label={t('appearance.accent')} sub={t('appearance.accentSub')} value={cfg.accentColor} onChange={(v) => up({ accentColor: v, preset: null })} />
                <div className="mt-4 border-t border-border pt-4">
                  <Switch checked={!cfg.secondaryColor} onChange={(auto) => up({ secondaryColor: auto ? null : (paletteFor(cfg).light.header || cfg.primaryColor), preset: null })}
                    label={t('appearance.secondaryAuto')} sub={t('appearance.secondarySub')} />
                  {cfg.secondaryColor && <div className="mt-3"><ColorField label={t('appearance.secondary')} value={cfg.secondaryColor} onChange={(v) => up({ secondaryColor: v, preset: null })} /></div>}
                </div>
              </Panel>

              <Panel title={t('appearance.advanced')} icon={Icon.settings}>
                <Option label={t('appearance.radius')}>
                  <Segmented label={t('appearance.radius')} value={cfg.radius} onChange={(v) => up({ radius: v })}
                    options={(['sharp', 'medium', 'rounded'] as const).map((k) => ({ key: k, label: <span className="inline-flex items-center gap-1.5"><RadiusIcon k={k} />{t(`appearance.r.${k}`)}</span> }))} />
                </Option>
                <Option label={t('appearance.density')}>
                  <Segmented label={t('appearance.density')} value={cfg.density} onChange={(v) => up({ density: v })}
                    options={(['compact', 'comfortable', 'spacious'] as const).map((k) => ({ key: k, label: t(`appearance.d.${k}`) }))} />
                </Option>
                <Option label={t('appearance.mode')} sub={t('appearance.modeSub')}>
                  <Segmented label={t('appearance.mode')} value={cfg.mode} onChange={(v) => { up({ mode: v }); if (v !== 'system') setPreviewDark(v === 'dark') }}
                    options={(['light', 'dark', 'system'] as const).map((k) => ({ key: k, label: t(`settings.${k}`) }))} />
                </Option>
              </Panel>

              {/* desktop: actions under the controls; phones get a sticky bar */}
              <div className="hidden rounded-lg border border-border bg-surface p-card shadow-sm lg:block">{actions}</div>
              {state.published && (
                <button type="button" onClick={() => setConfirmReset(true)} className="self-start px-1 text-sm font-semibold text-text-2 underline underline-offset-2 hover:text-error">
                  {t('appearance.backToBrand')}
                </button>
              )}
            </div>

            {/* ---------------- live preview */}
            <div className="min-w-0 lg:sticky lg:top-[5.5rem]">
              <Preview cfg={cfg} dark={previewDark} onDark={setPreviewDark} />
            </div>
          </div>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+8px)] z-20 mt-5 rounded-lg border border-border bg-surface-3/95 p-3 shadow-lg backdrop-blur lg:hidden">{actions}</div>
          <ConfirmDialog open={confirmReset} title={t('appearance.backToBrandTitle')} body={t('appearance.backToBrandBody')}
            confirmLabel={t('appearance.backToBrandYes')} busy={busy === 'reset'} onConfirm={() => void run('reset')} onCancel={() => setConfirmReset(false)} />
        </>
      )}
    </AppShell>
  )
}

// ---------------------------------------------------------------- controls
/** "Reset" = the suggested default look: blue, medium corners, comfortable size, follow the phone. */
const DEFAULT_PICK: ThemeConfig = {
  primaryColor: SUGGESTED.primary, secondaryColor: null, accentColor: SUGGESTED.accent,
  mode: 'system', radius: 'medium', density: 'comfortable', preset: SUGGESTED.key,
}

const colorsOf = (c: { primaryColor: string; accentColor: string; secondaryColor: string | null }) =>
  `${c.primaryColor}|${c.accentColor}|${c.secondaryColor || ''}`.toUpperCase()
const presetColors = (p: Preset) => colorsOf({ primaryColor: p.primary, accentColor: p.accent, secondaryColor: p.secondary })

/** Your own colours (live / draft / being made) first, then the original brand look and the presets. */
function ThemePicker({ cfg, state, onPick }: { cfg: ThemeConfig; state: ThemeState; onPick: (p: Partial<ThemeConfig>) => void }) {
  const { t, i18n } = useTranslation()
  const name = (p: Preset) => (i18n.language === 'en' ? p.label[1] : p.label[0])
  const original: Preset = { key: 'brand', label: [t('appearance.original'), t('appearance.original')], primary: brandDefault.primaryColor, accent: brandDefault.accentColor, secondary: brandDefault.secondaryColor }
  const known = new Set([original, ...PRESETS].map(presetColors))
  const now = colorsOf(cfg)

  // the admin's own colours: what is live, the saved draft, and what is on screen now (if not a preset)
  const own: { key: string; tag: string; c: ThemeConfig }[] = []
  const seen = new Set<string>()
  const addOwn = (key: string, tag: string, raw: unknown) => {
    if (!raw) return
    const c = normalise(raw)
    const k = colorsOf(c)
    if (known.has(k) || seen.has(k)) return
    seen.add(k)
    own.push({ key, tag, c })
  }
  addOwn('live', t('appearance.ownLive'), state.published)
  addOwn('draft', t('appearance.ownDraft'), state.draft)
  addOwn('now', t('appearance.ownNew'), cfg)

  const card = (key: string, primary: string, accent: string, label: string, on: boolean, pick: () => void, tag?: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={pick} title={label}
      className={`press relative flex min-w-0 flex-col items-start gap-1.5 rounded-md border p-2 text-left text-xs font-semibold ${on ? 'border-primary bg-primary-subtle shadow-[inset_0_0_0_1px_var(--c-brand)]' : 'border-border bg-surface hover:border-primary-border'}`}>
      <span className="flex w-full items-center">
        <span className="size-6 rounded-full ring-2 ring-surface" style={{ background: primary }} />
        <span className="-ml-2 size-4 rounded-full ring-2 ring-surface" style={{ background: accent }} />
        {on && <span className="ml-auto text-primary [&>svg]:size-3.5">{Icon.check}</span>}
      </span>
      <span className="w-full truncate text-sm">{label}</span>
      {tag && <span className="absolute -top-2 right-1.5 rounded-full bg-primary px-1.5 text-[0.625rem] font-bold leading-4 text-on-primary">{tag}</span>}
    </button>
  )
  const grid = 'grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5'
  return (
    <div className="mt-5 space-y-4">
      {own.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-text-2">{t('appearance.yours')}</p>
          <div className={grid}>
            {own.map((o) => card(`own-${o.key}`, o.c.primaryColor, o.c.accentColor, o.c.primaryColor, colorsOf(o.c) === now,
              () => onPick({ primaryColor: o.c.primaryColor, accentColor: o.c.accentColor, secondaryColor: o.c.secondaryColor, preset: null }), o.tag))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-2">{t('appearance.presets')}</p>
        <div className={grid}>
          {[original, ...PRESETS].map((p) => card(p.key, p.primary, p.accent, name(p), presetColors(p) === now,
            () => onPick({ primaryColor: p.primary.toUpperCase(), accentColor: p.accent.toUpperCase(), secondaryColor: p.secondary?.toUpperCase() || null, preset: p.key }),
            p.key === SUGGESTED.key ? t('appearance.default') : p.key === 'brand' ? t('appearance.originalTag') : undefined))}
        </div>
        <p className="mt-2 text-xs text-text-3">{t('appearance.customHint')}</p>
      </div>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-card shadow-sm lg:p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.08em] text-text-2">
        <span className="icon-tile size-7 bg-primary-soft text-primary [&>svg]:size-icon-sm">{icon}</span>{title}
      </h2>
      {children}
    </section>
  )
}

function Option({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-3.5 first:pt-0 last:border-0 last:pb-0">
      <p className="font-medium">{label}</p>
      {sub && <p className="mb-2 text-sm text-text-2">{sub}</p>}
      <div className={sub ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}

/** Swatch (native colour picker) + hex box. */
function ColorField({ label, sub, value, onChange, big }: { label: string; sub?: string; value: string; onChange: (v: string) => void; big?: boolean }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  const commit = (v: string) => {
    const hex = (v.startsWith('#') ? v : '#' + v).trim().toUpperCase()
    if (isHex(hex)) onChange(hex)
    else setText(value)
  }
  return (
    <div>
      <p className="font-medium">{label}</p>
      {sub && <p className="text-sm text-text-2">{sub}</p>}
      <div className="mt-2 flex items-center gap-3">
        <label className={`press relative shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-inset ring-black/10 ${big ? 'size-14' : 'size-11'}`} style={{ background: value }}>
          <span className="sr-only">{label}</span>
          <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
          <span aria-hidden className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-black/35 text-white [&>svg]:size-3">{Icon.palette}</span>
        </label>
        <input value={text} onChange={(e) => { setText(e.target.value); if (isHex(e.target.value)) onChange(e.target.value.toUpperCase()) }} onBlur={(e) => commit(e.target.value)}
          aria-label={`${label} (hex)`} maxLength={7} spellCheck={false} autoComplete="off"
          className={`w-32 rounded-md border border-border bg-surface px-3 font-mono font-semibold uppercase tracking-wider shadow-xs outline-none focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-focus)_22%,transparent)] ${big ? 'h-14 text-lg' : 'h-11'}`} />
      </div>
    </div>
  )
}

/** Is the text on buttons readable? (WCAG contrast, both modes) */
function ContrastNote({ cfg }: { cfg: ThemeConfig }) {
  const { t } = useTranslation()
  const p = paletteFor(cfg)
  const light = contrast(p.light.brand, p.light['on-primary'])
  const dark = contrast(p.dark.brand, p.dark['on-primary'])
  const adjusted = p.light.brand !== cfg.primaryColor
  const ok = Math.min(light, dark) >= 4.5
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
        {ok ? Icon.check : Icon.alert}{t(ok ? 'appearance.contrastOk' : 'appearance.contrastLow', { light: light.toFixed(1), dark: dark.toFixed(1) })}
      </span>
      <span className="text-text-2">{t(p.light['on-primary'] === '#FFFFFF' ? 'appearance.textWhite' : 'appearance.textDark')}</span>
      {adjusted && <span className="text-text-2">{t('appearance.adjusted', { hex: p.light.brand })}</span>}
    </div>
  )
}

/** The shades made from the primary (light and dark). */
function Shades({ cfg }: { cfg: ThemeConfig }) {
  const { t } = useTranslation()
  const p = paletteFor(cfg)
  const keys: [string, string][] = [['brand', 'primary'], ['primary-hover', 'hover'], ['primary-active', 'active'], ['brand-soft', 'light'], ['primary-subtle', 'subtle'], ['primary-border', 'border'], ['on-primary', 'text']]
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm font-semibold text-text-2">{t('appearance.shades')}</p>
      {(['light', 'dark'] as const).map((m) => (
        <div key={m} className="mb-1.5 flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs font-semibold text-text-3">{t(`settings.${m}`)}</span>
          <div className="grid flex-1 grid-cols-7 overflow-hidden rounded-md ring-1 ring-inset ring-border">
            {keys.map(([k, name]) => <span key={k} title={`${t(`appearance.shade.${name}`)} ${p[m][k]}`} className="h-8" style={{ background: p[m][k] }} />)}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pl-12 text-[0.65rem] text-text-3">
        {keys.map(([k, name]) => <span key={k} className="flex-1 truncate text-center">{t(`appearance.shade.${name}`)}</span>)}
      </div>
    </div>
  )
}

function RadiusIcon({ k }: { k: 'sharp' | 'medium' | 'rounded' }) {
  const r = { sharp: 1, medium: 4, rounded: 8 }[k]
  return <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d={`M2 14V${2 + r}a${r} ${r} 0 0 1 ${r}-${r}H14`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

// ---------------------------------------------------------------- live preview
function Preview({ cfg, dark, onDark }: { cfg: ThemeConfig; dark: boolean; onDark: (v: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const pal = useMemo(() => paletteFor(cfg), [cfg])
  const [chip, setChip] = useState('truck')
  const [on, setOn] = useState(true)
  const [check, setCheck] = useState(true)
  const [radio, setRadio] = useState('a')
  const [tab, setTab] = useState(0)
  const style = { ...toStyle(dark ? pal.dark : pal.light), colorScheme: dark ? 'dark' : 'light' } as CSSProperties
  return (
    <section aria-label={t('appearance.preview')} className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="live-dot" />
        <p className="flex-1 text-xs font-bold uppercase tracking-[0.08em] text-text-2">{t('appearance.preview')}</p>
        <Segmented label={t('appearance.previewMode')} value={dark ? 'dark' : 'light'} onChange={(v) => onDark(v === 'dark')}
          options={[{ key: 'light', label: <span className="inline-flex items-center gap-1 [&>svg]:size-3.5">{Icon.sun}{t('settings.light')}</span> }, { key: 'dark', label: <span className="inline-flex items-center gap-1 [&>svg]:size-3.5">{Icon.moon}{t('settings.dark')}</span> }]} />
      </div>

      {/* everything below uses the draft palette, radius and density */}
      <div className="theme-scope" data-theme={dark ? 'dark' : 'light'} data-radius={cfg.radius} data-density={cfg.density} style={style} lang={i18n.language}>
        {/* app header + tabs */}
        <div className="surface-hero rounded-b-[1.5rem] px-4 pb-4 pt-3 shadow-md">
          <div className="flex h-10 items-center gap-2">
            <span className="font-display text-lg font-semibold text-on-header">{t('appearance.pv.hello')}</span>
            <span className="flex-1" />
            <span className="relative text-on-header/90 [&>svg]:size-icon-md">{Icon.bell}<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-action text-[0.6rem] font-bold text-on-action">3</span></span>
          </div>
          <button type="button" className={'mt-2 w-full ' + 'btn-action press inline-flex min-h-ctl-lg items-center justify-center gap-2 rounded-md px-5 font-semibold text-on-action [&>svg]:size-icon-md'}>{Icon.plus}{t('appearance.pv.cta')}</button>
        </div>

        <div className="space-y-4 p-4">
          {/* buttons */}
          <Row label={t('appearance.pv.buttons')}>
            <Button variant="primary" icon={Icon.phone}>{t('appearance.pv.primary')}</Button>
            <Button variant="secondary">{t('appearance.pv.secondary')}</Button>
            <Button variant="outline">{t('appearance.pv.outline')}</Button>
            <Button variant="ghost">{t('appearance.pv.ghost')}</Button>
          </Row>

          {/* chips */}
          <Row label={t('appearance.pv.chips')}>
            {(['truck', 'bus', 'pickup'] as const).map((v) => (
              <Chip key={v} selected={chip === v} onClick={() => setChip(v)} icon={<VehicleArt kind={v} className="h-4 w-7" />}>{t(`appearance.pv.v.${v}`)}</Chip>
            ))}
          </Row>

          {/* input + dropdown */}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('appearance.pv.input')}</span>
              <span className="flex h-ctl-lg items-center gap-2 rounded-md border border-primary bg-surface px-3 shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-focus)_18%,transparent)]">
                <span className="text-text-3 [&>svg]:size-icon-md">{Icon.search}</span>
                <span className="text-text">{t('appearance.pv.typed')}</span><span className="h-5 w-px animate-pulse bg-primary" />
              </span>
            </label>
            <div>
              <span className="mb-1 block text-sm font-medium">{t('appearance.pv.dropdown')}</span>
              <div className="overflow-hidden rounded-md border border-border bg-surface-3 shadow-md">
                {[0, 1].map((i) => (
                  <div key={i} className={`flex min-h-ctl-md items-center gap-2 px-3 text-sm ${i === 0 ? 'bg-primary-soft font-semibold text-primary' : 'text-text'}`}>
                    {i === 0 && <span className="[&>svg]:size-icon-sm">{Icon.check}</span>}{t(`appearance.pv.opt${i}`)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* driver card */}
          <DriverCard
            data={{ name: 'Ramesh Kumar', photo_url: null, verified: true, distance_km: 4, rating_avg: 4.7, rating_count: 12, top: true, jobs_done: 3, place: t('appearance.pv.place'),
              d: { vehicles: ['truck', 'trailer'], max_wheels: 14, licence_type: 'HMV', experience_years: 8, savings_wanted: 18000, savings_negotiable: true, pay_prefs: ['fix'], work_type: 'full', area: 'state', languages: ['hi'], available_from: 'now' } }}
            actions={<div className="mt-3 grid grid-cols-2 gap-2"><Button variant="success" icon={Icon.phone}>{t('card.call')}</Button><Button variant="whatsapp">WhatsApp</Button></div>} />

          {/* badges, link, icons */}
          <Row label={t('appearance.pv.badges')}>
            <Badge tone="primary" icon={Icon.verified}>{t('appearance.pv.badge')}</Badge>
            <Badge tone="success">{t('appearance.pv.ok')}</Badge>
            <Badge tone="action">{t('appearance.pv.new')}</Badge>
            <a href="#preview-link" onClick={(e) => e.preventDefault()} className="text-sm font-semibold text-primary underline underline-offset-2">{t('appearance.pv.link')}</a>
            {[Icon.truck, Icon.users, Icon.bell].map((ic, i) => <span key={i} className="icon-tile size-9 bg-primary-soft text-primary [&>svg]:size-icon-md">{ic}</span>)}
          </Row>

          {/* controls */}
          <div className="rounded-lg border border-border bg-surface p-card shadow-sm">
            <Switch checked={on} onChange={setOn} label={t('appearance.pv.switch')} />
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <button type="button" role="checkbox" aria-checked={check} onClick={() => setCheck(!check)} className="inline-flex items-center gap-2">
                <span className={`grid size-5 place-items-center rounded-[calc(var(--radius-sm)*0.75)] border-2 ${check ? 'border-primary bg-primary text-on-primary' : 'border-border-strong'} [&>svg]:size-3.5`}>{check && Icon.check}</span>{t('appearance.pv.check')}
              </button>
              {(['a', 'b'] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={radio === r} onClick={() => setRadio(r)} className="inline-flex items-center gap-2">
                  <span className={`grid size-5 place-items-center rounded-full border-2 ${radio === r ? 'border-primary' : 'border-border-strong'}`}>{radio === r && <span className="size-2.5 rounded-full bg-primary" />}</span>{t(`appearance.pv.radio_${r}`)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-text-2"><span>{t('appearance.pv.progress')}</span><span className="font-semibold text-primary">70%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-primary-soft"><div className="h-full w-[70%] rounded-full bg-primary" /></div>
            </div>
          </div>

          <Note>{t('appearance.pv.alert')}</Note>
          <EmptyState compact art={<SearchArt />} title={t('appearance.pv.emptyTitle')} body={t('appearance.pv.emptyBody')}
            action={<Button variant="outline" size="sm">{t('appearance.pv.clear')}</Button>} />
        </div>

        {/* bottom navigation */}
        <nav aria-label={t('appearance.pv.nav')} className="glass grid grid-cols-4 border-t border-border">
          {[[Icon.home, 'home'], [Icon.list, 'posts'], [Icon.wrench, 'mechanic'], [Icon.user, 'profile']].map(([ic, k], i) => (
            <button key={k as string} type="button" onClick={() => setTab(i)} aria-current={tab === i ? 'page' : undefined}
              className={`press flex h-nav flex-col items-center justify-center gap-0.5 text-[0.6875rem] ${tab === i ? 'font-semibold text-primary' : 'font-medium text-text-2'}`}>
              <span className={`grid h-7 w-14 place-items-center rounded-full text-[length:var(--icon-size-md)] ${tab === i ? 'bg-primary-soft' : ''}`}>{ic}</span>
              {t(`tabs.${k === 'mechanic' ? 'mechanic' : k}`)}
            </button>
          ))}
        </nav>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
