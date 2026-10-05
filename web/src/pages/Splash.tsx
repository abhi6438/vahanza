import { BrandMark } from '../components/shell'
import { brand } from '../lib/brand'

/** First paint while the saved login is restored. */
export default function Splash() {
  return (
    <div className="surface-hero flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <div className="anim-pop mb-4 [&>span]:rounded-[28%]"><BrandMark size={88} /></div>
      <div className="anim-rise font-display text-[2.5rem] font-semibold leading-none tracking-[-0.02em]">{brand.name}</div>
      <div className="anim-rise font-display text-lg text-white/80 [animation-delay:60ms]">{brand.nameHi}</div>
      <div className="anim-rise mt-2 text-sm text-white/70 [animation-delay:120ms]">{brand.taglineHi}</div>
      <div className="mt-8 h-1 w-24 overflow-hidden rounded-full bg-white/15" aria-hidden><div className="skeleton h-full w-full rounded-full !bg-[linear-gradient(90deg,transparent,var(--c-accent),transparent)]" /></div>
    </div>
  )
}
