// Brand settings come from /brands/<id>.json, picked at build time with VITE_BRAND.
// Colours can be changed at runtime by an admin (Settings → Appearance): see lib/brand-theme.ts.
type Palette = Record<string, string>
export interface Brand {
  id: string
  name: string
  nameHi: string
  taglineHi: string
  taglineEn: string
  appId: string
  supportPhone: string
  grievanceOfficer: { name: string; email: string }
  colors: { light: Palette; dark: Palette }
  languages: string[]
}

const all = import.meta.glob<Brand>('@brands/*.json', { eager: true, import: 'default' })
const found = Object.values(all).find((b) => b.id === __BRAND_ID__)
if (!found) throw new Error(`Brand "${__BRAND_ID__}" not found in /brands`)
export const brand: Brand = found

import { camel, generate, normalise, sameColors, toVars, type Generated, type Palette as Pal, type ThemeConfig } from './brand-theme'
import { setBrandMode } from './theme'

/** The brand's own look (brands/<id>.json) as a theme config: used until an admin publishes another. */
export const brandDefault: ThemeConfig = {
  primaryColor: brand.colors.light.brand.toUpperCase(),
  secondaryColor: (brand.colors.light.header || '').toUpperCase() || null,
  accentColor: brand.colors.light.accent.toUpperCase(),
  mode: 'system', radius: 'medium', density: 'comfortable', preset: 'brand',
}

/** All --c-* values for a config. The brand default keeps the exact hand-tuned JSON colours. */
export function paletteFor(cfg: ThemeConfig | null): Generated {
  const c = cfg || brandDefault
  return sameColors(c, brandDefault) ? generate(c, brand.colors as { light: Pal; dark: Pal }) : generate(c)
}

const CACHE = 'vz-theme-published'
let current: { config: ThemeConfig; palette: Generated } = { config: brandDefault, palette: paletteFor(null) }
export const currentTheme = () => current
/** Light palette of the live theme with camelCase keys (Digital Card image, printed posters). */
export const printColors = () => camel(current.palette.light)
export const THEME_EVENT = 'vz-brand-theme'

/** Writes the palette for light, dark (phone setting) and an explicit dark choice, plus radius / density. */
export function applyBrandTheme(cfg: ThemeConfig | null) {
  const config = cfg ? normalise(cfg) : brandDefault
  const palette = paletteFor(cfg ? config : null)
  current = { config, palette }
  const css = `
    :root{${toVars(palette.light)}color-scheme:light}
    @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${toVars(palette.dark)}color-scheme:dark}}
    :root[data-theme="dark"]{${toVars(palette.dark)}color-scheme:dark}
  `
  let el = document.getElementById('brand-colors') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'brand-colors'
    document.head.appendChild(el)
  }
  el.textContent = css
  const root = document.documentElement
  root.dataset.radius = config.radius
  root.dataset.density = config.density
  setBrandMode(config.mode)
  // browser / Android status bar colour follows the header
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
  meta.content = palette.light.header
  window.dispatchEvent(new Event(THEME_EVENT))
}

/** Boot: the last published theme seen on this device (no flash), then the live one from the server. */
export function applyBrandColors() {
  let cached: ThemeConfig | null = null
  try { const raw = localStorage.getItem(CACHE); if (raw) cached = normalise(JSON.parse(raw)) } catch { /* storage blocked */ }
  applyBrandTheme(cached)
  document.title = brand.name
}

/** Fetch the published theme (no login needed) and apply it if it changed. */
export async function refreshBrandTheme(fetcher: () => Promise<{ theme: unknown | null }>) {
  try {
    const { theme } = await fetcher()
    const next = theme ? normalise(theme) : null
    try {
      if (next) localStorage.setItem(CACHE, JSON.stringify(next))
      else localStorage.removeItem(CACHE)
    } catch { /* storage blocked */ }
    if (JSON.stringify(next || brandDefault) !== JSON.stringify(current.config)) applyBrandTheme(next)
  } catch { /* offline: keep the cached theme */ }
}
