// Writes capacitor.config.json for the brand being built (the Capacitor CLI can't load a .ts/.js
// config in this "type": "module" package). Run by `npm run cap:sync`; VITE_BRAND=<id> picks the brand.
import { readFileSync, writeFileSync } from 'node:fs'

const brandId = process.env.VITE_BRAND || 'vahanza'
const brand = JSON.parse(readFileSync(new URL(`../../brands/${brandId}.json`, import.meta.url), 'utf8'))
const config = { appId: brand.appId, appName: brand.name, webDir: 'dist', android: { allowMixedContent: false } }
writeFileSync(new URL('../capacitor.config.json', import.meta.url), JSON.stringify(config, null, 2) + '\n')
console.log(`capacitor.config.json → ${brand.appId} (${brand.name})`)
