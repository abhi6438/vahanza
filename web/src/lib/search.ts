/**
 * One search + filter for the four lists (owner → drivers, driver → jobs, and the no-login versions).
 * The state is plain data; it becomes query parameters for the API (see api/vz/search.py) and is
 * remembered on this device per list (the search text is not remembered).
 */
import { useEffect, useState } from 'react'

export type Sort = 'near' | 'new' | 'pay' | 'rating'
export type Radius = 0 | 25 | 50 | 100
export interface Place { district: string; state: string }

interface Base {
  q: string
  place: Place | null
  /** null = the place only goes first (nothing hidden); 0 = any distance */
  radius: Radius | null
  sort: Sort
  vehicle: string | null
  wheels: number | null
  verified: boolean
}
export interface DriverQuery extends Base {
  licence: 'LMV' | 'HMV' | 'Transport' | null
  exp_min: number | null
  savings_max: number | null
  available: 'now' | 'w1' | 'd15' | 'm1' | null
  rating_min: number | null
  langs: string[]
}
export interface JobQuery extends Base {
  savings_min: number | null
  work: string[]
  coverage: string[]
  facilities: string[]
  new_days: number | null
}
export type AnyQuery = DriverQuery | JobQuery
export type ListKind = 'drivers' | 'jobs'

const base: Base = { q: '', place: null, radius: null, sort: 'near', vehicle: null, wheels: null, verified: false }
export const EMPTY_DRIVERS: DriverQuery = { ...base, licence: null, exp_min: null, savings_max: null, available: null, rating_min: null, langs: [] }
export const EMPTY_JOBS: JobQuery = { ...base, savings_min: null, work: [], coverage: [], facilities: [], new_days: null }
export const emptyFor = (kind: ListKind): AnyQuery => (kind === 'drivers' ? EMPTY_DRIVERS : EMPTY_JOBS)

export const RADII: Radius[] = [25, 50, 100, 0]
export const DEFAULT_RADIUS: Radius = 50
export const EXP_STEPS = [1, 3, 5, 10]
export const SAVINGS_MAX_STEPS = [10000, 15000, 20000, 25000, 30000]
export const SAVINGS_MIN_STEPS = [10000, 15000, 20000, 25000]

/** Query parameters for the API (only what is set). */
export function toParams(q: AnyQuery, extra: { offset?: number; limit?: number } = {}): URLSearchParams {
  const p = new URLSearchParams()
  const set = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) return
    p.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  set('q', q.q.trim())
  if (q.place) {
    if (q.radius === null) set('district', q.place.district)          // that city first, nothing hidden
    else { set('place', `${q.place.district}, ${q.place.state}`); p.set('radius', String(q.radius)) }
  }
  if (q.sort !== 'near') set('sort', q.sort)
  set('vehicle', q.vehicle)
  set('wheels', q.wheels)
  set('verified', q.verified)
  if ('licence' in q) {
    set('licence', q.licence); set('exp_min', q.exp_min); set('savings_max', q.savings_max)
    set('available', q.available); set('rating_min', q.rating_min); set('langs', q.langs)
  } else {
    set('savings_min', q.savings_min); set('work', q.work); set('coverage', q.coverage)
    set('facilities', q.facilities); set('new_days', q.new_days)
  }
  if (extra.offset) p.set('offset', String(extra.offset))
  if (extra.limit) p.set('limit', String(extra.limit))
  return p
}

/** Filters set in the sheet (not the search text, not the vehicle row): the number on the Filter button. */
export function sheetCount(q: AnyQuery): number {
  let n = 0
  if (q.place && q.radius !== null) n++
  if (q.sort !== 'near') n++
  if (q.wheels) n++
  if (q.verified) n++
  if ('licence' in q) {
    n += [q.licence, q.exp_min, q.savings_max, q.available, q.rating_min].filter((v) => v !== null).length + (q.langs.length ? 1 : 0)
  } else {
    n += [q.savings_min, q.new_days].filter((v) => v !== null).length + [q.work, q.coverage, q.facilities].filter((v) => v.length).length
  }
  return n
}

export const isFiltered = (q: AnyQuery) => sheetCount(q) > 0 || !!q.q.trim() || !!q.vehicle || (!!q.place && q.radius !== null)

/** Clear everything except the public pages' city (that one is chosen on its own chip). */
export const cleared = <T extends AnyQuery>(kind: ListKind, q: T, keepPlace = false): T =>
  ({ ...emptyFor(kind), ...(keepPlace ? { place: q.place, radius: null } : {}) }) as T

// ---- remembered on this device ----
const KEY = (scope: string) => `vz-filter-${scope}`
function load<T extends AnyQuery>(scope: string, empty: T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(scope)) || 'null')
    if (raw && typeof raw === 'object') return { ...empty, ...raw, q: '' }
  } catch { /* storage blocked */ }
  return empty
}
function save(scope: string, q: AnyQuery) {
  try { localStorage.setItem(KEY(scope), JSON.stringify({ ...q, q: '' })) } catch { /* storage blocked */ }
}

/** [query, setQuery] remembered per list on this device. */
export function useListQuery<T extends AnyQuery>(scope: string, empty: T, init?: (q: T) => T) {
  const [q, setQ] = useState<T>(() => (init ? init(load(scope, empty)) : load(scope, empty)))
  useEffect(() => { save(scope, q) }, [scope, q])
  return [q, setQ] as const
}
