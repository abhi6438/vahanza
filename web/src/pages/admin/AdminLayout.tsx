import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { AppShell } from '../../components/shell'
import { useIsDesktop } from '../../lib/layout'

const TITLE: Record<string, string> = { '/admin': 'admin.tab.dashboard', '/admin/queue': 'admin.tab.queue', '/admin/users': 'admin.tab.users', '/admin/import': 'admin.tab.import' }

/** Admin pages use the same app shell (sidebar on desktop, bottom tabs on phones) with admin sections. */
export function AdminLayout({ children, queue, actions }: { children: ReactNode; queue?: number; actions?: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const desktop = useIsDesktop()
  return (
    <AppShell title={t(TITLE[pathname] || 'admin.title')} sub={desktop ? t('admin.title') : undefined} adminQueue={queue} actions={actions} width="wide">
      {children}
    </AppShell>
  )
}

export const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN')
export { ago } from '../../lib/time'
