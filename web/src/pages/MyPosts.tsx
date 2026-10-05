import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router-dom'
import { DriverCard, JobCard, PostStatus } from '../components/cards'
import { ShareJobButton } from '../components/growth'
import { VehicleArt } from '../components/form'
import { DriverContact } from '../components/home'
import { PushAsk } from '../components/notify'
import { AppShell, CardGrid } from '../components/shell'
import { useToast } from '../components/toast'
import { CardMenu } from '../components/trust'
import { Badge, Button, ButtonLink, CardSkeletons, ConfirmDialog, EmptyState, ErrorState, Icon, Note, SectionTitle } from '../components/ui'
import { myPosts, postInterests, setPostStatus, type InterestedDriver, type MyPost, recordView } from '../lib/api'
import { useAuth } from '../lib/auth'
import { label, placeName, rupees, VEHICLES } from '../lib/catalog'
import { useIsDesktop } from '../lib/layout'
import { track, trackScreen } from '../lib/track'

type Status = 'live' | 'paused' | 'filled' | 'closed'

/**
 * Owner's "My posts".
 *   desktop: post list on the left, the chosen post + interested drivers on the right
 *   phone:   one card per post, interested drivers open under it
 */
export default function MyPosts() {
  const { t } = useTranslation()
  const { fleet } = useAuth()
  const desktop = useIsDesktop()
  const created = (useLocation().state as { created?: string } | null)?.created
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const [items, setItems] = useState<MyPost[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    myPosts().then((r) => setItems(r.items)).catch(() => setError(true))
  }, [])
  useEffect(() => { trackScreen('my_posts'); load() }, [load])
  const newTo = fleet.length ? '/posts/new' : '/setup?step=fleet&next=/posts/new'
  const newBtn = (size: 'md' | 'lg', block?: boolean) => (
    <ButtonLink to={newTo} onClick={() => track('post_tap', { from: 'my_posts' })} variant="action" size={size} block={block} icon={Icon.plus}>{t('post.new')}</ButtonLink>
  )
  const selectedId = openId || items?.[0]?.id || null
  const selected = items?.find((p) => p.id === selectedId) || null

  const top = (
    <>
      {created && <Note tone={created === 'live' ? 'success' : 'warn'}>{created === 'live' ? t('post.createdLive') : t('post.createdCheck')}</Note>}
      {!!items?.length && <PushAsk from={created ? 'post_created' : 'my_posts'} why={t('notif.whyOwner')} />}
    </>
  )
  const empty = (
    <EmptyState icon={Icon.list} title={t('post.noneTitle')} body={t('post.noneBody')} action={newBtn('md')} />
  )

  return (
    <AppShell title={t('tabs.posts')} sub={items ? t('post.countN', { n: items.length }) : undefined} actions={newBtn('md')} width="wide">
      {!desktop && <div className="mb-4">{newBtn('lg', true)}</div>}
      <div className="flex flex-col gap-3">{top}</div>
      {error && <div className="mt-4"><ErrorState onRetry={load} /></div>}
      {items === null && !error && <div className="mt-4 grid gap-3 lg:grid-cols-[360px_1fr]"><CardSkeletons count={2} /></div>}
      {items?.length === 0 && <div className="mt-4">{empty}</div>}

      {!!items?.length && desktop && (
        <div className="mt-4 grid grid-cols-[minmax(300px,360px)_minmax(0,1fr)] items-start gap-6">
          <nav aria-label={t('tabs.posts')} className="sticky top-[5.5rem] flex max-h-[calc(100dvh-7rem)] flex-col gap-2 overflow-y-auto pr-1">
            {items.map((p) => (
              <PostRow key={p.id} post={p} active={p.id === selectedId}
                onClick={() => setParams((cur) => { const n = new URLSearchParams(cur); n.set('open', p.id); return n }, { replace: true })} />
            ))}
          </nav>
          {selected && <PostDetail key={selected.id} post={selected} onChange={load} />}
        </div>
      )}
      {!!items?.length && !desktop && (
        <div className="mt-4 flex flex-col gap-4">
          {items.map((p) => <PostItem key={p.id} post={p} onChange={load} startOpen={p.id === openId} />)}
        </div>
      )}
    </AppShell>
  )
}

