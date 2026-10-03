import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { admin, type AdminStats } from '../../lib/api'
import { placeName, stateName } from '../../lib/catalog'
import { trackScreen } from '../../lib/track'
import { AdminLayout, nf } from './AdminLayout'

const RANGES = [7, 30, 90] as const

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [days, setDays] = useState<number>(30)
  const [s, setS] = useState<AdminStats | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { trackScreen('admin_dashboard') }, [])
  useEffect(() => {
    setError(false)
    admin.stats(days).then(setS).catch(() => setError(true))
  }, [days])

  return (
    <AdminLayout queue={s?.queue}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <div className="flex rounded-md border border-border bg-surface p-1" role="group" aria-label={t('admin.range')}>
          {RANGES.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-text-2 aria-pressed:bg-primary aria-pressed:text-on-primary">
              {t('admin.days', { n: d })}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="rounded-md bg-surface p-4 text-error">{t('error.server')}</p>}
      {!s && !error && <div className="h-64 animate-pulse rounded-lg bg-surface" />}
      {s && (
        <div className="flex flex-col gap-4">
          {s.queue > 0 && (
            <Link to="/admin/queue" className="flex items-center justify-between rounded-lg bg-accent-soft px-4 py-3 font-semibold text-accent-ink">
              {t('admin.queueBanner', { n: s.queue })}<span>→</span>
            </Link>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label={t('admin.k.drivers')} value={s.users.drivers} sub={t('admin.k.listed', { n: nf(s.users.drivers_listed) })} />
            <Tile label={t('admin.k.owners')} value={s.users.owners} sub={t('admin.k.verified', { n: nf(s.users.verified) })} />
            <Tile label={t('admin.k.activeToday')} value={s.users.active_today} sub={t('admin.k.onlineNow', { n: nf(s.users.online_now) })} />
            <Tile label={t('admin.k.newPeriod', { n: s.days })} value={s.users.new_period} sub={t('admin.k.today', { n: nf(s.users.new_today) })} />
            <Tile label={t('admin.k.livePosts')} value={s.posts.live} sub={t('admin.k.driversWanted', { n: nf(s.posts.drivers_wanted) })} />
            <Tile label={t('admin.k.interests', { n: s.days })} value={s.interests} />
            <Tile label={t('admin.k.contacts', { n: s.days })} value={s.contacts.calls + s.contacts.whatsapp} sub={t('admin.k.callWa', { c: nf(s.contacts.calls), w: nf(s.contacts.whatsapp) })} />
            <Tile label={t('admin.k.time')} value={s.time.avg_minutes} unit={t('admin.min')} sub={t('admin.k.sessions', { n: nf(s.time.sessions) })} />
          </div>

          <Card title={t('admin.c.signups')}>
            <SignupChart data={s.signups} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t('admin.c.funnel')} sub={t('admin.c.funnelSub')}>
              <BarList items={[
                [t('admin.f.opened'), s.funnel.opened],
                [t('admin.f.otp'), s.funnel.otp_requested],
                [t('admin.f.login'), s.funnel.logged_in],
                [t('admin.f.profile'), s.funnel.profile_basic],
                [t('admin.f.action'), s.funnel.took_action],
              ]} percentOfFirst />
            </Card>
            <Card title={t('admin.c.platforms')} sub={t('admin.c.platformsSub', { pwa: nf(s.installs.pwa), apk: nf(s.installs.apk) })}>
              <BarList items={s.platforms.map((p) => [t(`admin.p.${p.platform}`, { defaultValue: p.platform }), p.devices])} />
            </Card>
          </div>

          <Card title={t('admin.c.cities')}>
            <CityTable rows={s.cities} />
          </Card>
          <p className="text-sm text-text-2">{t('admin.testNote')}</p>
        </div>
      )}
    </AdminLayout>
  )
}

