/**
 * Design-system primitives. Pages compose these instead of writing their own button / card / state styles.
 * Colours only through tokens (see styles.css); sizes only from the scale.
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight, Award, Coins, Crown, Ban, Banknote, BadgeCheck, Bell, Briefcase, Bus, Calendar, Car, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, Clock, Copy, Download, Eye, FileText, Fingerprint, Flag, Gift, Handshake, Heart, History, House, IdCard,
  Inbox, Info, Languages, LayoutDashboard, LocateFixed, Lock, LogOut, MapPin, MessageCircle, Mic, Moon, Navigation, Palette, Phone,
  Plus, Printer, QrCode, RefreshCw, Route, Search, Settings, Share2, ShieldCheck, SlidersHorizontal, Sparkles, Star, Sun, Truck,
  TriangleAlert, Upload, UserRound, Users, WifiOff, Wrench, X, Zap, type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import { OfflineArt } from '../assets/illustrations'
import { pushOverlay } from '../lib/layout'
import { isDarkNow, saveTheme } from '../lib/theme'
import { track } from '../lib/track'

// ---------------------------------------------------------------- icons
// ONE icon family everywhere: Lucide (24px grid, round caps). Same stroke, same size (scales with text).
// Pages use Icon.<name>, so the whole app changes style from this one map.
const lu = (C: LucideIcon, filled = false) => (
  <C aria-hidden focusable="false" width="1.25em" height="1.25em" strokeWidth={1.85} className={filled ? 'fill-current' : undefined} />
)
export const Icon = {
  back: lu(ChevronLeft),
  chevron: lu(ChevronRight),
  down: lu(ChevronDown),
  close: lu(X),
  check: lu(Check),
  settings: lu(Settings),
  pin: lu(MapPin),
  plus: lu(Plus),
  search: lu(Search),
  home: lu(House),
  list: lu(ClipboardList),
  wrench: lu(Wrench),
  user: lu(UserRound),
  users: lu(Users),
  heart: lu(Heart),
  sparkle: lu(Sparkles),
  // WhatsApp is a brand mark, not a Lucide icon: drawn on the same 24px grid
  whatsapp: (
    <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="currentColor" aria-hidden focusable="false">
      <path d="M12 2.2A9.7 9.7 0 0 0 3.7 16.9L2.3 21.8l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2l-.5-.3z" />
    </svg>
  ),
  sun: lu(Sun),
  moon: lu(Moon),
  phone: lu(Phone),
  bell: lu(Bell),
  logout: lu(LogOut),
  globe: lu(Languages),
  palette: lu(Palette),
  lock: lu(Lock),
  shield: lu(ShieldCheck),
  help: lu(CircleHelp),
  info: lu(Info),
  alert: lu(TriangleAlert),
  ban: lu(Ban),
  doc: lu(FileText),
  briefcase: lu(Briefcase),
  star: lu(Star, true),
  truck: lu(Truck),
  upload: lu(Upload),
  chart: lu(LayoutDashboard),
  inbox: lu(Inbox),
  refresh: lu(RefreshCw),
  share: lu(Share2),
  mic: lu(Mic),
  qr: lu(QrCode),
  gift: lu(Gift),
  eye: lu(Eye),
  idcard: lu(IdCard),
  download: lu(Download),
  print: lu(Printer),
  copy: lu(Copy),
  wifiOff: lu(WifiOff),
  // added with the premium redesign
  bus: lu(Bus),
  car: lu(Car),
  navigation: lu(Navigation),
  locate: lu(LocateFixed),
  verified: lu(BadgeCheck),
  clock: lu(Clock),
  filter: lu(SlidersHorizontal),
  message: lu(MessageCircle),
  zap: lu(Zap),
  handshake: lu(Handshake),
  route: lu(Route),
  calendar: lu(Calendar),
  arrow: lu(ArrowRight),
  award: lu(Award),
  money: lu(Banknote),
  fingerprint: lu(Fingerprint),
  history: lu(History),
  flag: lu(Flag),
  // rewards
  crown: lu(Crown),
  coins: lu(Coins),
}

// ---------------------------------------------------------------- buttons
type Variant = 'action' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'whatsapp'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  action: 'btn-action text-on-action',
  primary: 'btn-primary text-on-primary',
  secondary: 'border border-primary-border/60 bg-primary-soft text-primary hover:border-primary-border hover:bg-primary-light active:bg-primary-subtle',
  outline: 'border border-border bg-surface text-text shadow-xs hover:border-primary-border hover:bg-primary-subtle',
  ghost: 'text-primary hover:bg-primary-soft',
  danger: 'border border-border bg-surface text-error shadow-xs hover:border-error/40 hover:bg-error-soft',
  success: 'btn-success text-on-success',
  whatsapp: 'border border-border bg-surface text-text shadow-xs hover:border-whatsapp/40 hover:bg-surface-2 [&>svg]:text-whatsapp',
}
const SIZE: Record<Size, string> = {
  sm: 'min-h-ctl-sm px-3 text-sm gap-1.5 rounded-sm [&>svg]:size-icon-sm',
  md: 'min-h-ctl-md px-4 text-base gap-2 rounded-md [&>svg]:size-icon-md',
  lg: 'min-h-ctl-lg px-5 text-base gap-2 rounded-md [&>svg]:size-icon-md',
}
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false) {
  return `press inline-flex items-center justify-center font-semibold tracking-[0.005em] select-none [&>svg]:shrink-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${VARIANT[variant]} ${SIZE[size]} ${block ? 'w-full' : ''}`
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
  const look = tone === 'onDark' ? 'rounded-full text-white/90 hover:bg-white/12 hover:text-white active:bg-white/20' : tone === 'outline' ? 'rounded-md border border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-2' : 'rounded-full text-text-2 hover:bg-surface-2 hover:text-text'
  return (
    <button type="button" aria-label={label} title={label} className={`press relative grid size-ctl-md shrink-0 place-items-center text-[length:var(--icon-size-md)] ${look} ${className}`} {...rest}>
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
/** Layered card: raised surface, hairline border, soft shadow. interactive = lifts under the pointer. */
export function Card({ children, className = '', as: As = 'section', pad = true, interactive, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div'; pad?: boolean; interactive?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return <As className={`rounded-lg border border-border bg-surface shadow-sm ${interactive ? 'card-lift' : ''} ${pad ? 'p-card' : ''} ${className}`} {...rest}>{children}</As>
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'action'
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2 ring-1 ring-inset ring-border',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  error: 'bg-error-soft text-error',
  action: 'bg-action text-on-action',
}
/** Small status pill / tag. */
export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-5 [&>svg]:size-[1.1em] ${TONE[tone]} ${className}`}>{icon}{children}</span>
}

/** Selectable filter chip (aria-pressed). */
export function Chip({ selected, onClick, children, icon, className = '' }: { selected: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`press inline-flex h-chip shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium [&>svg]:size-icon-sm ${selected ? 'border-primary/70 bg-primary-soft text-primary shadow-[inset_0_0_0_1px_var(--c-brand)]' : 'border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-2'} ${className}`}>
      {selected && <span aria-hidden className="anim-check -ml-0.5 grid size-4 place-items-center rounded-full bg-primary text-on-primary [&>svg]:size-3">{Icon.check}</span>}
      {icon}{children}
    </button>
  )
}

// ---------------------------------------------------------------- headings used inside pages
export const H = ({ children }: { children: ReactNode }) => <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em]">{children}</h1>
export const Sub = ({ children }: { children: ReactNode }) => <p className="mb-section mt-1 text-text-2">{children}</p>

export function SectionTitle({ title, sub, right, className = '' }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold tracking-[-0.005em]">{title}</h2>
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
        <div key={i} aria-hidden className={`rounded-lg border border-border bg-surface p-card shadow-sm ${height}`}>
          <div className="flex gap-3"><Skeleton className="size-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div></div>
          <Skeleton className="mt-5 h-3 w-4/5" /><Skeleton className="mt-2 h-3 w-3/5" /><Skeleton className="mt-6 h-10 w-full" />
        </div>
      ))}
    </>
  )
}

/** Empty list: an illustration (art) or an icon, a title that says what is missing, and the next step. */
export function EmptyState({ icon = Icon.inbox, art, title, body, action, compact }: { icon?: ReactNode; art?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`anim-rise flex flex-col items-center rounded-lg border border-border bg-surface text-center shadow-sm ${compact ? 'px-4 py-6' : 'px-6 py-9 lg:py-11'}`}>
      {art
        ? <div className={compact ? 'w-28' : 'w-40 lg:w-44'} aria-hidden>{art}</div>
        : <span className="icon-tile size-12 bg-primary-soft text-[length:var(--icon-size-lg)] text-primary">{icon}</span>}
      <p className="mt-3 font-display text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-text-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation()
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div role="alert" className="anim-rise flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm">
      {offline ? <div className="w-32"><OfflineArt /></div> : <span className="icon-tile size-12 bg-error-soft text-[length:var(--icon-size-lg)] text-error">{Icon.alert}</span>}
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
    <p role={tone === 'error' ? 'alert' : undefined} className={`flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-sm ring-1 ring-inset ring-current/10 ${look}`}>
      <span className="mt-[0.2em] shrink-0">{ic}</span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------- dialog: bottom sheet on phones, centred on desktop
let openDialogs = 0

export function Dialog({ open, onClose, title, children, footer, size = 'md', side }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg'; /** desktop: a panel on the right instead of a centred box */ side?: boolean }) {
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
    <div className={`anim-fade fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(4_14_17/0.55)] backdrop-blur-[2px] ${side ? 'md:items-center md:p-6 lg:items-stretch lg:justify-end lg:p-0' : 'md:items-center md:p-6'}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`anim-sheet flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface-3 shadow-lg md:rounded-xl ${size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md'} ${side ? 'lg:h-dvh lg:max-h-none lg:max-w-[26rem] lg:rounded-none lg:rounded-l-2xl lg:border-y-0 lg:border-r-0' : ''}`}>
        <div className="flex items-start gap-2 px-5 pb-2 pt-3 md:pt-5">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border md:hidden" aria-hidden />
            <h2 id={titleId} className="font-display text-xl font-semibold tracking-[-0.01em]">{title}</h2>
          </div>
          <IconButton label={t('close')} onClick={onClose} className="-mr-2 hidden md:grid">{Icon.close}</IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-border px-5 pt-3" style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 16px)' }}>{footer}</div>}
        {!footer && <div style={{ height: 'calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 8px)' }} />}
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
    <header className="glass sticky top-0 z-20 border-b border-border" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}>
      <div className="mx-auto flex h-header max-w-3xl items-center gap-1 px-2 md:px-4">
        {back ? <IconButton label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton> : <span className="w-2" />}
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h1>
        {right}
      </div>
    </header>
  )
}

