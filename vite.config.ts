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
  // Accept the Host header that `tailscale serve` forwards (your machine's
  // MagicDNS name, e.g. laptop.tailnet-name.ts.net) so the dev/preview server
  // doesn't reject phone requests with "host not allowed". Scoped to .ts.net —
  // not a blanket allow. `tailscale serve` connects to localhost, so you do NOT
  // need --host; for plain LAN/Tailscale-IP access, add --host on the CLI.
  server: {
    allowedHosts: ['.ts.net'],
  },
  // `host: true` binds 0.0.0.0 (IPv4 + IPv6) so `tailscale serve`, which proxies
  // to 127.0.0.1, can always reach preview — avoids the Windows "localhost = ::1
  // only" mismatch that surfaces as a 502 bad gateway. (Binds to all local
  // interfaces; that's the intent for serving to your phone.)
  preview: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
