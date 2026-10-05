/**
 * Vahanza illustration set — one style everywhere:
 * flat vectors, soft rounded shapes, a pale teal blob behind, brand teal + saffron, no outlines.
 * Colours come from CSS variables (--ill-* in styles.css), so every picture re-colours itself in dark mode
 * and follows a white-label brand. Decorative only (aria-hidden): the text next to them says it all.
 */
import type { ReactNode } from 'react'

const Art = ({ children, vb = '0 0 240 180', className = '' }: { children: ReactNode; vb?: string; className?: string }) => (
  <svg viewBox={vb} className={`h-auto w-full ${className}`} aria-hidden focusable="false">{children}</svg>
)
const Blob = () => <path className="i-blob" d="M36 92c-4-36 26-62 70-66 48-4 92 10 100 46 8 38-14 76-62 84-52 8-104-20-108-64z" />
const Ground = ({ y = 160, w = 70 }: { y?: number; w?: number }) => <ellipse className="i-sh" cx="120" cy={y} rx={w} ry="6" />
const Spark = ({ x, y, s = 1, c = 'i-s' }: { x: number; y: number; s?: number; c?: string }) => (
  <path className={c} transform={`translate(${x} ${y}) scale(${s})`} d="M0-7c1 4 3 6 7 7-4 1-6 3-7 7-1-4-3-6-7-7 4-1 6-3 7-7z" />
)

/** Small truck used inside other pictures. */
const MiniTruck = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect className="i-s" x="0" y="0" width="34" height="20" rx="3" />
    <rect className="i-sd" x="0" y="15" width="34" height="3" />
    <path className="i-t" d="M34 5h10l7 8v8H34z" />
    <path className="i-p" d="M37 8h6l4 5h-10z" opacity=".9" />
    <circle className="i-ink" cx="9" cy="22" r="4.5" /><circle className="i-ink" cx="41" cy="22" r="4.5" />
    <circle className="i-l" cx="9" cy="22" r="1.6" /><circle className="i-l" cx="41" cy="22" r="1.6" />
  </g>
)

/** Find work / drivers near you: a map with a route, a pin and a truck. */
export const DiscoverArt = () => (
  <Art>
    <Blob />
    <Ground y={150} w={78} />
    <rect className="i-p" x="52" y="44" width="136" height="98" rx="16" />
    <path className="is-l" d="M52 78h136M96 44v98M150 44v98M52 116h44" strokeWidth="5" fill="none" />
    <path className="is-tm" d="M64 130c18-4 22-30 46-30s26-24 50-26" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" fill="none" />
    <MiniTruck x={70} y={104} s={0.8} />
    <path className="i-sd" d="M161 74c0 0-16-14-16-26a16 16 0 1 1 32 0c0 12-16 26-16 26z" transform="translate(0 4)" opacity=".35" />
    <path className="i-s" d="M160 70s-17-15-17-28a17 17 0 1 1 34 0c0 13-17 28-17 28z" />
    <circle className="i-p" cx="160" cy="42" r="6.5" />
    <Spark x={194} y={40} s={0.9} c="i-tm" /><Spark x={44} y={58} s={0.7} />
  </Art>
)

/** A driver at the wheel (driver choice, driver empty states). */
export const DriverArt = () => (
  <Art>
    <Blob />
    <path className="i-t" d="M72 176c0-38 20-60 48-60s48 22 48 60z" />
    <path className="i-td" d="M106 118l14 18 14-18c-4-2-9-3-14-3s-10 1-14 3z" />
    <rect className="i-skd" x="111" y="100" width="18" height="20" rx="6" />
    <circle className="i-sk" cx="120" cy="86" r="23" />
    <path className="i-h" d="M97 86c0-15 10-26 23-26s23 11 23 26c-6-6-14-9-23-9s-17 3-23 9z" />
    <path className="i-td" d="M95 80c0-17 11-29 25-29s25 12 25 29z" />
    <path className="i-s" d="M118 76h36a5 5 0 0 1 0 10h-36z" />
    <circle className="i-sd" cx="120" cy="60" r="3" />
    <circle className="is-ink" cx="120" cy="150" r="30" strokeWidth="7" fill="none" />
    <path className="is-ink" d="M92 150h56M120 150v28" strokeWidth="6" strokeLinecap="round" />
    <circle className="i-ink" cx="120" cy="150" r="8" />
    <circle className="i-s" cx="120" cy="150" r="3" />
    <Spark x={190} y={52} /><Spark x={50} y={70} s={0.7} c="i-tm" />
  </Art>
)

