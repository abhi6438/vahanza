/** Helpers for the driver's work history ("काम का अनुभव"). */
import type { HistoryEntry, HistoryStatus, HistorySummary, PublicHistory } from './api'
import { label, VEHICLES } from './catalog'
import { publicBase } from './share'

export const MONTHS: [string, string][] = [
  ['जन', 'Jan'], ['फ़र', 'Feb'], ['मार्च', 'Mar'], ['अप्रै', 'Apr'], ['मई', 'May'], ['जून', 'Jun'],
  ['जुला', 'Jul'], ['अग', 'Aug'], ['सित', 'Sep'], ['अक्टू', 'Oct'], ['नव', 'Nov'], ['दिस', 'Dec'],
]

/** "2023-01-01" → "जन 2023" */
export function monthName(iso: string, lang: string) {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1][lang === 'en' ? 1 : 0]} ${y}`
}

/** "जन 2023 – मार्च 2025" / "जन 2023 से अभी तक" */
export function period(start: string, end: string | null, lang: string) {
  if (!end) return lang === 'en' ? `${monthName(start, lang)} – now` : `${monthName(start, lang)} से अभी तक`
  return `${monthName(start, lang)} – ${monthName(end, lang)}`
}

export function monthsBetween(start: string, end: string | null) {
  const [y1, m1] = start.split('-').map(Number)
  const now = new Date()
  const [y2, m2] = end ? end.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1]
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1)
}

/** 27 → "2 साल 3 महीने" */
export function duration(months: number, lang: string) {
  const y = Math.floor(months / 12)
  const m = months % 12
  const en = lang === 'en'
  const parts = []
  if (y) parts.push(en ? `${y} yr${y > 1 ? 's' : ''}` : `${y} साल`)
  if (m) parts.push(en ? `${m} mo` : `${m} महीने`)
  return parts.join(' ') || (en ? '1 mo' : '1 महीना')
}

export const isConfirmed = (s: HistoryStatus) => s === 'confirmed' || s === 'admin_ok'

/** The badge: who vouches for this entry. */
export function statusLook(s: HistoryStatus): { key: string; tone: 'success' | 'primary' | 'warning' | 'error' | 'neutral' } {
  switch (s) {
    case 'confirmed': return { key: 'confirmed', tone: 'success' }
    case 'admin_ok': return { key: 'adminOk', tone: 'success' }
    case 'needs_fix': return { key: 'needsFix', tone: 'warning' }
    case 'owner_fixed': return { key: 'ownerFixed', tone: 'primary' }
    case 'disputed': return { key: 'disputed', tone: 'error' }
    case 'admin_rejected': return { key: 'rejected', tone: 'error' }
    default: return { key: 'pending', tone: 'neutral' }
  }
}

/** Who the entry is with, as people recognise it: firm, else the owner's name. */
export const whoName = (e: Pick<HistoryEntry, 'firm_name' | 'owner_name'> | Pick<PublicHistory, 'firm_name' | 'owner_name'>) =>
  e.firm_name || e.owner_name || ''

export const historyLink = (token: string) => `${publicBase()}/h/${token}`

/** WhatsApp text the driver sends to an owner who is not on the app. */
export function askText(firstName: string, e: { vehicle: string; start_month: string; end_month: string | null }, token: string, lang: string) {
  const v = label(VEHICLES, e.vehicle as never, lang)
  const when = period(e.start_month, e.end_month, lang)
  return lang === 'en'
    ? `Namaste, I am ${firstName}. I drove your ${v} (${when}). Please confirm on Vahanza with one tap — it helps me get work: ${historyLink(token)}`
    : `नमस्ते, मैं ${firstName}। मैंने आपकी ${v} चलाई थी (${when})। Vahanza पर एक टैप में पुष्टि कर दीजिए, इससे मुझे काम मिलने में मदद होगी: ${historyLink(token)}`
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

export const emptySummary: HistorySummary = { count: 0, confirmed: 0, confirmed_years: 0, rehire: 0 }
