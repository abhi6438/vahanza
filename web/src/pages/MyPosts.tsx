import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DriverCard, JobCard } from '../components/cards'
import { Note } from '../components/form'
import { DriverContact, TabPage } from '../components/home'
import { PushAsk } from '../components/notify'
import { CardMenu } from '../components/trust'
import { Icon } from '../components/ui'
import { myPosts, postInterests, setPostStatus, type InterestedDriver, type MyPost } from '../lib/api'
import { useAuth } from '../lib/auth'
import { placeName } from '../lib/catalog'
import { track, trackScreen } from '../lib/track'

/** Owner's "My posts" tab: status, who is interested, and pause / filled / close. */
export default function MyPosts() {
  const { t } = useTranslation()
  const { fleet } = useAuth()
  const created = (useLocation().state as { created?: string } | null)?.created
  const openId = useSearchParams()[0].get('open')
  const [items, setItems] = useState<MyPost[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    myPosts().then((r) => setItems(r.items)).catch(() => setError(true))
  }, [])
  useEffect(() => { trackScreen('my_posts'); load() }, [load])

  return (
    <TabPage>
      <div className="bg-header px-4 pb-4 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">{t('tabs.posts')}</h1>
          <Link to={fleet.length ? '/posts/new' : '/setup?step=fleet&next=/posts/new'} onClick={() => track('post_tap', { from: 'my_posts' })}
            className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-[#2A1C00]">
            {Icon.plus}{t('post.new')}
          </Link>
        </div>
      </div>
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-4">
        {created && <Note tone={created === 'live' ? 'info' : 'warn'}>{created === 'live' ? t('post.createdLive') : t('post.createdCheck')}</Note>}
        {!!items?.length && <PushAsk from={created ? 'post_created' : 'my_posts'} why={t('notif.whyOwner')} />}
        {items === null && !error && <div className="h-48 animate-pulse rounded-2xl bg-card" />}
        {error && <p className="rounded-xl bg-card p-4 text-muted">{t('error.server')}</p>}
        {items?.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-4 text-muted">{t('post.none')}</p>}
        {items?.map((p) => <PostItem key={p.id} post={p} onChange={load} startOpen={p.id === openId} />)}
      </main>
    </TabPage>
  )
}

function PostItem({ post, onChange, startOpen = false }: { post: MyPost; onChange: () => void; startOpen?: boolean }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [drivers, setDrivers] = useState<InterestedDriver[] | null>(null)
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  async function toggleList() {
    const next = !open
    setOpen(next)
    if (next && drivers === null) {
      const r = await postInterests(post.id)
      setDrivers(r.items)
      track('interested_open', { count: r.items.length })
    }
  }
  // opened from a "driver is interested" notification: show the list right away
  useEffect(() => {
    if (startOpen) void toggleList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen])
  useEffect(() => {
    if (startOpen && drivers !== null) list.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [startOpen, drivers])
  async function status(s: 'live' | 'paused' | 'filled' | 'closed') {
    setBusy(true)
    try {
      await setPostStatus(post.id, s)
      track('post_status', { status: s })
      onChange()
    } finally {
      setBusy(false)
    }
  }
  const btn = 'min-h-11 flex-1 rounded-xl border-2 border-line px-2 text-sm font-bold disabled:opacity-50'
  const lang = i18n.language
  return (
    <section>
      <JobCard status self
        data={{ title: profile?.business_name || profile?.name || '', photo_url: profile?.photo_url, place: profile?.district && profile.state ? placeName(`${profile.district}, ${profile.state}`, lang) : '', verified: !!profile?.verified, post }}
        actions={
          <>
            {post.status === 'under_check' && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-ink">{t('post.underCheckNote')}</p>}
            <button type="button" onClick={() => void toggleList()} className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl bg-brand-soft px-4 font-bold text-brand">
              <span>{t('post.interestedN', { n: post.interested })}{post.new_interested > 0 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">{t('post.newN', { n: post.new_interested })}</span>}</span>
              <span className={open ? 'rotate-90' : '-rotate-90'}>{Icon.back}</span>
            </button>
            <div className="mt-2 flex gap-2">
              {post.status === 'live' && <button type="button" disabled={busy} className={btn} onClick={() => void status('paused')}>{t('post.pause')}</button>}
              {(post.status === 'paused' || post.status === 'filled') && <button type="button" disabled={busy} className={btn} onClick={() => void status('live')}>{t('post.resume')}</button>}
              {post.status !== 'filled' && post.status !== 'under_check' && <button type="button" disabled={busy} className={btn} onClick={() => void status('filled')}>{t('post.filled')}</button>}
              <button type="button" disabled={busy} className={`${btn} text-danger`} onClick={() => void status('closed')}>{t('post.close')}</button>
            </div>
          </>
        } />
      {open && (
        <div ref={list} className="mt-3 flex scroll-mt-20 flex-col gap-3 border-l-4 border-brand-soft pl-3">
          {drivers === null && <div className="h-32 animate-pulse rounded-2xl bg-card" />}
          {drivers?.length === 0 && <p className="text-sm text-muted">{t('post.noInterest')}</p>}
          {drivers?.map((d) => (
            <DriverCard key={d.id}
              data={{ name: d.name || '', photo_url: d.photo_url, verified: d.verified, rating_avg: d.rating_avg, rating_count: d.rating_count, place: d.district && d.state ? placeName(`${d.district}, ${d.state}`, lang) : '', d }}
              menu={<CardMenu target={{ type: 'profile', id: d.id }} personId={d.id} name={d.name || ''} onBlocked={() => setDrivers((cur) => cur?.filter((x) => x.id !== d.id) || null)} />}
              actions={<DriverContact driverId={d.id} name={(d.name || '').split(' ')[0]} />} />
          ))}
        </div>
      )}
    </section>
  )
}
