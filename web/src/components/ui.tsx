import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { isDarkNow, saveTheme } from '../lib/theme'
import { track } from '../lib/track'

export const Icon = {
  back: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>,
  // gear (settings) — a clear cog so it is not mistaken for the light/dark switch
  settings: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  pin: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  plus: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  search: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  home: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  list: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>,
  wrench: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" /></svg>,
  user: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" /></svg>,
  heart: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z" /></svg>,
  sparkle: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>,
  whatsapp: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2z" /></svg>,
  sun: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>,
  phone: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
}

export function TopBar({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { t } = useTranslation()
  return (
    <header className="flex items-center gap-2.5 border-b border-line bg-card px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      {back && (
        <button aria-label={t('back')} onClick={() => nav(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-brand">
          {Icon.back}
        </button>
      )}
      <h1 className="flex-1 text-lg font-bold">{title}</h1>
      {right}
    </header>
  )
}

export function BigButton({ children, variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50'
  const look = variant === 'primary' ? 'bg-brand text-white' : 'border-2 border-brand bg-card text-brand'
  return (
    <button className={`${base} ${look} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">{children}</main>
      {footer && (
        <footer className="sticky bottom-0 border-t border-line bg-bg px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <div className="mx-auto max-w-md">{footer}</div>
        </footer>
      )}
    </div>
  )
}

export const H = ({ children }: { children: ReactNode }) => <p className="mb-1 font-display text-[26px] font-bold leading-tight">{children}</p>
export const Sub = ({ children }: { children: ReactNode }) => <p className="mb-5 text-muted">{children}</p>

/** One-tap light/dark switch for headers. Shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const [dark, setDark] = useState(isDarkNow)
  return (
    <button type="button" aria-label={dark ? t('settings.light') : t('settings.dark')} className={className}
      onClick={() => { const next = !dark; setDark(next); void saveTheme(next ? 'dark' : 'light'); track('theme_set', { theme: next ? 'dark' : 'light', from: 'header' }) }}>
      {dark ? Icon.sun : Icon.moon}
    </button>
  )
}
