/**
 * Runtime brand theme (Admin → Settings → Appearance).
 *
 * The admin picks only:  primary · secondary (optional) · accent · mode · radius · density.
 * Everything else — hover / active / soft / subtle / border shades, on-colour text, tinted
 * neutrals (page, cards, lines, text) for light AND dark — is derived here in OKLCH, so a new
 * colour keeps the same lightness steps and contrast everywhere. The result is a set of --c-*
 * CSS variables; styles.css maps them to Tailwind names (bg-primary, text-text-2, border-border …),
 * so components never hold colours of their own.
 */

export interface ThemeConfig {
  primaryColor: string
  /** deep hero / header colour; null = made from the primary */
  secondaryColor: string | null
  /** the ONE main action (saffron today) */
  accentColor: string
  mode: 'light' | 'dark' | 'system'
  radius: 'sharp' | 'medium' | 'rounded'
  density: 'compact' | 'comfortable' | 'spacious'
  preset?: string | null
  /** sent along on save: the derived light header colour (install manifest); not an admin setting */
  headerColor?: string
}
export type Palette = Record<string, string>
export interface Generated { light: Palette; dark: Palette }

// ---------------------------------------------------------------- colour maths (sRGB ↔ OKLab / OKLCH)
type Lch = { l: number; c: number; h: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function rgbToOklch([r, g, b]: [number, number, number]): Lch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.sqrt(A * A + B * B)
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

function oklchToRgbRaw({ l: L, c, h }: Lch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)

/** OKLCH → hex; chroma is reduced (same lightness and hue) until the colour fits in sRGB. */
export function oklch(l: number, c: number, h: number): string {
  let lo = 0
  let hi = Math.max(0, c)
  let rgb = oklchToRgbRaw({ l: clamp(l), c: hi, h })
  if (!inGamut(rgb)) {
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToRgbRaw({ l: clamp(l), c: mid, h }))) lo = mid
      else hi = mid
    }
    rgb = oklchToRgbRaw({ l: clamp(l), c: lo, h })
  }
  return '#' + rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export const lch = (hex: string): Lch => rgbToOklch(hexToRgb(hex))

/** WCAG relative luminance / contrast ratio. */
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** White or a deep ink of the same hue — whichever reads better on `bg`. */
export function onColor(bg: string, hue: number): string {
  const dark = oklch(0.2, lch(bg).c < 0.02 ? 0 : 0.03, hue)    // grey brand → neutral ink
  return contrast(bg, '#FFFFFF') >= contrast(bg, dark) ? '#FFFFFF' : dark
}

/** Move lightness (keeping hue) until the colour reaches `min` contrast against `against`. */
function withContrast(c: Lch, against: string, min: number, direction: 1 | -1): string {
  let l = c.l
  let hex = oklch(l, c.c, c.h)
  for (let i = 0; i < 60 && contrast(hex, against) < min; i++) {
    l = clamp(l + direction * 0.01)
    hex = oklch(l, c.c, c.h)
  }
  return hex
}

/** Mix two colours in OKLab (perceptual, not "random opacity"). */
function mix(a: string, b: string, t: number): string {
  const p = lch(a)
  const q = lch(b)
  const pa = [p.l, p.c * Math.cos((p.h * Math.PI) / 180), p.c * Math.sin((p.h * Math.PI) / 180)]
  const qa = [q.l, q.c * Math.cos((q.h * Math.PI) / 180), q.c * Math.sin((q.h * Math.PI) / 180)]
  const r = pa.map((v, i) => v + (qa[i] - v) * t)
  const c = Math.hypot(r[1], r[2])
  return oklch(r[0], c, ((Math.atan2(r[2], r[1]) * 180) / Math.PI + 360) % 360)
}

// ---------------------------------------------------------------- presets
export const PRESETS: { key: string; label: [string, string]; primary: string; accent: string; secondary: string | null }[] = [
  { key: 'teal', label: ['टील', 'Teal'], primary: '#0D5C6C', accent: '#F5A623', secondary: '#0A4D5A' },
  { key: 'blue', label: ['नीला', 'Blue'], primary: '#1D4ED8', accent: '#F59E0B', secondary: null },
  { key: 'indigo', label: ['इंडिगो', 'Indigo'], primary: '#4338CA', accent: '#F5A623', secondary: null },
  { key: 'purple', label: ['बैंगनी', 'Purple'], primary: '#7E22CE', accent: '#F59E0B', secondary: null },
  { key: 'orange', label: ['नारंगी', 'Orange'], primary: '#C2410C', accent: '#0F766E', secondary: null },
  { key: 'green', label: ['हरा', 'Green'], primary: '#15803D', accent: '#F59E0B', secondary: null },
]

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#0D5C6C', secondaryColor: '#0A4D5A', accentColor: '#F5A623',
  mode: 'system', radius: 'medium', density: 'comfortable', preset: 'teal',
}

