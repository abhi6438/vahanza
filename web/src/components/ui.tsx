import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export const Icon = {
  back: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>,
  speaker: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>,
  settings: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>,
  phone: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
}

/** Reads the visible screen text aloud in Hindi/English where the phone supports it. */
export function speak(text: string, lang: string) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'en' ? 'en-IN' : 'hi-IN'
  synth.speak(u)
}

export function TopBar({ title, back = true, right, readText }: { title: string; back?: boolean; right?: ReactNode; readText?: string }) {
  const nav = useNavigate()
  const { t, i18n } = useTranslation()
  return (
    <header className="flex items-center gap-2.5 border-b border-line bg-card px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      {back && (
        <button aria-label={t('back')} onClick={() => nav(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-brand">
          {Icon.back}
        </button>
      )}
      <h1 className="flex-1 text-lg font-bold">{title}</h1>
      {right}
      <button aria-label={t('listen')} onClick={() => speak(readText || title, i18n.language)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-brand">
        {Icon.speaker}
      </button>
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