function Tile({ label, value, sub, unit }: { label: string; value: number; sub?: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-text-2">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-none">
        {nf(value)}
        {unit && <small className="ml-1 text-base font-semibold text-text-2">{unit}</small>}
      </p>
      {sub && <p className="mt-1.5 text-sm text-text-2">{sub}</p>}
    </div>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {sub && <p className="text-sm text-text-2">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Daily new users: stacked columns (drivers + owners), 2px gap, legend, hover tooltip. */
function SignupChart({ data }: { data: AdminStats['signups'] }) {
  const { t, i18n } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)
  // draw at the real width so axis text stays readable on phones
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 500 ? 180 : 220, PAD_L = 28, PAD_B = 22, PAD_T = 8
  const max = Math.max(1, ...data.map((d) => d.drivers + d.owners))
  const nice = max <= 5 ? max : Math.ceil(max / 5) * 5
  const band = (W - PAD_L) / data.length
  const bw = Math.min(24, Math.max(3, band - 3))
  const y = (v: number) => (v / nice) * (H - PAD_B - PAD_T)
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(i18n.language === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' })
  const ticks = [0, Math.round(nice / 2), nice]
  const h = hover != null ? data[hover] : null
  return (
    <div className="relative" ref={box}>
      <div className="mb-2 flex gap-4 text-sm">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--chart-1)' }} />{t('role.driver')}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--chart-2)' }} />{t('role.owner')}</span>
      </div>
       <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={t('admin.c.signups')} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W} y1={H - PAD_B - y(v)} y2={H - PAD_B - y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={PAD_L - 6} y={H - PAD_B - y(v) + 4} textAnchor="end" fontSize="11" fill="var(--c-muted)">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_L + i * band + (band - bw) / 2
          const hd = y(d.drivers), ho = y(d.owners)
          const base = H - PAD_B
          const gap = d.drivers && d.owners ? 2 : 0
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              <rect x={PAD_L + i * band} y={PAD_T} width={band} height={H - PAD_B - PAD_T} fill="transparent" />
              {hover === i && <rect x={PAD_L + i * band} y={PAD_T} width={band} height={H - PAD_B - PAD_T} fill="var(--chart-grid)" opacity="0.5" />}
              {d.drivers > 0 && <Bar x={x} y={base - hd} w={bw} h={hd} fill="var(--chart-1)" round={!d.owners} />}
              {d.owners > 0 && <Bar x={x} y={base - hd - gap - ho} w={bw} h={ho} fill="var(--chart-2)" round />}
            </g>
          )
        })}
        {[0, Math.floor(data.length / 2), data.length - 1].map((i) => data[i] && (
          <text key={i} x={i === 0 ? PAD_L : i === data.length - 1 ? W : PAD_L + i * band + band / 2} y={H - 6}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--c-muted)">{fmt(data[i].day)}</text>
        ))}
      </svg>
      {h && hover != null && (
        <div className="pointer-events-none absolute top-6 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-lg"
          style={{ left: `min(calc(${((PAD_L + hover * band + band / 2) / W) * 100}% + 8px), calc(100% - 150px))` }}>
          <p className="font-bold">{fmt(h.day)}</p>
          <p>{t('role.driver')}: <strong>{h.drivers}</strong></p>
          <p>{t('role.owner')}: <strong>{h.owners}</strong></p>
        </div>
      )}
    </div>
  )
}

/** Column with a 4px rounded top and a square base. */
function Bar({ x, y, w, h, fill, round }: { x: number; y: number; w: number; h: number; fill: string; round: boolean }) {
  const r = round ? Math.min(4, h, w / 2) : 0
  return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`} fill={fill} />
}

/** Horizontal bars for a few labelled numbers (funnel, platforms). */
function BarList({ items, percentOfFirst }: { items: [string, number][]; percentOfFirst?: boolean }) {
  const max = Math.max(1, ...items.map(([, v]) => v))
  const first = items[0]?.[1] || 0
  if (!items.length) return <p className="text-sm text-text-2">—</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(([label, v]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{label}</span>
            <span className="font-semibold">{nf(v)}{percentOfFirst && first > 0 && <span className="ml-1.5 font-normal text-text-2">{Math.round((v / first) * 100)}%</span>}</span>
          </div>
          <div className="h-3 rounded-full" style={{ background: 'var(--chart-grid)' }}>
            <div className="h-3 rounded-full" style={{ width: `${(v / max) * 100}%`, background: 'var(--chart-1)', minWidth: v ? 6 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function CityTable({ rows }: { rows: AdminStats['cities'] }) {
  const { t, i18n } = useTranslation()
  if (!rows.length) return <p className="text-sm text-text-2">—</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-text-2">
          <tr><th className="py-2 font-semibold">{t('admin.city')}</th><th className="py-2 text-right font-semibold">{t('role.driver')}</th><th className="py-2 text-right font-semibold">{t('role.owner')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.district + r.state} className="border-t border-border">
              <td className="py-2">{placeName(`${r.district}, ${r.state}`, i18n.language)} <span className="text-text-2">· {stateName(r.state, i18n.language)}</span></td>
              <td className="py-2 text-right font-semibold">{nf(r.drivers)}</td>
              <td className="py-2 text-right font-semibold">{nf(r.owners)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
