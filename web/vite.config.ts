import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_')
  const brandId = env.VITE_BRAND || 'vahanza'

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
        // the manifest comes from the API (/app.webmanifest) so "Add to home screen" follows the
        // published brand theme (Admin → Appearance) without a new build
        manifest: false,
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
    server: { proxy: { '/api': 'http://localhost:8000', '^/(j|r|q)/': 'http://localhost:8000', '/app.webmanifest': 'http://localhost:8000' }, fs: { allow: ['..'] } },
  }
})