// ---------------------------------------------------------------- the generator
const SUCCESS = { light: '#178A4A', dark: '#33B46E' }
const DANGER = { light: '#C63A31', dark: '#EA6A5F' }

/**
 * Light: the picked primary as-is for fills (darkened only if it would vanish on white), soft tints
 * for selection, neutrals carrying a whisper of the brand hue.
 * Dark: NOT an inversion — a lifted, calmer primary that reads on deep surfaces, surfaces built from
 * the same hue at low lightness, and lighter hover states (dark UIs brighten on hover).
 */
export function generate(cfg: ThemeConfig, base?: { light?: Palette; dark?: Palette }): Generated {
  const P = lch(cfg.primaryColor)
  const A = lch(cfg.accentColor)
  const S = cfg.secondaryColor ? lch(cfg.secondaryColor) : null
  const hue = P.h
  const nc = Math.min(P.c, 0.12) // chroma for brand-tinted neutrals

  // ---- light
  const lCard = '#FFFFFF'
  const lBrand = base?.light?.brand || withContrast(P, lCard, 3.2, -1)
  const lb = lch(lBrand)
  const lHeader = base?.light?.header || (S ? oklch(Math.min(S.l, 0.42), S.c, S.h) : oklch(Math.min(lb.l - 0.06, 0.4), Math.min(lb.c, 0.1), hue))
  const lh = lch(lHeader)
  const lAccent = base?.light?.accent || cfg.accentColor
  const light: Palette = {
    brand: lBrand,
    'primary-hover': oklch(lb.l - 0.05, lb.c, hue),
    'primary-active': oklch(lb.l - 0.1, lb.c, hue),
    'brand-dark': base?.light?.brandDark || oklch(Math.min(lb.l - 0.12, 0.32), lb.c * 0.9, hue),
    'brand-soft': base?.light?.brandSoft || oklch(0.945, Math.min(nc * 0.32, 0.04), hue),
    'primary-subtle': oklch(0.972, Math.min(nc * 0.16, 0.018), hue),
    'primary-border': oklch(0.8, Math.min(lb.c * 0.45, 0.07), hue),
    'on-primary': onColor(lBrand, hue),
    focus: oklch(clamp(lb.l + 0.06, 0.45, 0.62), Math.max(lb.c, 0.12), hue),
    header: lHeader,
    'header-alt': base?.light?.headerAlt || oklch(lh.l + 0.07, lh.c * 1.1, lh.h),
    'on-header': onColor(lHeader, lh.h),
    accent: lAccent,
    'accent-soft': base?.light?.accentSoft || oklch(0.96, Math.min(A.c * 0.3, 0.045), A.h),
    'accent-ink': base?.light?.accentInk || oklch(0.42, Math.min(A.c * 0.75, 0.11), A.h),
    'on-action': onColor(lAccent, A.h),
    call: SUCCESS.light,
    danger: DANGER.light,
    ink: base?.light?.ink || oklch(0.24, nc * 0.16, hue),
    muted: base?.light?.muted || oklch(0.5, nc * 0.14, hue),
    'text-3': oklch(0.62, nc * 0.1, hue),
    line: base?.light?.line || oklch(0.915, nc * 0.07, hue),
    'line-subtle': oklch(0.945, nc * 0.05, hue),
    'line-strong': oklch(0.84, nc * 0.1, hue),
    bg: base?.light?.bg || oklch(0.968, nc * 0.05, hue),
    card: lCard,
    'surface-2': oklch(0.955, nc * 0.06, hue),
    'surface-3': '#FFFFFF',
  }
  light['on-success'] = onColor(light.call, 150)
  light['on-error'] = onColor(light.danger, 25)
  light['success-soft'] = mix(light.call, lCard, 0.88)
  light['error-soft'] = mix(light.danger, lCard, 0.9)

  // ---- dark
  const dCard = base?.dark?.card || oklch(0.205, Math.min(nc * 0.14, 0.02), hue)
  const dBrand = base?.dark?.brand || oklch(clamp(Math.max(P.l, 0.7), 0.7, 0.8), Math.min(P.c, 0.14), hue)
  const db = lch(dBrand)
  const dHeader = base?.dark?.header || (S ? oklch(Math.min(S.l, 0.27), Math.min(S.c, 0.06), S.h) : oklch(0.25, Math.min(nc * 0.5, 0.05), hue))
  const dh = lch(dHeader)
  const dAccent = base?.dark?.accent || oklch(Math.max(A.l, 0.78), A.c, A.h)
  const dark: Palette = {
    brand: dBrand,
    'primary-hover': oklch(db.l + 0.05, db.c, hue),
    'primary-active': oklch(db.l + 0.09, db.c * 0.95, hue),
    'brand-dark': base?.dark?.brandDark || oklch(0.88, Math.min(db.c * 0.6, 0.08), hue),
    'brand-soft': base?.dark?.brandSoft || oklch(0.3, Math.min(nc * 0.5, 0.06), hue),
    'primary-subtle': oklch(0.245, Math.min(nc * 0.3, 0.035), hue),
    'primary-border': oklch(0.46, Math.min(db.c * 0.55, 0.08), hue),
    'on-primary': onColor(dBrand, hue),
    focus: oklch(Math.max(db.l, 0.72), Math.max(db.c, 0.11), hue),
    header: dHeader,
    'header-alt': base?.dark?.headerAlt || oklch(dh.l + 0.1, Math.min(dh.c * 1.5, 0.08), dh.h),
    'on-header': onColor(dHeader, dh.h),
    accent: dAccent,
    'accent-soft': base?.dark?.accentSoft || oklch(0.28, Math.min(A.c * 0.35, 0.05), A.h),
    'accent-ink': base?.dark?.accentInk || oklch(0.87, Math.min(A.c * 0.6, 0.09), A.h),
    'on-action': onColor(dAccent, A.h),
    call: SUCCESS.dark,
    danger: DANGER.dark,
    ink: base?.dark?.ink || oklch(0.94, nc * 0.06, hue),
    muted: base?.dark?.muted || oklch(0.72, nc * 0.14, hue),
    'text-3': oklch(0.58, nc * 0.12, hue),
    line: base?.dark?.line || oklch(0.29, nc * 0.14, hue),
    'line-subtle': oklch(0.25, nc * 0.12, hue),
    'line-strong': oklch(0.37, nc * 0.16, hue),
    bg: base?.dark?.bg || oklch(0.16, Math.min(nc * 0.12, 0.02), hue),
    card: dCard,
    'surface-2': oklch(lch(dCard).l - 0.025, Math.min(nc * 0.12, 0.018), hue),
    'surface-3': oklch(lch(dCard).l + 0.045, Math.min(nc * 0.14, 0.02), hue),
  }
  dark['on-success'] = onColor(dark.call, 150)
  dark['on-error'] = onColor(dark.danger, 25)
  dark['success-soft'] = mix(dark.call, dCard, 0.8)
  dark['error-soft'] = mix(dark.danger, dCard, 0.83)
  return { light, dark }
}

