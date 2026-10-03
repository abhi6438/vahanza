import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../components/photo'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, EmptyState, Icon, Skeleton } from '../components/ui'
import { myBlocks, unblockPerson, type BlockedPerson } from '../lib/api'
import { track, trackScreen } from '../lib/track'

/** People I blocked: they don't see me and I don't see them. Unblock from here. */
export default function Blocked() {
  const { t } = useTranslation()
  const [items, setItems] = useState<BlockedPerson[] | null>(null)
  useEffect(() => {
    trackScreen('blocked_list')
    myBlocks().then((r) => setItems(r.items)).catch(() => setItems([]))
  }, [])
  const toast = useToast()
  async function unblock(id: string, name: string) {
    await unblockPerson(id)
    toast(t('trust.unblockedToast', { name }), { tone: 'success' })
    track('unblock')
    setItems((cur) => cur?.filter((x) => x.id !== id) || null)
  }
  return (
    <AppShell title={t('trust.blockedList')} back width="narrow">
      <p className="mb-4 text-text-2">{t('trust.blockedSub')}</p>
      {items === null && <div className="flex flex-col gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {items?.length === 0 && <EmptyState compact icon={Icon.shield} title={t('trust.noneBlocked')} />}
      {!!items?.length && (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
              <Avatar url={p.photo_url} name={p.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.business_name || p.name}</p>
                <p className="text-sm text-text-2">{t(`role.${p.role}`)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void unblock(p.id, p.business_name || p.name || '')}>{t('admin.u.unblock')}</Button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
