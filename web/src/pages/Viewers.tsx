import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { SearchArt } from '../assets/illustrations'
import { Avatar } from '../components/photo'
import { PremiumLock, TickDot } from '../components/rewards'
import { AppShell } from '../components/shell'
import { EmptyState, ErrorState, Skeleton } from '../components/ui'
import { rewards, type Viewer } from '../lib/api'
import { label, placeName, VEHICLES } from '../lib/catalog'
import { trackScreen } from '../lib/track'

/**
 * "Who saw me": a driver's profile viewers (/viewers) or an owner's post viewers (/posts/:id/viewers).
 * Everyone sees the count; names are a Premium extra. No phone numbers here.
 */
export default function Viewers() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { id } = useParams()
  const post = !!id
  const [data, setData] = useState<{ n: number; week?: number; premium: boolean; items: Viewer[] } | null>(null)
  const [error, setError] = useState(false)
  const load = () => (post
    ? rewards.postViewers(id!).then((r) => setData({ n: r.count, premium: r.premium, items: r.items }))
    : rewards.profileViewers().then((r) => setData({ n: r.month, week: r.week, premium: r.premium, items: r.items }))
  ).catch(() => setError(true))
  useEffect(() => { trackScreen(post ? 'post_viewers' : 'profile_viewers'); void load() }, [id])

  return (
    <AppShell title={t(post ? 'rw.viewers.postTitle' : 'rw.viewers.title')} back width="narrow">
      {error && <ErrorState onRetry={() => { setError(false); void load() }} />}
      {!data && !error && <Skeleton className="h-48" />}
      {data && (
        <div className="flex flex-col gap-4">
          <section className="surface-hero rounded-xl p-card shadow-md">
            <p className="font-display text-[2.25rem] font-semibold leading-none">{data.n}</p>
            <p className="mt-1 text-white/85">{t(post ? 'rw.viewers.postCount' : 'rw.viewers.count', { week: data.week ?? 0 })}</p>
          </section>
          {!data.premium && data.n > 0 && (
            <PremiumLock from={post ? 'post_viewers' : 'profile_viewers'} title={t(post ? 'rw.lock.postViewers' : 'rw.lock.viewers')} body={t('rw.lock.viewersBody')} />
          )}
          {data.n === 0 && <EmptyState compact art={<SearchArt />} title={t('rw.viewers.none')} body={t(post ? 'rw.viewers.noneBodyPost' : 'rw.viewers.noneBody')} />}
          {data.premium && data.items.length > 0 && (
            <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              {data.items.map((v) => (
                <li key={v.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                  <span className="relative shrink-0">
                    <Avatar url={v.photo_url} name={v.name} size={44} />
                    <TickDot tick={v.tick} size={16} className="absolute -bottom-0.5 -right-0.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{v.firm || v.name || t('hist.anOwner')}</span>
                    <span className="block truncate text-sm text-text-2">
                      {[v.firm && v.name, v.district && v.state ? placeName(`${v.district}, ${v.state}`, lang) : null,
                        v.vehicles?.length ? v.vehicles.map((x) => label(VEHICLES, x as never, lang)).join(', ') : null,
                        v.experience_years != null ? t('card.exp', { n: v.experience_years }) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-text-3">{new Date(v.day).toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  )
}
