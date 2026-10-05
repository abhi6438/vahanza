/**
 * Design-system primitives. Pages compose these instead of writing their own button / card / state styles.
 * Colours only through tokens (see styles.css); sizes only from the scale.
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import { pushOverlay } from '../lib/layout'
import { isDarkNow, saveTheme } from '../lib/theme'
import { track } from '../lib/track'

// ---------------------------------------------------------------- icons (one set, 24px grid, 2px stroke, scale with text)
const svg = (d: ReactNode, fill = false) => (
  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{d}</svg>
)
export const Icon = {
  back: svg(<path d="M15 5l-7 7 7 7" />),
  chevron: svg(<path d="M9 5l7 7-7 7" />),
  down: svg(<path d="M5 9l7 7 7-7" />),
  close: svg(<path d="M6 6l12 12M18 6L6 18" />),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  settings: svg(<><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>),
  pin: svg(<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  search: svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  home: svg(<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  list: svg(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />),
  wrench: svg(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />),
  user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" /></>),
  users: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.8 3.3-6 6.5-6s5.7 2.2 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2c1.9.8 3 2.8 3.5 5.8" /></>),
  heart: svg(<path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z" />),
  sparkle: svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />),
  whatsapp: svg(<><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2z" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />),
  phone: svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />),
  bell: svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  logout: svg(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>),
  globe: svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></>),
  palette: svg(<><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-1.2-1-1.6-1-2.6 0-.9.8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>),
  shield: svg(<><path d="M12 3l8 3v6c0 4.6-3.3 8.3-8 9-4.7-.7-8-4.4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>),
  help: svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17h.01" /></>),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  alert: svg(<><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></>),
  ban: svg(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>),
  doc: svg(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  briefcase: svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>),
  star: svg(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />, true),
  truck: svg(<><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  upload: svg(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>),
  chart: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  inbox: svg(<><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>),
  refresh: svg(<><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" /></>),
  share: svg(<><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>),
  mic: svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  qr: svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>),
  gift: svg(<><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8c-1.5-3.5-6-4-6-1.5S10 8 12 8zM12 8c1.5-3.5 6-4 6-1.5S14 8 12 8z" /></>),
  eye: svg(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  idcard: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.2c.6-1.6 1.8-2.5 3.2-2.5s2.6.9 3.2 2.5M14.5 10h4M14.5 13.5h3" /></>),
  download: svg(<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" /></>),
  print: svg(<><path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></>),
  copy: svg(<><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>),
  wifiOff: svg(<><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5.1" /><path d="M12 20h.01" /></>),
}

// ---------------------------------------------------------------- buttons
type Variant = 'action' | 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'whatsapp'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  action: 'bg-action text-on-action hover:brightness-[1.04] active:brightness-95',
  primary: 'bg-primary text-on-primary hover:brightness-110 active:brightness-95',
  outline: 'border border-border bg-surface text-text hover:bg-surface-2 active:bg-surface-2',
  ghost: 'text-primary hover:bg-primary-soft active:bg-primary-soft',
  danger: 'border border-border bg-surface text-error hover:bg-error-soft',
  success: 'bg-success text-on-success hover:brightness-110 active:brightness-95',
  whatsapp: 'border border-border bg-surface text-text hover:bg-surface-2 [&>svg]:text-whatsapp',
}
const SIZE: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5 rounded-sm',
  md: 'min-h-11 px-4 text-base gap-2 rounded-md',
  lg: 'min-h-13 px-5 text-lg gap-2 rounded-md',
}
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false) {
  return `inline-flex items-center justify-center font-semibold transition-[filter,background-color] duration-150 select-none [&>svg]:shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${block ? 'w-full' : ''}`
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean; icon?: ReactNode; loading?: boolean }
export function Button({ variant = 'primary', size = 'md', block, icon, loading, className = '', children, disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={`${buttonClass(variant, size, block)} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', size = 'md', block, icon, className = '', children, ...rest }: LinkProps & { variant?: Variant; size?: Size; block?: boolean; icon?: ReactNode }) {
  return <Link className={`${buttonClass(variant, size, block)} ${className}`} {...rest}>{icon}{children}</Link>
}

/** Square icon-only button. Always has an accessible label. */
export function IconButton({ label, children, tone = 'plain', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'plain' | 'onDark' | 'outline' }) {
  const look = tone === 'onDark' ? 'text-white hover:bg-white/15 active:bg-white/20' : tone === 'outline' ? 'border border-border bg-surface text-text hover:bg-surface-2' : 'text-text-2 hover:bg-surface-2 hover:text-text'
  return (
    <button type="button" aria-label={label} title={label} className={`relative grid size-11 shrink-0 place-items-center rounded-md text-[1.1rem] transition-colors ${look} ${className}`} {...rest}>
      {children}
    </button>
  )
}

