import type { DriverDetails, FleetGroup, Profile } from './api'

/** What is still missing from a profile, for the "complete your profile" card on home.
 *  Only name + place are asked at first login; everything else is filled later. */
export interface MissingItem { key: string; step: string }
export interface Completion { percent: number; missing: MissingItem[]; listable: boolean }

export function driverCompletion(p: Profile | null, d: DriverDetails | null): Completion {
  const items: (MissingItem & { done: boolean })[] = [
    { key: 'vehicles', step: 'vehicles', done: !!d?.vehicles.length },
    { key: 'when', step: 'when', done: !!d?.available_from && !!d?.languages.length },
    { key: 'licence', step: 'licence', done: !!d?.licence_type },
    { key: 'money', step: 'money', done: d?.savings_wanted != null },
    { key: 'work', step: 'work', done: !!d?.area },
    { key: 'photo', step: 'about', done: !!p?.photo_url },
  ]
  return summarise(items, !!d?.vehicles.length && !!d?.available_from)
}

export function ownerCompletion(p: Profile | null, fleet: FleetGroup[]): Completion {
  const items = [
    { key: 'fleet', step: 'fleet', done: fleet.length > 0 },
    { key: 'photo', step: 'about', done: !!p?.photo_url },
  ]
  return summarise(items, fleet.length > 0)
}

function summarise(items: (MissingItem & { done: boolean })[], listable: boolean): Completion {
  const done = items.filter((i) => i.done).length
  // name + place (asked at signup) count as the first item
  const percent = Math.round(((1 + done) / (1 + items.length)) * 100)
  return { percent, missing: items.filter((i) => !i.done).map(({ key, step }) => ({ key, step })), listable }
}
