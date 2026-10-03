/** "5 min ago" / "5 मिनट पहले". */
export function ago(iso: string | null, lang: string) {
  if (!iso) return '—'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  const en = lang === 'en'
  if (m < 2) return en ? 'just now' : 'अभी'
  if (m < 60) return en ? `${m} min ago` : `${m} मिनट पहले`
  const h = Math.round(m / 60)
  if (h < 24) return en ? `${h} h ago` : `${h} घंटे पहले`
  const d = Math.round(h / 24)
  return en ? `${d} d ago` : `${d} दिन पहले`
}
