import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PushAsk } from '../components/notify'
import { AppShell } from '../components/shell'
import { useToast } from '../components/toast'
import { Button, ConfirmDialog, Icon, Segmented, Switch } from '../components/ui'
import { notifications, type NotifyPrefs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { brand } from '../lib/brand'
import { bioAvailable, bioEnabled, lockEnabled, pinApi, setBioEnabled, setLockEnabled, type MyPin } from '../lib/pin'
import { isNative } from '../lib/platform'
import { useIsDesktop } from '../lib/layout'
import { loadTheme, saveTheme, type ThemePref } from '../lib/theme'
import { track, trackScreen } from '../lib/track'

type Key = 'language' | 'appearance' | 'notifications' | 'security' | 'account' | 'privacy' | 'help'
const ICONS: Record<Key, ReactNode> = {
  language: Icon.globe, appearance: Icon.palette, notifications: Icon.bell, security: Icon.lock, account: Icon.user, privacy: Icon.shield, help: Icon.help,
}

/**
 * Settings.
 *   desktop: categories on the left, the chosen one on the right (?s=<category>)
 *   phone:   every category as a grouped card, one scroll
 */
export default function Settings() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  useEffect(() => { trackScreen('settings') }, [])
  const isUser = profile?.role === 'driver' || profile?.role === 'owner'
  const keys: Key[] = ['language', 'appearance', ...(isUser ? (['notifications'] as Key[]) : []), 'security', 'account', 'privacy', 'help']
  const current = (keys.includes(params.get('s') as Key) ? params.get('s') : 'language') as Key

  const body = (k: Key) => {
    switch (k) {
      case 'language': return <LanguageSection />
      case 'appearance': return <AppearanceSection />
      case 'notifications': return isUser ? <NotifySection role={profile!.role as 'driver' | 'owner'} /> : null
      case 'security': return <SecuritySection />
      case 'account': return <AccountSection />
      case 'privacy': return <PrivacySection isUser={isUser} />
      case 'help': return <HelpSection />
    }
  }

  return (
    <AppShell title={t('settings.title')} back={!desktop} width="default">
      {desktop ? (
        <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-8">
          <nav aria-label={t('settings.title')} className="sticky top-[5.5rem] flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-1.5 shadow-sm">
            {keys.map((k) => (
              <button key={k} type="button" aria-current={current === k ? 'page' : undefined}
                onClick={() => setParams({ s: k }, { replace: true })}
                className={`press flex min-h-ctl-md items-center gap-3 rounded-md px-2 text-left text-sm font-medium ${current === k ? 'bg-primary-soft font-semibold text-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`}>
                <span className={`icon-tile size-7 [&>svg]:size-icon-sm ${current === k ? 'bg-primary text-on-primary' : 'bg-surface-2 text-text-2'}`}>{ICONS[k]}</span>{t(`settings.cat.${k}`)}
              </button>
            ))}
          </nav>
          <section aria-labelledby="settings-h" className="min-w-0 rounded-lg border border-border bg-surface p-6 shadow-sm xl:p-8">
            <h2 id="settings-h" className="font-display text-xl font-semibold tracking-[-0.01em]">{t(`settings.cat.${current}`)}</h2>
            <p className="mb-6 mt-1 text-sm text-text-2">{t(`settings.catSub.${current}`)}</p>
            <div className="max-w-2xl">{body(current)}</div>
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {keys.map((k) => (
            <section key={k} aria-labelledby={`s-${k}`}>
              <h2 id={`s-${k}`} className="mb-2 flex items-center gap-2.5 px-1 font-display text-base font-semibold">
                <span className="icon-tile size-7 bg-primary-soft text-primary [&>svg]:size-icon-sm">{ICONS[k]}</span>{t(`settings.cat.${k}`)}
              </h2>
              <div className="rounded-lg border border-border bg-surface p-card shadow-sm">{body(k)}</div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}

/** Label + control row; stacks on phones, side by side on wide screens. */
function SettingRow({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {sub && <p className="text-sm text-text-2">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function LanguageSection() {
  const { t } = useTranslation()
  const { lang, setLang } = useAuth()
  return (
    <SettingRow label={t('settings.language')} sub={t('settings.languageSub')}>
      <Segmented label={t('settings.language')} value={lang} onChange={(l) => void setLang(l)}
        options={[{ key: 'hi', label: 'हिंदी' }, { key: 'en', label: 'English' }]} />
    </SettingRow>
  )
}

function AppearanceSection() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<ThemePref>('system')
  useEffect(() => { void loadTheme().then(setTheme) }, [])
  return (
    <SettingRow label={t('settings.theme')} sub={t('settings.themeSub')}>
      <Segmented label={t('settings.theme')} value={theme}
        onChange={(p) => { setTheme(p); void saveTheme(p); track('theme_set', { theme: p }) }}
        options={(['system', 'light', 'dark'] as ThemePref[]).map((p) => ({ key: p, label: t(`settings.${p}`) }))} />
    </SettingRow>
  )
}

/** Which alerts to get. "Post approved / not approved" always comes. */
function NotifySection({ role }: { role: 'driver' | 'owner' }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null)
  useEffect(() => { notifications.prefs().then(setPrefs).catch(() => {}) }, [])
  const keys: (keyof NotifyPrefs)[] = role === 'driver' ? ['new_post', 'interest_seen'] : ['new_interest']
  async function flip(k: keyof NotifyPrefs) {
    if (!prefs) return
    const before = prefs
    const next = !prefs[k]
    setPrefs({ ...prefs, [k]: next })
    track('notify_pref', { kind: k, on: next })
    try { setPrefs(await notifications.setPrefs({ [k]: next })) } catch { setPrefs(before); toast(t('error.generic'), { tone: 'error' }) }
  }
  return (
    <div className="flex flex-col gap-4">
      <PushAsk from="settings" force why={role === 'owner' ? t('notif.whyOwner') : t('notif.whyDriver')} />
      <div className="divide-y divide-border">
        {keys.map((k) => (
          <Switch key={k} checked={prefs ? prefs[k] : true} disabled={!prefs} onChange={() => void flip(k)} label={t(`notif.pref.${k}`)} />
        ))}
      </div>
      <p className="text-sm text-text-2">{t('settings.alwaysNotified')}</p>
    </div>
  )
}

/** Sprint 11: MPIN (log in without OTP) and, in the APK, the fingerprint / MPIN app lock. */
function SecuritySection() {
  const { t } = useTranslation()
  const { profile, sendOtp } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [mine, setMine] = useState<MyPin | null>(null)
  const [lock, setLock] = useState(true)
  const [bio, setBio] = useState(true)
  const [hasBio, setHasBio] = useState(false)
  useEffect(() => {
    pinApi.mine().then(setMine).catch(() => {})
    if (!isNative) return
    void lockEnabled().then(setLock)
    void bioEnabled().then(setBio)
    void bioAvailable().then(setHasBio)
  }, [])
  const phone = (profile?.phone || '').replace(/^91/, '')
  async function forgot() {
    try {
      await sendOtp(phone)
      nav('/otp', { state: { phone, resetPin: true } })
    } catch {
      toast(t('error.generic'), { tone: 'error' })
    }
  }
  return (
    <div>
      <SettingRow label={t('pin.mpin')} sub={mine?.has_pin ? t('pin.mpinOn') : t('pin.mpinOff')}>
        <div className="flex flex-wrap gap-2">
          <Button variant={mine?.has_pin ? 'outline' : 'primary'} icon={Icon.lock} disabled={!mine} onClick={() => nav('/pin')}>
            {mine?.has_pin ? t('pin.change') : t('pin.create')}
          </Button>
          {mine?.has_pin && <Button variant="ghost" onClick={() => void forgot()}>{t('pin.forgotShort')}</Button>}
        </div>
      </SettingRow>
      {isNative && (
        <div className="divide-y divide-border border-t border-border">
          <Switch checked={lock && !!mine?.has_pin} disabled={!mine?.has_pin} label={t('lock.setting')}
            sub={mine?.has_pin ? t('lock.settingSub') : t('lock.needPin')}
            onChange={(v) => { setLock(v); void setLockEnabled(v); track('lock_setting', { on: v }) }} />
          {hasBio && (
            <Switch checked={bio} disabled={!lock || !mine?.has_pin} label={t('lock.bioSetting')} sub={t('lock.bioSettingSub')}
              onChange={(v) => { setBio(v); void setBioEnabled(v); track('lock_bio_setting', { on: v }) }} />
          )}
        </div>
      )}
    </div>
  )
}

function AccountSection() {
  const { t } = useTranslation()
  const { profile, logout } = useAuth()
  const [ask, setAsk] = useState<'' | 'one' | 'all'>('')
  const isUser = profile?.role === 'driver' || profile?.role === 'owner'
  const phone = (profile?.phone || '').replace(/^91/, '')
  return (
    <div>
      <SettingRow label={t('settings.number')} sub={`+91 ${phone.slice(0, 5)} ${phone.slice(5)}`}>
        {isUser && <Link to="/setup?edit" className="font-semibold text-primary hover:underline">{t('profile.edit')}</Link>}
      </SettingRow>
      <SettingRow label={t('settings.logout')} sub={t('settings.logoutSub')}>
        <Button variant="outline" icon={Icon.logout} onClick={() => setAsk('one')}>{t('settings.logout')}</Button>
      </SettingRow>
      <SettingRow label={t('settings.logoutAll')} sub={t('settings.logoutAllSub')}>
        <Button variant="danger" onClick={() => setAsk('all')}>{t('settings.logoutAll')}</Button>
      </SettingRow>
      <ConfirmDialog open={!!ask} danger={ask === 'all'} title={ask === 'all' ? t('settings.logoutAllQ') : t('settings.logoutQ')}
        confirmLabel={ask === 'all' ? t('settings.logoutAll') : t('settings.logout')}
        onCancel={() => setAsk('')} onConfirm={() => { const all = ask === 'all'; setAsk(''); void logout(all) }} />
    </div>
  )
}

function PrivacySection({ isUser }: { isUser: boolean }) {
  const { t } = useTranslation()
  const link = 'flex min-h-ctl-lg items-center gap-3 border-b border-border py-2 font-medium last:border-0 hover:text-primary'
  return (
    <div>
      <ul className="mb-4 space-y-2 text-sm text-text-2">
        <li className="flex gap-2"><span className="text-success">{Icon.check}</span>{t('settings.privacy1')}</li>
        <li className="flex gap-2"><span className="text-success">{Icon.check}</span>{t('settings.privacy2')}</li>
      </ul>
      <div>
        {isUser && <Link to="/blocked" className={link}><span className="text-primary">{Icon.ban}</span><span className="flex-1">{t('trust.blockedList')}</span>{Icon.chevron}</Link>}
        <Link to="/legal" className={link}><span className="text-primary">{Icon.doc}</span><span className="flex-1">{t('login.terms')}</span>{Icon.chevron}</Link>
      </div>
    </div>
  )
}

function HelpSection() {
  const { t } = useTranslation()
  return (
    <div>
      <SettingRow label={t('settings.help')} sub={brand.supportPhone}>
        <a href={`tel:${brand.supportPhone}`} className="inline-flex min-h-ctl-md items-center gap-2 rounded-md bg-success px-4 font-semibold text-on-success">{Icon.phone}{t('card.call')}</a>
      </SettingRow>
      <SettingRow label={t('settings.grievance')} sub={<>{brand.grievanceOfficer.name} · <span className="select-all">{brand.grievanceOfficer.email}</span></>}>
        <span />
      </SettingRow>
      <SettingRow label={t('settings.version')} sub={__APP_VERSION__}><span /></SettingRow>
    </div>
  )
}