/**
 * Focused screen (sign-in steps). The main button sits right under the content, not pinned to the
 * bottom: it stays visible when the phone keyboard is open and is where people look after typing.
 */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <main className="mx-auto w-full max-w-xl px-4 py-5 md:py-8" style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 24px)' }}>
        {children}
        {footer && <div className="mt-6">{footer}</div>}
      </main>
    </div>
  )
}

/**
 * Phone / tablet screen frame: the header and the footer (bottom tabs, main button) stay put and only
 * the middle scrolls — one scroll area per screen, the page itself never scrolls (web and APK alike).
 */
export function Frame({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {header && <div className="relative z-30 shrink-0">{header}</div>}
      <div data-scroller className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">{children}</div>
      {footer && <div className="relative z-30 shrink-0">{footer}</div>}
    </div>
  )
}

/** Back to the top of the screen (the frame's scroll area, or the page on desktop). */
export function scrollToTop() {
  document.querySelectorAll<HTMLElement>('[data-scroller]').forEach((el) => { el.scrollTop = 0 })
  window.scrollTo(0, 0)
}

/** Main button bar pinned under the content (sign-in steps, wizards): stays above the keyboard. */
export function FooterBar({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 12px)' }}>
      <div className="mx-auto max-w-xl">{children}</div>
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
      className="flex min-h-ctl-lg w-full items-center gap-3 py-1.5 text-left disabled:opacity-60">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {sub && <span className="block text-sm text-text-2">{sub}</span>}
      </span>
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-border-strong'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-[left] duration-300 ease-[var(--ease-spring)] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Segmented control (language, theme ...). */
export function Segmented<K extends string>({ value, onChange, options, label }: { value: K; onChange: (k: K) => void; options: { key: K; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-md bg-surface-2 p-1 ring-1 ring-inset ring-border sm:w-auto">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={`press min-h-ctl-sm flex-1 rounded-sm px-3 py-1 text-sm font-medium leading-tight sm:flex-none sm:px-4 ${value === o.key ? 'bg-surface-3 font-semibold text-primary shadow-md' : 'text-text-2 hover:text-text'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
