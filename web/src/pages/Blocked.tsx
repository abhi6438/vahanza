import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../components/photo'
import { Screen, TopBar } from '../components/ui'
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
  async function unblock(id: string) {
    await unblockPerson(id)
    track('unblock')
    setItems((cur) => cur?.filter((x) => x.id !== id) || null)
  }
  return (
    <>
      <TopBar title={t('trust.blockedList')} />
      <Screen>
        <p className="mb-4 text-muted">{t('trust.blockedSub')}</p>
        {items?.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-4 text-muted">{t('trust.noneBlocked')}</p>}
        <div className="flex flex-col gap-2.5">
          {items?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
              <Avatar url={p.photo_url} name={p.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.business_name || p.name}</p>
                <p className="text-sm text-muted">{t(`role.${p.role}`)}</p>
              </div>
              <button type="button" onClick={() => void unblock(p.id)} className="min-h-11 rounded-xl border-2 border-brand px-3 font-bold text-brand">{t('admin.u.unblock')}</button>
            </div>
          ))}
        </div>
      </Screen>
    </>
  )
}
