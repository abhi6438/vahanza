import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'
import { ThemeToggle, Icon } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { brand } from '../../lib/brand'

/** Desktop-friendly frame for the admin panel (also works on a phone). */
export function AdminLayout({ children, queue }: { children: ReactNode; queue?: number }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const tab = ({ isActive }: { isActive: boolean }) => `whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold ${isActive ? 'bg-white text-brand' : 'text-white/90 hover:bg-white/10'}`
  return (
    <div className="min-h-full bg-bg">
      <header className="bg-header text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <strong className="font-display text-xl">{brand.name} · {t('admin.title')}</strong>
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold">{profile?.role === 'super_admin' ? 'Super admin' : 'Admin'}</span>
          <span className="flex-1" />
          <ThemeToggle className="grid h-10 w-10 place-items-center rounded-xl bg-white/15" />
          <Link to="/settings" aria-label={t('settings.title')} className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">{Icon.settings}</Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
          <NavLink to="/admin" end className={tab}>{t('admin.tab.dashboard')}</NavLink>
          <NavLink to="/admin/queue" className={tab}>
            {t('admin.tab.queue')}
            {!!queue && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-ink">{queue}</span>}
          </NavLink>
          <NavLink to="/admin/users" className={tab}>{t('admin.tab.users')}</NavLink>
          <NavLink to="/admin/import" className={tab}>{t('admin.tab.import')}</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  )
}

export const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN')
export { ago } from '../../lib/time'