/** Kept for older screens: full-width large button. */
export function BigButton({ variant = 'primary', ...rest }: Omit<BtnProps, 'variant'> & { variant?: 'primary' | 'secondary' }) {
  return <Button size="lg" block variant={variant === 'primary' ? 'primary' : 'outline'} {...rest} />
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`inline-block size-[1.1em] animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />
}

// ---------------------------------------------------------------- surfaces
export function Card({ children, className = '', as: As = 'section', pad = true, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div'; pad?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return <As className={`rounded-lg border border-border bg-surface shadow-sm ${pad ? 'p-4 md:p-5' : ''} ${className}`} {...rest}>{children}</As>
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'action'
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  error: 'bg-error-soft text-error',
  action: 'bg-action text-on-action',
}
/** Small status pill / tag. */
export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-5 ${TONE[tone]} ${className}`}>{icon}{children}</span>
}

/** Selectable filter chip (aria-pressed). */
export function Chip({ selected, onClick, children, icon, className = '' }: { selected: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${selected ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:bg-surface-2'} ${className}`}>
      {icon}{children}
    </button>
  )
}

// ---------------------------------------------------------------- headings used inside pages
export const H = ({ children }: { children: ReactNode }) => <h1 className="font-display text-2xl font-bold md:text-3xl">{children}</h1>
export const Sub = ({ children }: { children: ReactNode }) => <p className="mb-5 mt-1 text-text-2">{children}</p>

export function SectionTitle({ title, sub, right, className = '' }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold md:text-xl">{title}</h2>
        {sub && <p className="text-sm text-text-2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// ---------------------------------------------------------------- states
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

/** Placeholder cards while a list loads; same grid as the real list so nothing jumps. */
export function CardSkeletons({ count = 3, height = 'h-56' }: { count?: number; height?: string }) {
  const { t } = useTranslation()
  return (
    <>
      <span className="sr-only" role="status">{t('state.loading')}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className={`rounded-lg border border-border bg-surface p-4 ${height}`}>
          <div className="flex gap-3"><Skeleton className="size-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div></div>
          <Skeleton className="mt-5 h-3 w-4/5" /><Skeleton className="mt-2 h-3 w-3/5" /><Skeleton className="mt-6 h-10 w-full" />
        </div>
      ))}
    </>
  )
}

