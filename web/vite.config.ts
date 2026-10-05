import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_')
  const brandId = env.VITE_BRAND || 'vahanza'
  const brand = JSON.parse(readFileSync(new URL(`../brands/${brandId}.json`, import.meta.url), 'utf8'))

  return {
    envDir: '..',
    resolve: {
      alias: {
        '@brands': fileURLToPath(new URL('../brands', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The APK ships its files inside the app, so it needs no offline cache. A cache there would keep
        // showing the OLD screens after an app update; in the APK build the worker removes itself instead.
        selfDestroying: mode === 'apk',
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: brand.name,
          short_name: brand.name,
          description: brand.taglineEn,
          lang: 'hi',
          start_url: '/',
          display: 'standalone',
          theme_color: brand.colors.light.header,
          background_color: brand.colors.light.bg,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          importScripts: ['push-sw.js'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: 'CacheFirst', options: { cacheName: 'fonts' } },
          ],
        },
      }),
    ],
    define: { __BRAND_ID__: JSON.stringify(brandId), __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || process.env.npm_package_version || '1.0.0') },
    // brands/ and shared/ live one level up, next to api/
    server: { proxy: { '/api': 'http://localhost:8000', '^/(j|r|q)/': 'http://localhost:8000' }, fs: { allow: ['..'] } },
  }
})
