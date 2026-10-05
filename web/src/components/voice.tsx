import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../lib/track'
import { Icon } from './ui'

/**
 * "Speak instead of typing" for people who find typing hard (Sprint 8).
 * Uses the phone browser's own speech recognition (Chrome on Android, Hindi or English).
 * Where it is missing (the APK's web view, Firefox) the button is not shown; the keyboard's
 * own mic still works there.
 */
type Rec = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean
  start: () => void; stop: () => void; abort: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecCtor = new () => Rec

function recognizer(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}
export const canSpeak = () => typeof window !== 'undefined' && !!recognizer()

export function MicButton({ onText, label }: { onText: (text: string) => void; label: string }) {
  const { t, i18n } = useTranslation()
  const [on, setOn] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef<Rec | null>(null)
  useEffect(() => () => rec.current?.abort(), [])
  if (!canSpeak()) return null

  function start() {
    const Ctor = recognizer()
    if (!Ctor) return
    if (on) { rec.current?.stop(); return }
    const r = new Ctor()
    r.lang = i18n.language === 'en' ? 'en-IN' : 'hi-IN'
    r.interimResults = false
    r.maxAlternatives = 1
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0]?.transcript || '').join(' ').trim()
      if (text) { onText(text); track('voice_input', { ok: true }) }
    }
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? t('voice.denied') : e.error === 'no-speech' ? t('voice.noSpeech') : t('voice.fail'))
      track('voice_input', { ok: false, error: e.error })
    }
    r.onend = () => setOn(false)
    rec.current = r
    setError('')
    setOn(true)
    try { r.start() } catch { setOn(false) }
  }

  return (
    <>
      <button type="button" onClick={start} aria-label={on ? t('voice.stop') : `${t('voice.speak')}: ${label}`} title={t('voice.speak')} aria-pressed={on}
        className={`grid size-ctl-lg shrink-0 place-items-center rounded-md border text-[length:var(--icon-size-md)] transition-colors ${on ? 'animate-pulse border-error bg-error-soft text-error' : 'border-border bg-surface text-primary hover:bg-primary-soft'}`}>
        {Icon.mic}
      </button>
      {on && <span className="sr-only" role="status">{t('voice.listening')}</span>}
      {error && <span role="alert" className="basis-full text-sm text-error">{error}</span>}
    </>
  )
}
