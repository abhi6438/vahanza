import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SuccessArt, VerifyArt } from '../assets/illustrations'
import { shrinkImage } from '../components/photo'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, Card, ErrorState, Icon, Note, Skeleton } from '../components/ui'
import { ApiError, photoSrc, verification, type Verification } from '../lib/api'
import { useAuth } from '../lib/auth'
import { track, trackScreen } from '../lib/track'

/**
 * "Get the Verified badge" (Sprint 10): a document photo + a selfie, checked by an admin.
 * Driver: driving licence. Owner: shop board / GST certificate / vehicle RC.
 * Photos are deleted after the check.
 */
export default function Verify() {
  const { t } = useTranslation()
  const { profile, applyMe, driver, fleet } = useAuth()
  const toast = useToast()
  const [v, setV] = useState<Verification | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<'' | 'doc' | 'selfie' | 'submit'>('')
  useEffect(() => {
    trackScreen('verify')
    verification.mine().then((r) => {
      setV(r)
      // approved since the app last loaded the profile: show the badge everywhere
      if (r.verified && profile && !profile.verified) applyMe({ exists: true, profile: { ...profile, verified: true }, driver, fleet })
    }).catch(() => setError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const isDriver = profile?.role === 'driver'

  async function upload(part: 'doc' | 'selfie', file: File | undefined) {
    if (!file) return
    setBusy(part)
    try {
      setV(await verification.put(part, await shrinkImage(file, 1400)))
      track('verify_photo', { part })
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'too_large' ? t('verify.tooLarge') : t('error.generic'), { tone: 'error' })
    } finally {
      setBusy('')
    }
  }
  async function submit() {
    setBusy('submit')
    try {
      setV(await verification.submit())
      track('verify_submit')
      toast(t('verify.sentToast'), { tone: 'success' })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    } finally {
      setBusy('')
    }
  }

  const editable = v && !v.verified && (v.status === 'none' || v.status === 'draft' || v.status === 'rejected')
  const draft = v?.status === 'draft' ? v : null
  return (
    <AppShell title={t('verify.title')} back width="narrow">
      <div className="flex flex-col gap-4">
        {error && <ErrorState onRetry={() => window.location.reload()} />}
        {!v && !error && <Skeleton className="h-64" />}
        {v?.verified && (
          <Card className="text-center">
            <div className="mx-auto w-40"><SuccessArt /></div>
            <p className="mt-3 text-xl font-semibold">{t('verify.doneTitle')}</p>
            <p className="mt-1 text-text-2">{t('verify.doneBody')}</p>
          </Card>
        )}
        {v && !v.verified && v.status === 'pending' && (
          <Card className="text-center">
            <div className="mx-auto w-40"><VerifyArt /></div>
            <p className="mt-3 text-xl font-semibold">{t('verify.pendingTitle')}</p>
            <p className="mt-1 text-text-2">{t('verify.pendingBody')}</p>
          </Card>
        )}
        {editable && (
          <>
            {v.status === 'rejected' && <Note tone="error">{t('verify.rejected', { reason: v.reason ? t(`verify.reason.${v.reason}`) : '' })}</Note>}
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="mx-auto w-36 shrink-0 sm:order-last sm:w-32"><VerifyArt /></div>
              <div className="min-w-0 flex-1">
              <p className="font-display font-semibold">{t('verify.why')}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-text-2">
                <li className="flex gap-2"><span className="text-success">{Icon.check}</span>{t(isDriver ? 'verify.whyDriver' : 'verify.whyOwner')}</li>
                <li className="flex gap-2"><span className="text-success">{Icon.check}</span>{t('verify.whyBadge')}</li>
                <li className="flex gap-2"><span className="text-success">{Icon.shield}</span>{t('verify.privacy')}</li>
              </ul>
              </div>
            </Card>
            <PhotoStep n={1} title={t(isDriver ? 'verify.docDriver' : 'verify.docOwner')} sub={t(isDriver ? 'verify.docDriverSub' : 'verify.docOwnerSub')}
              url={draft?.doc_url} busy={busy === 'doc'} capture="environment" onFile={(f) => void upload('doc', f)} />
            <PhotoStep n={2} title={t('verify.selfie')} sub={t('verify.selfieSub')}
              url={draft?.selfie_url} busy={busy === 'selfie'} capture="user" onFile={(f) => void upload('selfie', f)} />
            <Button variant="action" size="lg" block loading={busy === 'submit'} disabled={!draft?.doc_url || !draft?.selfie_url} icon={Icon.shield} onClick={() => void submit()}>
              {t('verify.submit')}
            </Button>
          </>
        )}
      </div>
    </AppShell>
  )
}

function PhotoStep({ n, title, sub, url, busy, capture, onFile }: { n: number; title: string; sub: ReactNode; url?: string | null; busy: boolean; capture: 'user' | 'environment'; onFile: (f: File | undefined) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const src = photoSrc(url)
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-semibold text-on-primary shadow-sm">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-text-2">{sub}</p>
        </div>
        {src && <span className="text-success" aria-label={t('verify.added')}>{Icon.check}</span>}
      </div>
      {src && <img src={src} alt={title} className="mt-3 max-h-48 w-full rounded-md border border-border object-contain" />}
      <input ref={input} type="file" accept="image/*" capture={capture} className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      <Button variant={src ? 'outline' : 'primary'} block className="mt-3" loading={busy} icon={Icon.upload} onClick={() => input.current?.click()}>
        {src ? t('verify.retake') : t('verify.take')}
      </Button>
    </Card>
  )
}
