import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './ui'

type Tone = 'info' | 'success' | 'error'
interface Toast { id: number; text: string; tone: Tone; action?: { label: string; run: () => void } }
const Ctx = createContext<(text: string, opts?: { tone?: Tone; action?: Toast['action'] }) => void>(() => {})

/** Short confirmation after an action (snackbar). Bottom on phones (above the tabs), bottom-right on desktop. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)
  const show = useCallback((text: string, opts: { tone?: Tone; action?: Toast['action'] } = {}) => {
    const id = ++seq.current
    setItems((cur) => [...cur.slice(-2), { id, text, tone: opts.tone || 'info', action: opts.action }])
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), opts.action ? 6000 : 3200)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {/* on <body> above dialogs, so a message shown while a dialog is open is still seen */}
      {createPortal(<div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:items-end"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--toast-offset, 16px))' }}>
        {items.map((t) => (
          <div key={t.id} role="status" className="anim-rise pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md bg-text px-4 py-3 text-[0.95rem] text-bg shadow-md lg:w-auto lg:min-w-80">
            <span className={t.tone === 'error' ? 'text-error-soft' : t.tone === 'success' ? 'text-success-soft' : ''}>{t.tone === 'error' ? Icon.alert : t.tone === 'success' ? Icon.check : Icon.info}</span>
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button type="button" className="shrink-0 font-semibold text-action" onClick={() => { t.action!.run(); setItems((c) => c.filter((x) => x.id !== t.id)) }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>, document.body)}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
