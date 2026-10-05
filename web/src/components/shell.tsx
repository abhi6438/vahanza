/**
 * App shell: one component, three structures.
 *   desktop (≥1024, web only)  left sidebar + sticky top bar + wide content
 *   tablet  (768–1023)         mobile navigation, wider content, 2-column grids
 *   mobile  (<768, and APK)    compact teal header + bottom tabs, one column
 * Pages describe WHAT to show (title, main action, mobile hero); the shell decides WHERE.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { useLayout } from '../lib/layout'
import { Bell, CountDot, useUnread } from './notify'
import { Avatar } from './photo'
import { ConfirmDialog, Icon, IconButton, ThemeToggle } from './ui'

export type NavItem = { to: string; icon: ReactNode; label: string; count?: number; end?: boolean }

/** Main sections per role. Same list feeds the sidebar (desktop) and the bottom tabs (mobile). */
export function useNavItems(adminQueue?: number): NavItem[] {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const role = profile?.role
  if (role === 'admin' || role === 'super_admin') {
    return [
      { to: '/admin', icon: Icon.chart, label: t('admin.tab.dashboard'), end: true },
      { to: '/admin/queue', icon: Icon.shield, label: t('admin.tab.queue'), count: adminQueue },
      { to: '/admin/users', icon: Icon.users, label: t('admin.tab.users') },
      { to: '/admin/import', icon: Icon.upload, label: t('admin.tab.import') },
      { to: '/admin/posters', icon: Icon.qr, label: t('admin.tab.posters') },
    ]
  }
  return [
    { to: '/home', icon: Icon.home, label: t('tabs.home') },
    role === 'driver'
      ? { to: '/interests', icon: Icon.heart, label: t('tabs.interests') }
      : { to: '/posts', icon: Icon.list, label: t('tabs.posts') },
    { to: '/soon', icon: Icon.wrench, label: t('tabs.mechanic') },
    { to: '/profile', icon: Icon.user, label: t('tabs.profile') },
  ]
}

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-md bg-action" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 80 50" width={size * 0.72} height={size * 0.45}>
        <rect x="4" y="12" width="46" height="24" rx="3" fill="#E8742A" />
        <path d="M50 18h14l10 10v8H50z" fill="#2F5DA8" /><path d="M54 21h9l6 7H54z" fill="#CFE3F7" />
        <circle cx="16" cy="40" r="5" fill="#2B2F2C" /><circle cx="36" cy="40" r="5" fill="#2B2F2C" /><circle cx="64" cy="40" r="5" fill="#2B2F2C" />
      </svg>
    </span>
  )
}

export interface ShellProps {
  /** Page title: desktop top bar, and the compact mobile header when there is no hero. */
  title: string
  /** Small line under the desktop title (e.g. the user's city). */
  sub?: ReactNode
  /** Mobile/tablet only: custom content for the teal header (greeting, main action...). */
  hero?: ReactNode
  /** Desktop top-bar actions, right side (e.g. the page's main button). */
  actions?: ReactNode
  /** Sub-page (not a tab): shows a back arrow and a plain header on mobile. */
  back?: boolean
  /** Extra mobile header buttons (next to the bell). */
  mobileActions?: ReactNode
  /** Content width on desktop: narrow (forms, lists of text), default, wide (grids, dashboards). */
  width?: 'narrow' | 'default' | 'wide'
  adminQueue?: number
  children: ReactNode
}

// large screens get more room through width / columns, never bigger components
const WIDTH = { narrow: 'max-w-3xl', default: 'max-w-6xl min-[1600px]:max-w-7xl', wide: 'max-w-[1440px] min-[1600px]:max-w-[1680px]' }

export function AppShell(p: ShellProps) {
  const layout = useLayout()
  return layout === 'desktop' ? <DesktopShell {...p} /> : <MobileShell {...p} tablet={layout === 'tablet'} />
}

// ---------------------------------------------------------------- desktop
function useIsAdmin() {
  const { profile } = useAuth()
  return profile?.role === 'admin' || profile?.role === 'super_admin'
}