/** An owner's truck (owner choice, "post a job"). */
export const FleetArt = () => (
  <Art>
    <Blob />
    <path className="is-l" d="M28 150h184" strokeWidth="5" strokeLinecap="round" />
    <path className="is-p" d="M48 150h18M90 150h18M132 150h18M174 150h18" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    <Ground y={146} w={84} />
    <rect className="i-s" x="40" y="72" width="108" height="60" rx="7" />
    <rect className="i-sd" x="40" y="118" width="108" height="6" />
    <path className="i-sd" d="M58 80v32M76 80v32M94 80v32M112 80v32M130 80v32" stroke="currentColor" opacity=".18" />
    <path className="i-t" d="M148 86h30l20 24v22h-50z" />
    <path className="i-p" d="M155 93h20l13 16h-33z" opacity=".92" />
    <rect className="i-td" x="148" y="120" width="50" height="6" />
    <circle className="i-ink" cx="66" cy="136" r="12" /><circle className="i-l" cx="66" cy="136" r="4.5" />
    <circle className="i-ink" cx="120" cy="136" r="12" /><circle className="i-l" cx="120" cy="136" r="4.5" />
    <circle className="i-ink" cx="178" cy="136" r="12" /><circle className="i-l" cx="178" cy="136" r="4.5" />
    <rect className="i-s" x="194" y="112" width="6" height="5" rx="1.5" />
    <Spark x={60} y={46} s={0.9} c="i-tm" /><Spark x={196} y={60} />
  </Art>
)

/** Coming soon: mechanics — a car front, a wrench and a gear. */
export const MechanicArt = () => (
  <Art>
    <Blob />
    <Ground y={152} w={66} />
    <path className="i-t" d="M66 118c0-10 4-16 10-24l10-16c3-5 8-8 14-8h40c6 0 11 3 14 8l10 16c6 8 10 14 10 24v24c0 4-3 6-6 6H72c-3 0-6-2-6-6z" />
    <path className="i-p" d="M88 96l8-14c2-3 4-4 7-4h34c3 0 5 1 7 4l8 14z" opacity=".92" />
    <rect className="i-td" x="66" y="120" width="108" height="10" />
    <circle className="i-s" cx="84" cy="112" r="7" /><circle className="i-s" cx="156" cy="112" r="7" />
    <rect className="i-ink" x="72" y="140" width="18" height="14" rx="4" /><rect className="i-ink" x="150" y="140" width="18" height="14" rx="4" />
    <g transform="translate(176 46) rotate(35)">
      <path className="i-sd" d="M-4 0h8v52a4 4 0 0 1-8 0z" />
      <path className="i-s" d="M-13-10a14 14 0 0 1 26 0l-6 4v8h-14v-8z" />
    </g>
    <g transform="translate(58 50)">
      <path className="i-tm" d="M0-16l4 1 2 5 5 2 4-3 6 6-3 4 2 5 5 2v8l-5 2-2 5 3 4-6 6-4-3-5 2-2 5h-8l-2-5-5-2-4 3-6-6 3-4-2-5-5-2v-8l5-2 2-5-3-4 6-6 4 3 5-2 2-5z" />
      <circle className="i-blob" cx="0" cy="4" r="7" />
    </g>
  </Art>
)

/** Verified badge: an ID card and a shield with a tick. */
export const VerifyArt = () => (
  <Art>
    <Blob />
    <Ground y={152} w={70} />
    <rect className="i-p" x="46" y="46" width="128" height="88" rx="14" />
    <rect className="i-tm" x="46" y="46" width="128" height="20" rx="14" />
    <rect className="i-tm" x="46" y="58" width="128" height="8" />
    <circle className="i-blob" cx="80" cy="96" r="17" />
    <circle className="i-sk" cx="80" cy="92" r="8" />
    <path className="i-t" d="M66 110c2-8 7-12 14-12s12 4 14 12z" />
    <rect className="i-l" x="106" y="82" width="50" height="7" rx="3.5" />
    <rect className="i-l" x="106" y="96" width="38" height="7" rx="3.5" />
    <rect className="i-l" x="106" y="110" width="44" height="7" rx="3.5" />
    <path className="i-t" d="M170 94l26 9v19c0 17-11 29-26 34-15-5-26-17-26-34v-19z" />
    <path className="is-w" d="M159 124l8 8 15-17" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Spark x={204} y={78} />
  </Art>
)

