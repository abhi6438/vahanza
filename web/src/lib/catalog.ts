/** Fixed option lists used by setup screens and cards. Labels are [Hindi, English]. */
import places from '@shared/places.json'

export type Pair = readonly [string, string]
export type Opt<K extends string = string> = { key: K; label: Pair; sub?: Pair }

export const pick = (p: Pair | undefined, lang: string) => (p ? (lang === 'en' ? p[1] : p[0]) : '')

export type VehicleKey = 'truck' | 'trailer' | 'bus' | 'car' | 'jcb' | 'tractor' | 'auto' | 'pickup'
export const VEHICLES: Opt<VehicleKey>[] = [
  { key: 'truck', label: ['ट्रक', 'Truck'] },
  { key: 'trailer', label: ['ट्रेलर', 'Trailer'] },
  { key: 'bus', label: ['बस', 'Bus'] },
  { key: 'pickup', label: ['पिकअप', 'Pickup'] },
  { key: 'jcb', label: ['जेसीबी', 'JCB'] },
  { key: 'tractor', label: ['ट्रैक्टर', 'Tractor'] },
  { key: 'car', label: ['कार', 'Car'] },
  { key: 'auto', label: ['ऑटो', 'Auto'] },
]
export const WHEELED: VehicleKey[] = ['truck', 'trailer', 'bus']
export const WHEELS = [6, 10, 12, 14, 16, 18, 22] as const

export const LICENCES: (Opt<'LMV' | 'HMV' | 'Transport'> & { art: VehicleKey })[] = [
  { key: 'LMV', label: ['छोटी गाड़ी (LMV)', 'Light vehicle (LMV)'], sub: ['कार, ऑटो, पिकअप', 'Car, auto, pickup'], art: 'car' },
  { key: 'HMV', label: ['भारी गाड़ी (HMV)', 'Heavy vehicle (HMV)'], sub: ['ट्रक, बस, टैंकर', 'Truck, bus, tanker'], art: 'truck' },
  { key: 'Transport', label: ['कमर्शियल / बैज', 'Commercial / badge'], sub: ['जेसीबी, ट्रैक्टर, सवारी', 'JCB, tractor, passengers'], art: 'jcb' },
]

export const PAY: Opt<'fix' | 'trip' | 'km' | 'bhatta' | 'comm'>[] = [
  { key: 'fix', label: ['पगार (महीना)', 'Fixed monthly pay'] },
  { key: 'trip', label: ['हर ट्रिप पर', 'Per trip'] },
  { key: 'km', label: ['किलोमीटर पर', 'Per km'] },
  { key: 'bhatta', label: ['रोज़ का भत्ता', 'Daily allowance'] },
  { key: 'comm', label: ['भाड़े में हिस्सा', 'Share of freight'] },
]

export const WORK: Opt<'full' | 'day' | 'trip'>[] = [
  { key: 'full', label: ['पक्की नौकरी', 'Full-time'] },
  { key: 'day', label: ['रोज़ का काम', 'Daily work'] },
  { key: 'trip', label: ['एक ट्रिप', 'One trip'] },
]

export const AREA: Opt<'local' | 'dist' | 'state' | 'india'>[] = [
  { key: 'local', label: ['शहर में', 'In my city'] },
  { key: 'dist', label: ['ज़िले में', 'Within district'] },
  { key: 'state', label: ['राज्य में', 'Within state'] },
  { key: 'india', label: ['पूरा भारत', 'All India'] },
]

export const WHEN: Opt<'now' | 'w1' | 'd15' | 'm1'>[] = [
  { key: 'now', label: ['तुरंत', 'Right now'] },
  { key: 'w1', label: ['हफ़्ते भर में', 'Within a week'] },
  { key: 'd15', label: ['15 दिन में', 'In 15 days'] },
  { key: 'm1', label: ['1 महीने में', 'In 1 month'] },
]

export const LANGS: Opt[] = [
  { key: 'hi', label: ['हिंदी', 'Hindi'] },
  { key: 'bg', label: ['बघेली', 'Bagheli'] },
  { key: 'bho', label: ['भोजपुरी', 'Bhojpuri'] },
  { key: 'cg', label: ['छत्तीसगढ़ी', 'Chhattisgarhi'] },
  { key: 'en', label: ['अंग्रेज़ी', 'English'] },
  { key: 'ur', label: ['उर्दू', 'Urdu'] },
  { key: 'pa', label: ['पंजाबी', 'Punjabi'] },
  { key: 'mr', label: ['मराठी', 'Marathi'] },
  { key: 'gu', label: ['गुजराती', 'Gujarati'] },
  { key: 'bn', label: ['बांग्ला', 'Bengali'] },
  { key: 'or', label: ['ओड़िया', 'Odia'] },
  { key: 'te', label: ['तेलुगु', 'Telugu'] },
]