function DesktopShell({ title, sub, actions, back, width = 'default', adminQueue, children }: ShellProps) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const nav = useNavigate()
  useEffect(() => { document.documentElement.style.setProperty('--toast-offset', '24px') }, [])
  return (
    <div className="grid min-h-full grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <SkipLink />
      <Sidebar adminQueue={adminQueue} />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
          <div className={`mx-auto flex h-header w-full items-center gap-3 px-[var(--page-gutter)] ${WIDTH[width]}`}>
            {back && <IconButton tone="outline" label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold leading-tight">{title}</h1>
              {sub && <p className="truncate text-sm text-text-2">{sub}</p>}
            </div>
            {actions}
            {!admin && <Bell />}
            <ThemeToggle />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-[var(--page-gutter)] pb-12 pt-[var(--section-gap)] outline-none ${WIDTH[width]}`}>{children}</main>
      </div>
    </div>
  )
}

/** Log out icon + "Log out?" confirm. Sidebar user card on desktop; admin's phone header (admins have no Profile tab). */
export function LogoutButton({ tone = 'plain' }: { tone?: 'plain' | 'onDark' }) {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <IconButton tone={tone} label={t('settings.logout')} onClick={() => setConfirm(true)}>{Icon.logout}</IconButton>
      <ConfirmDialog open={confirm} title={t('settings.logoutQ')} confirmLabel={t('settings.logout')}
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void logout(false) }} />
    </>
  )
}

function Sidebar({ adminQueue }: { adminQueue?: number }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const items = useNavItems(adminQueue)
  const unread = useUnread()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const item = ({ isActive }: { isActive: boolean }) =>
    `group relative flex min-h-ctl-md items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-soft text-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`
  return (
    <div className="border-r border-border bg-surface">
    <aside className="sticky top-0 flex h-dvh flex-col px-3 pb-3 pt-4">
      <Link to={isAdmin ? '/admin' : '/home'} className="mb-5 flex items-center gap-2.5 px-2">
        <BrandMark size={32} />
        <span className="leading-tight">
          <span className="block font-display text-lg font-bold text-text">{brand.name}</span>
          <span className="block text-xs text-text-2">{isAdmin ? t('admin.title') : brand.nameHi}</span>
        </span>
      </Link>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={item}>
            <span className="text-[1.15rem]">{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            {!!i.count && <CountDot n={i.count} className="" />}
          </NavLink>
        ))}
      </nav>
      <div className="my-4 border-t border-border" />
      <nav aria-label={t('nav.more')} className="flex flex-col gap-1">
        {!isAdmin && (
          <NavLink to="/notifications" className={item}>
            <span className="text-[1.15rem]">{Icon.bell}</span>
            <span className="flex-1">{t('notif.title')}</span>
            {unread > 0 && <CountDot n={unread} className="" />}
          </NavLink>
        )}
        <NavLink to="/settings" className={item}>
          <span className="text-[1.15rem]">{Icon.settings}</span>
          <span className="flex-1">{t('settings.title')}</span>
        </NavLink>
        <a href={`tel:${brand.supportPhone}`} className={item({ isActive: false })}>
          <span className="text-[1.15rem]">{Icon.help}</span>
          <span className="flex-1">{t('profile.help')}</span>
        </a>
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-border p-2">
        <Avatar url={profile?.photo_url} name={profile?.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{profile?.business_name || profile?.name || '—'}</p>
          <p className="truncate text-xs text-text-2">{profile?.role ? t(`role.${profile.role}`, { defaultValue: profile.role }) : ''}</p>
        </div>
        <LogoutButton />
      </div>
    </aside>
    </div>
  )
}

function SkipLink() {
  const { t } = useTranslation()
  return (
    <a href="#main" className="sr-only z-50 rounded-md bg-action px-4 py-2 font-semibold text-on-action focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
      {t('nav.skip')}
    </a>
  )
}

// ---------------------------------------------------------------- mobile / tablet
function MobileShell({ title, hero, back, mobileActions, adminQueue, children, tablet }: ShellProps & { tablet: boolean }) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const nav = useNavigate()
  const tabs = !back
  useEffect(() => {
    document.documentElement.style.setProperty('--toast-offset', tabs ? '76px' : '16px')
  }, [tabs])
  const container = tablet ? 'max-w-3xl px-6' : 'max-w-xl px-4'
  return (
    <div className={`min-h-full ${tabs ? 'pb-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height)+16px)]' : 'pb-6'}`}>
      <SkipLink />
      {back ? (
        <header className="sticky top-0 z-30 border-b border-border bg-surface" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className={`mx-auto flex h-header items-center gap-1 ${tablet ? 'max-w-3xl px-4' : 'px-2'}`}>
            <IconButton label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
            {mobileActions}
          </div>
        </header>
      ) : (
        <header className="bg-header text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className={`mx-auto ${container} ${hero ? 'pb-3 pt-1' : ''}`}>
            {hero ?? (
              <div className="flex h-header items-center gap-1">
                <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title}</h1>
                {mobileActions}
                {!admin && <Bell tone="onDark" />}
                <ThemeToggle tone="onDark" />
                {/* admins have no Profile tab on phones: settings and log out sit in the header */}
                {admin && (
                  <>
                    <Link to="/settings" aria-label={t('settings.title')} title={t('settings.title')}
                      className="grid size-ctl-md shrink-0 place-items-center rounded-md text-[length:var(--icon-size-md)] text-white transition-colors hover:bg-white/15 active:bg-white/20">{Icon.settings}</Link>
                    <LogoutButton tone="onDark" />
                  </>
                )}
              </div>
            )}
          </div>
        </header>
      )}
      <main id="main" tabIndex={-1} className={`mx-auto w-full pt-4 outline-none ${container}`}>{children}</main>
      {tabs && <BottomNav adminQueue={adminQueue} />}
    </div>
  )
}

/** Mobile hero header row: title + bell + theme (pages add their own content under it). */
export function HeroBar({ title, badge }: { title: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex h-header items-center gap-1">
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title}</h1>
      {badge}
      <Bell tone="onDark" />
      <ThemeToggle tone="onDark" />
    </div>
  )
}

export function BottomNav({ adminQueue }: { adminQueue?: number }) {
  const { t } = useTranslation()
  const items = useNavItems(adminQueue)
  return (
    <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            className={({ isActive }) => `relative flex h-nav flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-primary' : 'text-text-2'}`}>
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full text-[length:var(--icon-size-md)] transition-colors ${isActive ? 'bg-primary-soft' : ''}`}>{i.icon}</span>
                <span className="max-w-full truncate px-1 leading-tight">{i.label}</span>
                {!!i.count && <CountDot n={i.count} className="absolute right-[22%] top-1.5" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------- page building blocks
/**
 * Main content + side rail.
 *   desktop ≥1280: rail on the right (340px)
 *   desktop 1024–1279: rail cards sit above the content in two columns, content gets the full width
 *   mobile/tablet: only `mobileTop` above the content (the rail's main action lives in the teal header there)
 */
export function WithRail({ main, rail, mobileTop }: { main: ReactNode; rail: ReactNode; mobileTop?: ReactNode }) {
  const layout = useLayout()
  if (layout !== 'desktop') return <>{mobileTop && <div className="mb-4 flex flex-col gap-3">{mobileTop}</div>}{main}</>
  return (
    <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_340px] min-[1600px]:grid-cols-[minmax(0,1fr)_380px]">
      <div className="order-2 min-w-0 xl:order-1">{main}</div>
      <aside className="order-1 grid content-start items-start gap-grid lg:grid-cols-2 xl:order-2 xl:grid-cols-1">{rail}</aside>
    </div>
  )
}

/** Card grid sized by the space it actually has (container query), not the window: 1 → 2 → 3 columns. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-grid @xl:grid-cols-2 @4xl:grid-cols-3 @[90rem]:grid-cols-4">{children}</div>
    </div>
  )
}
