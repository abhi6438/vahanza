import type { CapacitorConfig } from '@capacitor/cli'
import { readFileSync } from 'node:fs'

// Each brand builds its own Android app from the same code: VITE_BRAND=<id> npm run cap:sync
const brandId = process.env.VITE_BRAND || 'vahanza'
const brand = JSON.parse(readFileSync(new URL(`../brands/${brandId}.json`, import.meta.url), 'utf8'))

const config: CapacitorConfig = {
  appId: brand.appId,
  appName: brand.name,
  webDir: 'dist',
  android: { allowMixedContent: false },
}

export default config