export const toVars = (p: Palette) =>
  Object.entries(p).map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v};`).join('')

/** Inline style object (the Theme Builder preview box). */
export const toStyle = (p: Palette): Record<string, string> =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [`--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, v]))

/** brand-soft → brandSoft (for canvas / print code that reads the palette as an object). */
export const camel = (p: Palette): Palette =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()), v]))

/** Clean a config coming from the server / storage (anything odd → the default). */
export function normalise(raw: unknown): ThemeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThemeConfig>
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)
  return {
    primaryColor: isHex(r.primaryColor) ? r.primaryColor.toUpperCase() : DEFAULT_THEME.primaryColor,
    secondaryColor: isHex(r.secondaryColor) ? r.secondaryColor.toUpperCase() : null,
    accentColor: isHex(r.accentColor) ? r.accentColor.toUpperCase() : DEFAULT_THEME.accentColor,
    mode: pick(r.mode, ['light', 'dark', 'system'] as const, 'system'),
    radius: pick(r.radius, ['sharp', 'medium', 'rounded'] as const, 'medium'),
    density: pick(r.density, ['compact', 'comfortable', 'spacious'] as const, 'comfortable'),
    preset: typeof r.preset === 'string' ? r.preset.slice(0, 20) : null,
  }
}

export const sameColors = (a: ThemeConfig, b: ThemeConfig) =>
  a.primaryColor.toUpperCase() === b.primaryColor.toUpperCase() && a.accentColor.toUpperCase() === b.accentColor.toUpperCase()
  && (a.secondaryColor || '').toUpperCase() === (b.secondaryColor || '').toUpperCase()
