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
import { ConfirmDialog, Frame, Icon, IconButton, ThemeToggle } from './ui'

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
      { to: '/admin/rewards', icon: Icon.crown, label: t('admin.tab.rewards') },
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

/** Brand mark: a saffron tile with a teal "V" drawn as a road (dashed centre line) — Vahanza, on the move. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[30%] shadow-[0_2px_6px_-2px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.45)]"
      style={{ width: size, height: size, background: 'linear-gradient(160deg, color-mix(in srgb, var(--c-accent) 85%, #fff 15%), var(--c-accent))' }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66}>
        <path d="M5 6l11 21L27 6" fill="none" stroke="var(--c-header)" strokeWidth="6.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 6l11 21L27 6" fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="2.4 2.6" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      </svg>
    </span>
  )
}

export interface ShellProps {
  /** Page title: desktop top bar, and the compact mobile header when there is no hero. */
  title: string
  /** Small line under the desktop title (e.g. the user's city). */
  sub?: ReactNode
  /** Mobile/tablet only: the header row that stays fixed at the top (greeting, bell, theme, profile). */
  heroTop?: ReactNode
  /** Mobile/tablet only: teal block under it (city, main action...); scrolls with the page. */
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
        <header className="glass sticky top-0 z-30 border-b border-border">
          <div className={`mx-auto flex h-header w-full items-center gap-3 px-[var(--page-gutter)] ${WIDTH[width]}`}>
            {back && <IconButton tone="outline" label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
              {sub && <div className="truncate text-sm text-text-2">{sub}</div>}
            </div>
            {actions}
            <div className="flex items-center gap-0.5 border-l border-border pl-2">
              {!admin && <Bell />}
              <ThemeToggle />
              {!admin && <ProfileButton />}
            </div>
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
    `press group relative flex min-h-ctl-md items-center gap-3 rounded-md px-3 text-sm font-medium ${isActive ? 'bg-primary-soft font-semibold text-primary before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r-full before:bg-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`
  return (
    <div className="border-r border-border bg-surface">
    <aside className="sticky top-0 flex h-dvh flex-col px-3 pb-3 pt-4">
      <Link to={isAdmin ? '/admin' : '/home'} className="mb-6 flex items-center gap-2.5 px-2">
        <BrandMark size={34} />
        <span className="leading-tight">
          <span className="block font-display text-lg font-semibold tracking-[-0.01em] text-text">{brand.name}</span>
          <span className="block text-xs text-text-2">{isAdmin ? t('admin.title') : brand.nameHi}</span>
        </span>
      </Link>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={item}>
            <span className="text-[length:var(--icon-size-md)] [&>svg]:transition-transform group-hover:[&>svg]:scale-110">{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            {!!i.count && <CountDot n={i.count} className="" />}
          </NavLink>
        ))}
      </nav>
      <p className="mb-1.5 mt-6 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-text-3">{t('nav.more')}</p>
      <nav aria-label={t('nav.more')} className="flex flex-col gap-1">
        {!isAdmin && (
          <NavLink to="/notifications" className={item}>
            <span className="text-[length:var(--icon-size-md)] [&>svg]:transition-transform group-hover:[&>svg]:scale-110">{Icon.bell}</span>
            <span className="flex-1">{t('notif.title')}</span>
            {unread > 0 && <CountDot n={unread} className="" />}
          </NavLink>
        )}
        {!isAdmin && (
          <NavLink to="/rewards" className={item}>
            <span className="text-[length:var(--icon-size-md)] [&>svg]:transition-transform group-hover:[&>svg]:scale-110">{Icon.crown}</span>
            <span className="flex-1">{t('rw.title')}</span>
          </NavLink>
        )}
        <NavLink to="/settings" className={item}>
          <span className="text-[length:var(--icon-size-md)] [&>svg]:transition-transform group-hover:[&>svg]:scale-110">{Icon.settings}</span>
          <span className="flex-1">{t('settings.title')}</span>
        </NavLink>
        <a href={`tel:${brand.supportPhone}`} className={item({ isActive: false })}>
          <span className="text-[length:var(--icon-size-md)] [&>svg]:transition-transform group-hover:[&>svg]:scale-110">{Icon.help}</span>
          <span className="flex-1">{t('profile.help')}</span>
        </a>
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-lg bg-surface-2 p-2 ring-1 ring-inset ring-border">
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
function MobileShell({ title, heroTop, hero, back, mobileActions, adminQueue, children, tablet }: ShellProps & { tablet: boolean }) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const nav = useNavigate()
  const tabs = !back
  useEffect(() => {
    document.documentElement.style.setProperty('--toast-offset', tabs ? '76px' : '16px')
  }, [tabs])
  const container = tablet ? 'max-w-3xl px-6' : 'max-w-xl px-4'
  const safeTop = { paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }

  // header: always on screen
  const header = back ? (
    <header className="glass border-b border-border" style={safeTop}>
      <div className={`mx-auto flex h-header items-center gap-1 ${tablet ? 'max-w-3xl px-4' : 'px-2'}`}>
        <IconButton label={t('back')} onClick={() => nav(-1)}>{Icon.back}</IconButton>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h1>
        {mobileActions}
      </div>
    </header>
  ) : (
    <header className="surface-hero" style={safeTop}>
      <div className={`mx-auto ${container}`}>
        {heroTop ?? (
          <div className="flex h-header items-center gap-1">
            <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold tracking-[-0.01em]">{title}</h1>
            {mobileActions}
            {!admin && <Bell tone="onDark" />}
            <ThemeToggle tone="onDark" />
            {/* admins have no Profile tab on phones: settings and log out sit in the header */}
            {admin && (
              <>
                <Link to="/settings" aria-label={t('settings.title')} title={t('settings.title')}
                  className="press grid size-ctl-md shrink-0 place-items-center rounded-full text-[length:var(--icon-size-md)] text-white/90 hover:bg-white/12 active:bg-white/20">{Icon.settings}</Link>
                <LogoutButton tone="onDark" />
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )

  return (
    <>
      <SkipLink />
      <Frame header={header} footer={tabs ? <BottomNav adminQueue={adminQueue} /> : undefined}>
        {/* the rest of the teal header (city, main action) scrolls away under the fixed bar */}
        {!back && hero && (
          <div className="surface-hero surface-hero-cont -mt-px rounded-b-[1.75rem] shadow-md">
            <div className={`mx-auto pb-4 ${container}`}>{hero}</div>
          </div>
        )}
        <main id="main" tabIndex={-1} className={`mx-auto w-full pb-6 pt-4 outline-none ${container}`}>{children}</main>
      </Frame>
    </>
  )
}

/** Mobile hero header row: title + bell + theme (pages add their own content under it). */
export function HeroBar({ title, badge }: { title: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex h-header items-center gap-1">
      <h1 className="min-w-0 flex-1 truncate font-display text-[1.375rem] font-semibold tracking-[-0.01em]">{title}</h1>
      {badge}
      <Bell tone="onDark" />
      <ThemeToggle tone="onDark" />
      <ProfileButton tone="onDark" />
    </div>
  )
}

/** Bottom tabs: glass bar, a pill that grows behind the active icon, bold label, haptic-like press. */
export function BottomNav({ adminQueue }: { adminQueue?: number }) {
  const { t } = useTranslation()
  const items = useNavItems(adminQueue)
  return (
    <nav aria-label={t('nav.main')} className="glass border-t border-border shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.18)]"
      style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))' }}>
      <div className="mx-auto grid max-w-xl px-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            className={({ isActive }) => `press relative flex h-nav flex-col items-center justify-center gap-0.5 text-[0.6875rem] leading-tight ${isActive ? 'font-semibold text-primary' : 'font-medium text-text-2'}`}>
            {({ isActive }) => (
              <>
                <span className="relative grid h-7 w-14 place-items-center text-[length:var(--icon-size-md)]">
                  <span aria-hidden className={`absolute inset-0 rounded-full bg-primary-soft transition-transform duration-300 ease-[var(--ease-out)] ${isActive ? 'scale-100' : 'scale-x-0 scale-y-50 opacity-0'}`} />
                  <span className={`relative transition-transform duration-200 ${isActive ? '-translate-y-px [&>svg]:stroke-[2.3]' : ''}`}>{i.icon}</span>
                </span>
                <span className="max-w-full truncate px-1">{i.label}</span>
                {!!i.count && <CountDot n={i.count} className="absolute right-[20%] top-1" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Your photo in the top bar (desktop) / hero (phone): opens Profile. */
export function ProfileButton({ tone = 'plain' }: { tone?: 'plain' | 'onDark' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  return (
    <Link to="/profile" aria-label={t('tabs.profile')} title={t('tabs.profile')}
      className={`press ml-1 grid shrink-0 place-items-center rounded-full ring-2 ${tone === 'onDark' ? 'ring-white/25 hover:ring-white/50' : 'ring-border hover:ring-primary/50'}`}>
      <Avatar url={profile?.photo_url} name={profile?.name} size={32} />
    </Link>
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
  if (layout !== 'desktop') return <>{mobileTop && <div className="mb-4 flex flex-col gap-3 empty:hidden">{mobileTop}</div>}{main}</>
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
