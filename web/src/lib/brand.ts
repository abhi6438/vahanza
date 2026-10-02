// Brand settings come from /brands/<id>.json, picked at build time with VITE_BRAND.
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

const toVars = (p: Palette) =>
  Object.entries(p)
    .map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v};`)
    .join('')

/** Writes the brand colours as CSS variables for light, dark (system) and an explicit dark choice. */
export function applyBrandColors() {
  const css = `
    :root{${toVars(brand.colors.light)}color-scheme:light}
    @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${toVars(brand.colors.dark)}color-scheme:dark}}
    :root[data-theme="dark"]{${toVars(brand.colors.dark)}color-scheme:dark}
  `
  const el = document.createElement('style')
  el.id = 'brand-colors'
  el.textContent = css
  document.head.appendChild(el)
  document.title = brand.name
}