export const label = <K extends string>(list: Opt<K>[], key: K | null | undefined, lang: string) =>
  pick(list.find((o) => o.key === key)?.label, lang)

// ---- places ----
export interface PlaceOption { value: string; en: string; hi: string | null; state: string; state_hi?: string | null }
const P = places as { states: Record<string, string>; cities: { en: string; hi: string; state: string }[] }
export const CURATED: PlaceOption[] = P.cities.map((c) => ({ value: `${c.en}, ${c.state}`, en: c.en, hi: c.hi, state: c.state, state_hi: P.states[c.state] }))

/** "Raipur, Chhattisgarh" → "रायपुर" (Hindi when known). */
export function placeName(value: string, lang: string): string {
  const c = CURATED.find((x) => x.value === value)
  if (c) return lang === 'en' ? c.en : c.hi || c.en
  return value.split(',')[0]
}
/** "Rewa" (English district from the server) → "रीवा" when known. */
export function districtName(district: string, lang: string): string {
  if (lang === 'en') return district
  return CURATED.find((c) => c.en.toLowerCase() === district.toLowerCase())?.hi || district
}
export const stateName = (state: string, lang: string) => (lang === 'en' ? state : P.states[state] || state)

export function searchCurated(q: string, preferState?: string | null, limit = 12): PlaceOption[] {
  const s = q.trim().toLowerCase()
  let list = CURATED
  if (s) {
    const starts = list.filter((c) => c.en.toLowerCase().startsWith(s) || (c.hi || '').startsWith(s))
    const contains = list.filter((c) => !starts.includes(c) && (c.en.toLowerCase().includes(s) || (c.hi || '').includes(s)))
    list = [...starts, ...contains]
  } else if (preferState) {
    list = [...list.filter((c) => c.state === preferState), ...list.filter((c) => c.state !== preferState)]
  }
  return list.slice(0, limit)
}

export const rupees = (n: number) => '₹' + n.toLocaleString('en-IN')

// ---- posts ----
export const COVERAGE: Opt<'local' | 'state' | 'near' | 'india'>[] = [
  { key: 'local', label: ['शहर में लोकल', 'Local in city'] },
  { key: 'state', label: ['राज्य के अंदर', 'Within state'] },
  { key: 'near', label: ['आस-पास के राज्य', 'Nearby states'] },
  { key: 'india', label: ['पूरा भारत', 'All India'] },
]

export const FACILITIES: Opt[] = [
  { key: 'stay', label: ['रहने की जगह', 'Stay'] },
  { key: 'food', label: ['खाना', 'Meals'] },
  { key: 'off', label: ['साप्ताहिक छुट्टी', 'Weekly off'] },
  { key: 'bhatta', label: ['ट्रिप भत्ता', 'Trip allowance'] },
  { key: 'ot', label: ['ओवरटाइम', 'Overtime pay'] },
  { key: 'rech', label: ['मोबाइल रिचार्ज', 'Mobile recharge'] },
  { key: 'ins', label: ['दुर्घटना बीमा', 'Accident insurance'] },
  { key: 'pf', label: ['PF / ESI', 'PF / ESI'] },
  { key: 'bonus', label: ['त्योहार बोनस', 'Festival bonus'] },
  { key: 'uni', label: ['वर्दी', 'Uniform'] },
  { key: 'adv', label: ['एडवांस सुविधा', 'Salary advance'] },
]

/** Pay types in a post: default value, step for the − / + buttons, and how to show the amount. */
export const PAY_UNIT: Record<string, { def: number; step: number; min: number; max: number; fmt: (v: number, lang: string) => string }> = {
  fix: { def: 8000, step: 500, min: 500, max: 200000, fmt: (v, l) => `${rupees(v)}${l === 'en' ? '/month' : '/महीना'}` },
  trip: { def: 2000, step: 100, min: 50, max: 50000, fmt: (v, l) => `${rupees(v)}${l === 'en' ? '/trip' : '/ट्रिप'}` },
  km: { def: 2, step: 0.5, min: 0.5, max: 50, fmt: (v, l) => `₹${v}${l === 'en' ? '/km' : '/कि.मी.'}` },
  bhatta: { def: 250, step: 50, min: 50, max: 5000, fmt: (v, l) => `${rupees(v)}${l === 'en' ? '/day' : '/दिन'}` },
  comm: { def: 5, step: 1, min: 1, max: 50, fmt: (v, l) => (l === 'en' ? `${v}% of freight` : `भाड़े का ${v}%`) },
}