/** Compact row in the desktop list. */
function PostRow({ post, active, onClick }: { post: MyPost; active: boolean; onClick: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const first = post.groups[0]
  const need = post.groups.reduce((s, g) => s + g.drivers_needed, 0)
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${active ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2'}`}>
      <span className="grid h-11 w-14 shrink-0 place-items-center rounded-md bg-surface">{first && <VehicleArt kind={first.vehicle_type} className="h-7 w-11" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {post.groups.map((g) => label(VEHICLES, g.vehicle_type as never, lang)).join(', ')} · {t('post.needN', { n: need })}
        </span>
        <span className="block truncate text-sm text-text-2">{rupees(post.savings_monthly)}{t('card.perMonthSavings')}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <PostStatus status={post.status} />
          <span className="text-xs text-text-2">{t('post.interestedShort', { n: post.interested })}</span>
          {post.new_interested > 0 && <Badge tone="action">{t('post.newN', { n: post.new_interested })}</Badge>}
        </span>
      </span>
    </button>
  )
}

function useOwnerCard(post: MyPost) {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  return {
    title: profile?.business_name || profile?.name || '', photo_url: profile?.photo_url, verified: !!profile?.verified, post,
    place: profile?.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, i18n.language) : '',
  }
}

/** Pause / resume / filled / close. Close asks first. */
function StatusActions({ post, onChange }: { post: MyPost; onChange: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState<Status | ''>('')
  const [confirmClose, setConfirmClose] = useState(false)
  async function status(s: Status) {
    setBusy(s)
    try {
      await setPostStatus(post.id, s)
      track('post_status', { status: s })
      toast(t(`post.statusToast.${s}`), { tone: 'success' })
      onChange()
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy('')
      setConfirmClose(false)
    }
  }
  return (
    <>
      {post.status === 'under_check' && <div className="mt-3"><Note tone="warn">{t('post.underCheckNote')}</Note></div>}
      {post.status === 'live' && <div className="mt-3"><ShareJobButton post={post} from="my_posts" compact /><p className="mt-1.5 text-sm text-text-2">{t('share.jobOwnerHint')}</p></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {post.status === 'live' && <Button variant="outline" size="sm" loading={busy === 'paused'} onClick={() => void status('paused')}>{t('post.pause')}</Button>}
        {(post.status === 'paused' || post.status === 'filled') && <Button variant="outline" size="sm" loading={busy === 'live'} onClick={() => void status('live')}>{t('post.resume')}</Button>}
        {post.status !== 'filled' && post.status !== 'under_check' && <Button variant="outline" size="sm" icon={Icon.check} loading={busy === 'filled'} onClick={() => void status('filled')}>{t('post.filled')}</Button>}
        <Button variant="danger" size="sm" onClick={() => setConfirmClose(true)}>{t('post.close')}</Button>
      </div>
      <ConfirmDialog open={confirmClose} danger title={t('post.closeQ')} body={t('post.closeBody')} confirmLabel={t('post.close')}
        busy={busy === 'closed'} onCancel={() => setConfirmClose(false)} onConfirm={() => void status('closed')} />
    </>
  )
}

function useInterested(postId: string) {
  const [drivers, setDrivers] = useState<InterestedDriver[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    postInterests(postId).then((r) => { setDrivers(r.items); track('interested_open', { count: r.items.length }) }).catch(() => setError(true))
  }, [postId])
  return { drivers, setDrivers, error, load }
}

function InterestedList({ drivers, setDrivers, error, retry }: { drivers: InterestedDriver[] | null; setDrivers: (f: (c: InterestedDriver[] | null) => InterestedDriver[] | null) => void; error: boolean; retry: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  if (error) return <ErrorState onRetry={retry} />
  if (drivers === null) return <CardGrid><CardSkeletons count={2} /></CardGrid>
  if (!drivers.length) return <EmptyState compact icon={Icon.users} title={t('post.noInterestTitle')} body={t('post.noInterest')} />
  return (
    <CardGrid>
      {drivers.map((d) => (
        <DriverCard key={d.id} onOpen={() => void recordView(d.id).catch(() => {})}
          data={{ name: d.name || '', photo_url: d.photo_url, verified: d.verified, rating_avg: d.rating_avg, rating_count: d.rating_count, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
          menu={<CardMenu target={{ type: 'profile', id: d.id }} personId={d.id} name={d.name || ''} onBlocked={() => setDrivers((cur) => cur?.filter((x) => x.id !== d.id) || null)} />}
          actions={<DriverContact driverId={d.id} name={(d.name || '').split(' ')[0]} />} />
      ))}
    </CardGrid>
  )
}

/** Desktop right panel. */
function PostDetail({ post, onChange }: { post: MyPost; onChange: () => void }) {
  const { t } = useTranslation()
  const data = useOwnerCard(post)
  const inter = useInterested(post.id)
  useEffect(() => { inter.load() }, [inter.load])
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <JobCard status self data={data} actions={<StatusActions post={post} onChange={onChange} />} />
      <section>
        <SectionTitle className="mb-3" title={t('post.interestedN', { n: post.interested })}
          right={post.new_interested > 0 ? <Badge tone="action">{t('post.newN', { n: post.new_interested })}</Badge> : undefined} />
        <InterestedList drivers={inter.drivers} setDrivers={inter.setDrivers} error={inter.error} retry={inter.load} />
      </section>
    </div>
  )
}

/** Phone card with an expandable "interested drivers" list. */
function PostItem({ post, onChange, startOpen = false }: { post: MyPost; onChange: () => void; startOpen?: boolean }) {
  const { t } = useTranslation()
  const data = useOwnerCard(post)
  const inter = useInterested(post.id)
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const panelId = `interested-${post.id}`
  function toggle() {
    const next = !open
    setOpen(next)
    if (next && inter.drivers === null) inter.load()
  }
  // opened from a "driver is interested" notification: show the list right away
  useEffect(() => {
    if (startOpen) toggle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen])
  useEffect(() => {
    if (startOpen && inter.drivers !== null) list.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [startOpen, inter.drivers])
  return (
    <section>
      <JobCard status self data={data}
        actions={
          <>
            <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId}
              className="mt-3 flex min-h-12 w-full items-center justify-between gap-2 rounded-md bg-primary-soft px-4 font-semibold text-primary">
              <span className="flex items-center gap-2">
                {t('post.interestedN', { n: post.interested })}
                {post.new_interested > 0 && <Badge tone="action">{t('post.newN', { n: post.new_interested })}</Badge>}
              </span>
              <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>{Icon.down}</span>
            </button>
            <StatusActions post={post} onChange={onChange} />
          </>
        } />
      {open && (
        <div id={panelId} ref={list} className="mt-3 scroll-mt-20 border-l-2 border-primary/30 pl-3">
          <InterestedList drivers={inter.drivers} setDrivers={inter.setDrivers} error={inter.error} retry={inter.load} />
        </div>
      )}
    </section>
  )
}