/** No notifications yet. */
export const BellArt = () => (
  <Art>
    <Blob />
    <Ground y={152} w={52} />
    <path className="i-s" d="M120 40c-22 0-38 17-38 40v26l-10 16h96l-10-16V80c0-23-16-40-38-40z" />
    <path className="i-sd" d="M72 122h96l-4 8H76z" />
    <circle className="i-sd" cx="120" cy="36" r="6" />
    <path className="i-ink" d="M106 134a14 14 0 0 0 28 0z" />
    <path className="is-tm" d="M60 66c-6 8-8 18-6 28M180 66c6 8 8 18 6 28" strokeWidth="5" strokeLinecap="round" fill="none" />
    <circle className="i-t" cx="156" cy="56" r="13" />
    <path className="is-w" d="M150 56l4 4 8-8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Art>
)

/** No results for this filter. */
export const SearchArt = () => (
  <Art>
    <Blob />
    <Ground y={154} w={60} />
    <path className="is-l" d="M40 140c30-6 40-30 80-30s56-24 84-28" strokeWidth="6" strokeLinecap="round" fill="none" />
    <path className="is-p" d="M48 138c26-6 38-26 72-26s52-22 78-26" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" fill="none" />
    <circle className="i-p" cx="112" cy="78" r="34" />
    <circle className="is-t" cx="112" cy="78" r="34" strokeWidth="10" fill="none" />
    <path className="is-td" d="M137 103l26 26" strokeWidth="13" strokeLinecap="round" />
    <path className="is-tm" d="M95 72a18 18 0 0 1 16-16" strokeWidth="5" strokeLinecap="round" fill="none" />
    <Spark x={176} y={50} /><Spark x={58} y={60} s={0.7} c="i-tm" />
  </Art>
)

/** No internet / could not load. */
export const OfflineArt = () => (
  <Art>
    <Blob />
    <Ground y={150} w={60} />
    <path className="i-p" d="M78 128a26 26 0 0 1-2-52 36 36 0 0 1 68-8 30 30 0 0 1 22 60z" />
    <path className="is-l" d="M78 128a26 26 0 0 1-2-52 36 36 0 0 1 68-8 30 30 0 0 1 22 60z" strokeWidth="4" fill="none" />
    <path className="is-sd" d="M84 60l72 76" strokeWidth="8" strokeLinecap="round" />
    <rect className="i-tm" x="100" y="102" width="8" height="16" rx="3" />
    <rect className="i-tm" x="114" y="94" width="8" height="24" rx="3" />
    <rect className="i-l" x="128" y="86" width="8" height="32" rx="3" />
  </Art>
)

/** Done / success. */
export const SuccessArt = () => (
  <Art>
    <Blob />
    <Ground y={152} w={50} />
    <circle className="i-t" cx="120" cy="90" r="44" />
    <circle className="i-tm" cx="120" cy="90" r="44" opacity=".25" />
    <path className="is-w" d="M100 91l14 14 28-30" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <rect className="i-s" x="58" y="50" width="10" height="5" rx="2.5" transform="rotate(-30 63 52)" />
    <rect className="i-tm" x="176" y="58" width="10" height="5" rx="2.5" transform="rotate(25 181 60)" />
    <rect className="i-s" x="182" y="118" width="9" height="5" rx="2.5" transform="rotate(-20 186 120)" />
    <circle className="i-s" cx="66" cy="120" r="4" /><circle className="i-tm" cx="168" cy="36" r="3.5" />
    <Spark x={70} y={86} s={0.8} /><Spark x={186} y={92} s={0.7} c="i-tm" />
  </Art>
)

/** Invite friends / community. */
export const CommunityArt = () => (
  <Art>
    <Blob />
    <Ground y={154} w={74} />
    <path className="is-tm" d="M82 70c12-26 64-26 76 0" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" fill="none" />
    <path className="i-s" d="M120 40c-4-6-14-5-14 3 0 7 14 14 14 14s14-7 14-14c0-8-10-9-14-3z" />
    <path className="i-t" d="M50 158c0-28 14-44 32-44s32 16 32 44z" />
    <circle className="i-sk" cx="82" cy="94" r="16" />
    <path className="i-h" d="M66 92c0-11 7-18 16-18s16 7 16 18c-4-5-10-7-16-7s-12 2-16 7z" />
    <path className="i-s" d="M126 158c0-28 14-44 32-44s32 16 32 44z" />
    <circle className="i-sk" cx="158" cy="94" r="16" />
    <path className="i-td" d="M142 90c0-11 7-18 16-18s16 7 16 18z" />
    <path className="i-s" d="M156 86h22a3.5 3.5 0 0 1 0 7h-22z" />
  </Art>
)

