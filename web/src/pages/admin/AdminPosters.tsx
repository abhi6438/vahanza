import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CityPicker } from '../../components/places'
import { useToast } from '../../components/toast'
import { Button, Card, Dialog, EmptyState, ErrorState, Icon, Note, SectionTitle, Skeleton } from '../../components/ui'
import { TextField } from '../../components/form'
import { admin, type Poster } from '../../lib/api'
import { brand } from '../../lib/brand'
import { placeName } from '../../lib/catalog'
import { posterLink } from '../../lib/share'
import { ago } from '../../lib/time'
import { track, trackScreen } from '../../lib/track'
import { AdminLayout, nf } from './AdminLayout'

/**
 * QR posters for dhabas, transport nagar, petrol pumps, RTO, union offices.
 * Each poster has its own code, so the table shows which place brings people.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

async function printPoster(p: Poster, city: string) {
  const link = posterLink(p.code)
  const QRCode = (await import('qrcode')).default
  const qr = await QRCode.toDataURL(link, { width: 640, margin: 1, color: { dark: '#13252A', light: '#ffffff' } })
  const c = brand.colors.light
  const html = `<!doctype html><html lang="hi"><head><meta charset="utf-8"><title>${esc(brand.name)} poster ${esc(p.code)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Mukta:wght@500;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;font-family:Mukta,sans-serif;color:${c.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.p{width:210mm;height:297mm;display:flex;flex-direction:column;overflow:hidden}
.top{background:${c.header};color:#fff;padding:14mm 14mm 10mm}.brand{font:800 34pt 'Baloo 2','Mukta',sans-serif;margin:0}.tag{font-size:15pt;opacity:.9;margin:2mm 0 0}
.band{height:3mm;background:${c.accent}}
.mid{flex:1;padding:10mm 14mm;display:flex;flex-direction:column;justify-content:space-between}
h1{font:800 42pt/1.1 'Baloo 2','Mukta',sans-serif;margin:0}h2{font:600 22pt/1.2 'Baloo 2','Mukta',sans-serif;margin:4mm 0 0;color:${c.brand}}
.row{display:flex;gap:10mm;align-items:center}.qr{flex:none;width:96mm;height:96mm;border:2mm solid ${c.ink};border-radius:5mm;padding:2mm;background:#fff}
.qr img{width:100%;height:100%;display:block}ol{margin:0;padding:0;list-style:none;font-size:20pt;line-height:1.35}
ol li{display:flex;gap:4mm;margin-bottom:5mm}ol b{display:inline-grid;place-items:center;min-width:11mm;height:11mm;border-radius:50%;background:${c.accent};color:#2a1c00;font-size:15pt}
.free{background:${c.accentSoft};border-radius:5mm;padding:6mm 8mm;font-size:17pt;font-weight:700;color:${c.accentInk}}
.foot{padding:5mm 14mm;font-size:11pt;color:${c.muted};display:flex;justify-content:space-between}
</style></head><body><div class="p">
<div class="top"><p class="brand">${esc(brand.name)}</p><p class="tag">${esc(brand.taglineHi)}</p></div><div class="band"></div>
<div class="mid"><h1>ड्राइवर भाइयों के लिए<br>पास में काम!</h1><h2>गाड़ी मालिक: अच्छे ड्राइवर यहीं ढूंढें${city ? ` · ${esc(city)}` : ''}</h2>
<div class="row"><div class="qr"><img src="${qr}" alt="QR"></div><ol>
<li><b>1</b><span>फ़ोन के कैमरे से QR स्कैन करें</span></li><li><b>2</b><span>अपने शहर का काम / ड्राइवर देखें</span></li><li><b>3</b><span>सीधे कॉल करें, कोई बिचौलिया नहीं</span></li></ol></div>
<div class="free">✓ बिल्कुल मुफ़्त · ✓ कोई कमीशन नहीं · ✓ हिंदी में</div></div>
<div class="foot"><span>${esc(link.replace(/^https?:\/\//, ''))}</span><span>${esc(p.place)} · ${esc(p.code)}</span></div>
</div><script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  track('poster_print', { code: p.code })
  return true
}

export default function AdminPosters() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const lang = i18n.language
  const [items, setItems] = useState<Poster[] | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState('')
  const [city, setCity] = useState<{ district: string; state: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    trackScreen('admin_posters')
    admin.posters().then((r) => setItems(r.items)).catch(() => setError(true))
  }, [])

  const cityOf = (p: Poster) => (p.district && p.state ? placeName(`${p.district}, ${p.state}`, lang) : '')

  async function create() {
    setBusy(true)
    try {
      const p = await admin.newPoster({ place: place.trim(), district: city?.district, state: city?.state })
      setItems((cur) => [p, ...(cur || [])])
      setOpen(false)
      setPlace('')
      setCity(null)
      toast(t('poster.made'), { tone: 'success' })
      if (!(await printPoster(p, cityOf(p)))) toast(t('poster.popup'), { tone: 'error' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  async function copy(p: Poster) {
    try { await navigator.clipboard.writeText(posterLink(p.code)); toast(t('invite.copied'), { tone: 'success' }) } catch { /* ignore */ }
  }

  return (
    <AdminLayout actions={<Button variant="action" icon={Icon.plus} onClick={() => setOpen(true)}>{t('poster.new')}</Button>}>
      <div className="flex flex-col gap-4">
        <Note icon={Icon.qr}>{t('poster.what')}</Note>
        <div className="lg:hidden"><Button variant="action" block icon={Icon.plus} onClick={() => setOpen(true)}>{t('poster.new')}</Button></div>
        <SectionTitle title={t('poster.list')} right={items && <span className="text-sm text-text-2">{nf(items.length)}</span>} />
        {error && <ErrorState onRetry={() => window.location.reload()} />}
        {!items && !error && <Skeleton className="h-40" />}
        {items?.length === 0 && <EmptyState icon={Icon.qr} title={t('poster.emptyTitle')} body={t('poster.emptyBody')} />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items?.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="grid size-ctl-md shrink-0 place-items-center rounded-md bg-primary-soft text-[length:var(--icon-size-md)] text-primary">{Icon.qr}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.place}</p>
                  <p className="truncate text-sm text-text-2">{[cityOf(p), p.code, ago(p.created_at, lang)].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-surface-2 py-2"><dt className="text-xs text-text-2">{t('poster.opened')}</dt><dd className="text-xl font-semibold">{nf(p.opened)}</dd></div>
                <div className="rounded-md bg-surface-2 py-2"><dt className="text-xs text-text-2">{t('poster.joined')}</dt><dd className="text-xl font-semibold text-success">{nf(p.joined)}</dd></div>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" block icon={Icon.print} onClick={() => void printPoster(p, cityOf(p))}>{t('poster.print')}</Button>
                <Button variant="outline" size="sm" aria-label={t('invite.copy')} title={t('invite.copy')} className="shrink-0 !px-3" onClick={() => void copy(p)}>{Icon.copy}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('poster.new')} size="lg"
        footer={<Button variant="action" block loading={busy} disabled={place.trim().length < 2} icon={Icon.print} onClick={() => void create()}>{t('poster.makePrint')}</Button>}>
        <label className="mb-1.5 block font-semibold">{t('poster.place')}</label>
        <TextField value={place} onChange={setPlace} label={t('poster.place')} placeholder={t('poster.placePh')} maxLength={80} />
        <p className="mb-1.5 mt-5 font-semibold">{t('poster.city')} <span className="font-normal text-text-2">({t('optional')})</span></p>
        {city
          ? <div className="flex items-center gap-2 rounded-md border border-primary bg-primary-soft px-3 py-2.5"><span className="flex-1 font-semibold">{placeName(`${city.district}, ${city.state}`, lang)}</span><button type="button" className="font-semibold text-primary" onClick={() => setCity(null)}>{t('change')}</button></div>
          : <CityPicker multi={false} value={[]} onToggle={(_, h) => setCity({ district: h.en, state: h.state })} />}
      </Dialog>
    </AdminLayout>
  )
}