export function EmptyState({ icon = Icon.inbox, title, body, action, compact }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-lg border border-dashed border-border bg-surface text-center ${compact ? 'px-4 py-6' : 'px-6 py-10 md:py-14'}`}>
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-[1.5rem] text-primary">{icon}</span>
      <p className="mt-3 text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-text-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation()
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-error-soft text-[1.4rem] text-error">{offline ? Icon.wifiOff : Icon.alert}</span>
      <p className="mt-3 font-semibold">{message || (offline ? t('error.network') : t('error.server'))}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-3" icon={Icon.refresh} onClick={onRetry}>{t('state.retry')}</Button>}
    </div>
  )
}

/** Inline message box (info / warning / error / success). */
export function Note({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' | 'success'; icon?: ReactNode }) {
  const look = { info: 'bg-primary-soft text-text', warn: 'bg-warning-soft text-warning', error: 'bg-error-soft text-error', success: 'bg-success-soft text-success' }[tone]
  const ic = icon ?? (tone === 'error' || tone === 'warn' ? Icon.alert : tone === 'success' ? Icon.check : Icon.info)
  return (
    <p role={tone === 'error' ? 'alert' : undefined} className={`flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-[0.95rem] ${look}`}>
      <span className="mt-[0.2em] shrink-0">{ic}</span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------- dialog: bottom sheet on phones, centred on desktop
let openDialogs = 0

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  const { t } = useTranslation()
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && box.current) { // keep focus inside
        const f = box.current.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    const unstack = pushOverlay(() => closeRef.current())
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // the page behind can't be clicked or tabbed into while any dialog is open
    const root = document.getElementById('root')
    openDialogs++
    root?.setAttribute('inert', '')
    window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], button, a[href], input')?.focus(), 30)
    return () => { window.removeEventListener('keydown', onKey); unstack(); document.body.style.overflow = overflow
      if (--openDialogs === 0) root?.removeAttribute('inert')
      prev?.focus?.() }
  }, [open])
  if (!open) return null
  // rendered on <body>, so no sticky header / sidebar (their own stacking layer) can sit above the dimmed backdrop
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:items-center md:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`anim-rise flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-surface shadow-md md:rounded-xl ${size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md'}`}>
        <div className="flex items-start gap-2 px-5 pb-2 pt-3 md:pt-5">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border md:hidden" aria-hidden />
            <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
          </div>
          <IconButton label={t('close')} onClick={onClose} className="-mr-2 hidden md:grid">{Icon.close}</IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-border px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>{footer}</div>}
        {!footer && <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }} />}
      </div>
    </div>,
    document.body,
  )
}

/** Yes / no question before something that can't be undone easily. */
export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onCancel }: {
  open: boolean; title: ReactNode; body?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onClose={onCancel} title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" size="lg" block onClick={onCancel}>{t('cancel')}</Button>
          <Button variant={danger ? 'primary' : 'primary'} size="lg" block loading={busy} onClick={onConfirm}
            className={danger ? '!bg-error !text-on-error' : ''} data-autofocus>{confirmLabel}</Button>
        </div>
      }>
      {body && <p className="text-text-2">{body}</p>}
    </Dialog>
  )
}

// ---------------------------------------------------------------- page-level bits kept for focused screens (auth, legal)
export function TopBar({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2 md:px-4">
        {back ? <IconButton label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton> : <span className="w-2" />}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        {right}
      </div>
    </header>
  )
}

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5 md:py-8">{children}</main>
      {footer && (
        <footer className="sticky bottom-0 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <div className="mx-auto max-w-xl">{footer}</div>
        </footer>
      )}
    </div>
  )
}

/** One-tap light/dark switch. Shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle({ tone = 'plain' }: { tone?: 'plain' | 'onDark' }) {
  const { t } = useTranslation()
  const [dark, setDark] = useState(isDarkNow)
  return (
    <IconButton tone={tone} label={dark ? t('settings.light') : t('settings.dark')}
      onClick={() => { const next = !dark; setDark(next); void saveTheme(next ? 'dark' : 'light'); track('theme_set', { theme: next ? 'dark' : 'light', from: 'header' }) }}>
      {dark ? Icon.sun : Icon.moon}
    </IconButton>
  )
}

/** Toggle switch with label (role=switch). */
export function Switch({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 text-left disabled:opacity-60">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {sub && <span className="block text-sm text-text-2">{sub}</span>}
      </span>
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-success' : 'bg-border'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Segmented control (language, theme ...). */
export function Segmented<K extends string>({ value, onChange, options, label }: { value: K; onChange: (k: K) => void; options: { key: K; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-md border border-border bg-surface-2 p-1 sm:w-auto">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={`min-h-10 flex-1 rounded-sm px-3 py-1 text-sm font-medium leading-tight transition-colors sm:flex-none sm:px-4 ${value === o.key ? 'bg-surface text-primary shadow-sm' : 'text-text-2 hover:text-text'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
