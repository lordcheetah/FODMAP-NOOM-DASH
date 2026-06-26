/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FODMAP / NOOM / DASH Tracker',
        short_name: 'Diet Tracker',
        description:
          'Plan, cook, and track low-FODMAP (fructose/fructans), NOOM, and DASH meals plus exercise.',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // SPA fallback: serve the precached app shell for client-side routes so
        // reloading offline on a deep route (e.g. /meals, /exercise) boots the
        // app instead of 404ing. Reads then hydrate from the persisted TanStack
        // Query cache (IndexedDB).
        navigateFallback: 'index.html',
        // Intentionally NO runtimeCaching for authenticated Supabase REST GETs:
        // those responses are user-private (cache-poisoning/staleness risk) and
        // reads already come from the persisted query cache. Revisit only if a
        // cold first-ever offline load must work.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
