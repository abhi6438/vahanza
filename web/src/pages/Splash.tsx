import { brand } from '../lib/brand'

export default function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-header px-6 text-center text-white">
      <div className="mb-2 grid h-24 w-24 place-items-center rounded-[26px] bg-accent">
        <svg viewBox="0 0 80 50" width="70" height="44" aria-hidden>
          <rect x="4" y="12" width="46" height="24" rx="3" fill="#E8742A" />
          <path d="M50 18h14l10 10v8H50z" fill="#2F5DA8" />
          <path d="M54 21h9l6 7H54z" fill="#CFE3F7" />
          <circle cx="16" cy="40" r="5" fill="#2B2F2C" /><circle cx="36" cy="40" r="5" fill="#2B2F2C" /><circle cx="64" cy="40" r="5" fill="#2B2F2C" />
        </svg>
      </div>
      <div className="font-display text-4xl font-extrabold leading-none">{brand.name}</div>
      <div className="font-display text-xl opacity-90">{brand.nameHi}</div>
      <div className="opacity-85">{brand.taglineHi}</div>
    </div>
  )
}
