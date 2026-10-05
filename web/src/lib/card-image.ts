import QRCode from 'qrcode'
import type { DriverDetails } from './api'
import { photoSrc } from './api'
import { brand, printColors } from './brand'
import { label, LICENCES, pick, VEHICLES, WHEN } from './catalog'

/**
 * The driver's "Digital Card": a 1080×1920 picture (WhatsApp Status size) with photo, vehicles,
 * licence, experience and a QR to the app. Drawn in the browser, so Hindi letters come out right.
 * No phone number is ever printed on it.
 */
export interface CardInput {
  name: string
  photoUrl?: string | null
  place: string
  verified: boolean
  driver: DriverDetails | null
  link: string          // QR + printed link (the driver's invite link)
  lang: string
}

const W = 1080
const H = 1920
const FONT = '"Mukta", "Noto Sans Devanagari", system-ui, sans-serif'
const DISPLAY = '"Anek Latin Variable", "Anek Devanagari Variable", "Mukta", system-ui, sans-serif'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Shrinks the text until it fits the width (long names). */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight: number, family: string) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px ${family}`
    if (ctx.measureText(text).width <= max) break
    s -= 4
  } while (s > 28)
  return s
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export async function drawDriverCard(c: CardInput): Promise<Blob> {
  const C = printColors()          // live brand theme (Admin → Appearance)
  const hi = c.lang !== 'en'
  const tx = (h: string, e: string) => (hi ? h : e)
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // background + header band
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = C.header
  ctx.fillRect(0, 0, W, 560)
  ctx.fillStyle = C.accent
  ctx.fillRect(0, 556, W, 8)

  // brand line
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 64px ${DISPLAY}`
  ctx.fillText(brand.name, 80, 150)
  ctx.font = `500 38px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(tx('ड्राइवर कार्ड', 'Driver card'), 80, 210)

  // facts (worked out first: the white card is as tall as what it holds)
  const d = c.driver
  const vehicles = (d?.vehicles || []).map((v) => label(VEHICLES, v as never, c.lang)).join(', ')
  const facts: [string, string][] = []
  if (vehicles) facts.push([tx('गाड़ी', 'Vehicles'), vehicles + (d?.max_wheels ? tx(` · ${d.max_wheels} चक्का तक`, ` · up to ${d.max_wheels} wheels`) : '')])
  if (d?.licence_type) facts.push([tx('लाइसेंस', 'Licence'), pick(LICENCES.find((l) => l.key === d.licence_type)?.label, c.lang)])
  if (d?.experience_years != null) facts.push([tx('अनुभव', 'Experience'), tx(`${d.experience_years} साल`, `${d.experience_years} years`)])
  if (d?.available_from) facts.push([tx('काम के लिए', 'Available'), label(WHEN, d.available_from, c.lang)])
  const shown = facts.slice(0, 4)
  const headH = 40 + 300 + 170 + (c.verified ? 70 : 0) + (c.place ? 40 : 0)   // photo, name, badge, place
  const cardH = Math.max(headH + 40 + shown.length * 96 + 30, 760)

  // white card
  const cardY = 300
  ctx.save()
  ctx.shadowColor = 'rgba(16,40,45,0.18)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 12
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 60, cardY, W - 120, cardH, 48)
  ctx.fill()
  ctx.restore()

  // photo
  const cx = W / 2
  const py = cardY + 40
  const R = 150
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, py + R, R + 10, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, py + R, R, 0, Math.PI * 2)
  ctx.clip()
  let drawn = false
  const src = photoSrc(c.photoUrl)
  if (src) {
    try {
      const img = await loadImage(src)
      const s = Math.max((2 * R) / img.width, (2 * R) / img.height)
      ctx.drawImage(img, cx - (img.width * s) / 2, py + R - (img.height * s) / 2, img.width * s, img.height * s)
      drawn = true
    } catch { /* photo blocked or missing: initials */ }
  }
  if (!drawn) {
    ctx.fillStyle = C.brandSoft
    ctx.fillRect(cx - R, py, 2 * R, 2 * R)
    ctx.fillStyle = C.brand
    ctx.font = `700 120px ${DISPLAY}`
    ctx.textAlign = 'center'
    ctx.fillText(initials(c.name), cx, py + R + 42)
    ctx.textAlign = 'left'
  }
  ctx.restore()

  // name + verified + place
  ctx.textAlign = 'center'
  ctx.fillStyle = C.ink
  fitText(ctx, c.name, W - 220, 76, 700, DISPLAY)
  ctx.fillText(c.name, cx, py + 2 * R + 110)
  let y = py + 2 * R + 170
  if (c.verified) {
    const badge = tx('✓ वेरिफाइड ड्राइवर', '✓ Verified driver')
    ctx.font = `700 36px ${FONT}`
    const bw = ctx.measureText(badge).width + 56
    ctx.fillStyle = C.successSoft
    roundRect(ctx, cx - bw / 2, y - 44, bw, 64, 32)
    ctx.fill()
    ctx.fillStyle = C.call
    ctx.fillText(badge, cx, y)
    y += 70
  }
  if (c.place) {
    ctx.fillStyle = C.muted
    ctx.font = `500 40px ${FONT}`
    ctx.fillText(`📍 ${c.place}`, cx, y)
    y += 40
  }
  ctx.textAlign = 'left'

  let fy = y + 40
  for (const [k, v] of shown) {
    ctx.fillStyle = C.bg
    roundRect(ctx, 110, fy, W - 220, 82, 22)
    ctx.fill()
    ctx.fillStyle = C.muted
    ctx.font = `500 34px ${FONT}`
    ctx.fillText(k, 145, fy + 53)
    ctx.fillStyle = C.ink
    fitText(ctx, v, W - 220 - 330, 40, 700, FONT)
    ctx.textAlign = 'right'
    ctx.fillText(v, W - 145, fy + 55)
    ctx.textAlign = 'left'
    fy += 96
  }

  // QR + call to action
  const qy = cardY + cardH + 60
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, c.link, { width: 300, margin: 1, color: { dark: C.ink, light: '#ffffff' } })
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 80, qy, 340, 340, 28)
  ctx.fill()
  ctx.drawImage(qr, 100, qy + 20, 300, 300)
  ctx.fillStyle = C.ink
  ctx.font = `700 46px ${DISPLAY}`
  const lines = hi ? ['मुझे काम दें!', `${brand.name} पर मेरी`, 'प्रोफ़ाइल देखें'] : ['Hire me!', `See my profile`, `on ${brand.name}`]
  lines.forEach((l, i) => ctx.fillText(l, 460, qy + 80 + i * 62))
  ctx.fillStyle = C.muted
  ctx.font = `500 32px ${FONT}`
  ctx.fillText(tx('QR स्कैन करें, ऐप मुफ़्त है', 'Scan the QR, the app is free'), 460, qy + 290)

  // link under the QR, then a footer band with the promise
  ctx.textAlign = 'center'
  ctx.fillStyle = C.brand
  ctx.font = `600 34px ${FONT}`
  ctx.fillText(c.link.replace(/^https?:\/\//, ''), cx, qy + 400)
  if (qy + 400 + 40 < H - 130) {   // room left (shorter cards): the promise in a footer band
    ctx.fillStyle = C.header
    ctx.fillRect(0, H - 130, W, 130)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(tx('✓ मुफ़्त  ✓ सीधे कॉल  ✓ कोई कमीशन नहीं', '✓ Free  ✓ Direct calls  ✓ No commission'), cx, H - 52)
  }

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}
