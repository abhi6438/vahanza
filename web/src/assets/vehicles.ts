// Vehicle pictures in the Vahanza illustration style (see illustrations.tsx): flat, rounded, brand teal + saffron.
// Colours are CSS variables (--ill-*), so they follow light / dark mode and a white-label brand.
// Static strings rendered inline as SVG markup (VehicleArt in components/form.tsx). Grid: 80 × 50.
const S = 'fill="var(--ill-sun)"'
const SD = 'fill="var(--ill-sun-deep)"'
const T = 'fill="var(--ill-teal)"'
const TD = 'fill="var(--ill-teal-deep)"'
const TM = 'fill="var(--ill-teal-mid)"'
const P = 'fill="var(--ill-paper)"'
const wheel = (cx: number, cy = 41, r = 5.2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--ill-ink)"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.38).toFixed(1)}" fill="var(--ill-line)"/>`
const shadow = (x = 6, w = 68) => `<rect x="${x}" y="45" width="${w}" height="2.6" rx="1.3" fill="var(--ill-shadow)"/>`
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50">${body}</svg>`

export const VEHICLE_SVG: Record<string, string> = {
  truck: svg(
    shadow() +
      `<rect x="5" y="11" width="45" height="26" rx="3.5" ${S}/><rect x="5" y="31" width="45" height="3.5" ${SD}/>` +
      `<path d="M50 17h13.5a3 3 0 0 1 2.3 1.1l7.2 9V37H50z" ${T}/><path d="M53.5 20.5h9l5.5 6.5H53.5z" ${P} opacity=".92"/>` +
      `<rect x="50" y="33" width="23" height="4" ${TD}/>` + wheel(16) + wheel(37) + wheel(64),
  ),
  trailer: svg(
    shadow(2, 76) +
      `<rect x="2" y="12" width="53" height="24" rx="3" ${S}/><rect x="2" y="30" width="53" height="3.5" ${SD}/>` +
      `<rect x="55" y="31" width="4" height="3" ${TD}/>` +
      `<path d="M59 17h10a3 3 0 0 1 2.3 1.1l6.2 8V37H59z" ${T}/><path d="M62 20h7l4.6 6H62z" ${P} opacity=".92"/>` +
      wheel(11, 41, 4.6) + wheel(22, 41, 4.6) + wheel(44, 41, 4.6) + wheel(70, 41, 4.6),
  ),
  pickup: svg(
    shadow() +
      `<path d="M6 27h30v10H6z" ${T}/><rect x="8" y="22" width="24" height="6" rx="1.5" ${S}/>` +
      `<path d="M36 18h17a3 3 0 0 1 2.4 1.2L62 27h8a3 3 0 0 1 3 3v7H36z" ${T}/>` +
      `<path d="M40 21h12.5l5 6H40z" ${P} opacity=".92"/><rect x="6" y="33" width="67" height="4" ${TD}/>` +
      `<rect x="70" y="29" width="3" height="3" rx="1" ${S}/>` + wheel(18) + wheel(60),
  ),
  bus: svg(
    shadow(3, 74) +
      `<rect x="3" y="9" width="72" height="29" rx="6" ${T}/>` +
      `<rect x="8" y="14" width="10" height="9" rx="2" ${P} opacity=".9"/><rect x="21" y="14" width="10" height="9" rx="2" ${P} opacity=".9"/>` +
      `<rect x="34" y="14" width="10" height="9" rx="2" ${P} opacity=".9"/><rect x="47" y="14" width="10" height="9" rx="2" ${P} opacity=".9"/>` +
      `<rect x="61" y="14" width="10" height="16" rx="2" ${P} opacity=".9"/>` +
      `<rect x="3" y="27" width="56" height="3.5" ${S}/><rect x="3" y="33" width="72" height="5" rx="2" ${TD}/>` +
      wheel(17) + wheel(60),
  ),
  car: svg(
    shadow(8, 64) +
      `<path d="M8 30c0-3 2-5 5-5.5l8-1.5 7-7c1.6-1.6 3.6-2.5 6-2.5h12c2.3 0 4.4 1 6 2.6L58 23l9 1.8c3 .6 5 2.8 5 5.6V37H8z" ${T}/>` +
      `<path d="M27 23l5.5-5.5c1-1 2.2-1.5 3.6-1.5H42v7z" ${P} opacity=".92"/><path d="M45 16h1.8c1.4 0 2.6.6 3.6 1.6L55.5 23H45z" ${P} opacity=".92"/>` +
      `<rect x="8" y="32" width="64" height="5" rx="2" ${TD}/><rect x="66" y="27" width="5" height="3" rx="1.5" ${S}/>` +
      wheel(21, 40) + wheel(59, 40),
  ),
  auto: svg(
    shadow(10, 60) +
      `<path d="M16 16c0-4 3-7 7-7h22c7 0 13 5 15 12l3 9H16z" ${T}/>` +
      `<path d="M16 26h47l3 5v6H16z" ${S}/><path d="M22 14h12v12H22z" ${P} opacity=".9"/><path d="M38 14h7c4 0 8 3 10 8l1 4H38z" ${P} opacity=".9"/>` +
      `<rect x="16" y="33" width="50" height="4" ${SD}/>` + wheel(25) + wheel(58),
  ),
  tractor: svg(
    shadow(6, 68) +
      `<rect x="40" y="6" width="3" height="10" rx="1.5" ${TD}/>` +
      `<path d="M30 14h16l4 12h18a3 3 0 0 1 3 3v6H30z" ${T}/><path d="M33 17h10l3 9H33z" ${P} opacity=".9"/>` +
      `<rect x="30" y="31" width="41" height="4" ${TD}/>` +
      `<circle cx="22" cy="34" r="12" fill="var(--ill-ink)"/><circle cx="22" cy="34" r="4.5" ${S}/>` + wheel(63, 40, 6),
  ),
  jcb: svg(
    shadow(4, 72) +
      `<path d="M50 20l16-10 4 4-12 12z" ${SD}/><path d="M66 10l8 8-2 9-9-3z" fill="var(--ill-ink)"/>` +
      `<path d="M18 12h14a3 3 0 0 1 3 3v12H18z" ${S}/><path d="M21 15h11v8H21z" ${P} opacity=".9"/>` +
      `<path d="M8 25h50l2 6v6H8z" ${S}/><rect x="8" y="33" width="52" height="4" ${SD}/>` +
      `<path d="M2 28h7v8H4z" ${TM}/>` + wheel(18, 40, 6) + wheel(48, 40, 6),
  ),
}