/** MPIN / app lock: a phone with a fingerprint. */
export const LockArt = () => (
  <Art>
    <Blob />
    <Ground y={156} w={50} />
    <rect className="i-td" x="86" y="30" width="68" height="124" rx="14" />
    <rect className="i-p" x="92" y="40" width="56" height="104" rx="9" />
    <rect className="i-td" x="110" y="34" width="20" height="3" rx="1.5" opacity=".6" />
    <g className="is-t" fill="none" strokeWidth="3.5" strokeLinecap="round" transform="translate(120 96)">
      <path d="M-14 4a14 14 0 0 1 28 0v4" /><path d="M-7 14V4a7 7 0 0 1 14 0v12" /><path d="M0 2v18" /><path d="M-20 -2a20 20 0 0 1 40 0" />
    </g>
    <circle className="i-s" cx="152" cy="132" r="16" />
    <rect className="i-p" x="145" y="131" width="14" height="10" rx="2" />
    <path className="is-p" d="M148 131v-3a4 4 0 0 1 8 0v3" strokeWidth="2.5" fill="none" />
    <Spark x={62} y={60} s={0.8} c="i-tm" /><Spark x={182} y={64} />
  </Art>
)

/** Hero picture on dark teal (sign-in panel, first page): a truck on the road toward a city at dawn. */
export const HeroRoadArt = () => (
  <svg viewBox="0 0 360 220" className="h-auto w-full" aria-hidden focusable="false">
    <defs>
      <linearGradient id="vz-hero-fade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".14" stopColor="#fff" /><stop offset=".86" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id="vz-hero-mask"><rect width="360" height="220" fill="url(#vz-hero-fade)" /></mask>
    </defs>
    <g mask="url(#vz-hero-mask)">
    <circle cx="276" cy="66" r="34" fill="var(--c-accent)" opacity=".9" />
    <circle cx="276" cy="66" r="54" fill="var(--c-accent)" opacity=".12" />
    <g fill="#ffffff" opacity=".1">
      <rect x="196" y="92" width="18" height="60" rx="3" /><rect x="218" y="74" width="22" height="78" rx="3" /><rect x="244" y="104" width="16" height="48" rx="3" />
      <rect x="300" y="86" width="20" height="66" rx="3" /><rect x="324" y="108" width="16" height="44" rx="3" />
    </g>
    <path d="M0 168c80-14 150-14 210-6s110 8 150 0v58H0z" fill="#ffffff" opacity=".05" />
    <path d="M-10 196c90-26 200-30 380-12" stroke="#ffffff" strokeOpacity=".22" strokeWidth="18" fill="none" strokeLinecap="round" />
    <path d="M10 192c90-24 190-28 340-12" stroke="var(--c-accent)" strokeWidth="2.5" strokeDasharray="12 12" fill="none" strokeLinecap="round" />
    <g transform="translate(62 128)">
      <rect x="0" y="0" width="86" height="44" rx="5" fill="var(--c-accent)" />
      <rect x="0" y="34" width="86" height="5" fill="#000" opacity=".15" />
      <path d="M86 12h24l16 18v18H86z" fill="#ffffff" />
      <path d="M92 18h15l11 12H92z" fill="var(--c-header)" opacity=".85" />
      <circle cx="20" cy="50" r="10" fill="#0b1b1f" /><circle cx="20" cy="50" r="3.5" fill="#ffffff" opacity=".8" />
      <circle cx="64" cy="50" r="10" fill="#0b1b1f" /><circle cx="64" cy="50" r="3.5" fill="#ffffff" opacity=".8" />
      <circle cx="110" cy="50" r="10" fill="#0b1b1f" /><circle cx="110" cy="50" r="3.5" fill="#ffffff" opacity=".8" />
    </g>
    <g transform="translate(170 52)">
      <path d="M0 34S-18 18-18 4a18 18 0 1 1 36 0c0 14-18 30-18 30z" fill="#ffffff" />
      <circle cx="0" cy="4" r="7" fill="var(--c-header)" />
    </g>
    </g>
  </svg>
)
