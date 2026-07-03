# FODMAP · NOOM · DASH Tracker

A personal **PWA** (works on Android phone and laptop, installable, offline-capable) to plan,
cook, and track meals/snacks and exercise against three overlapping frameworks plus fiber goals:

- **Low FODMAP** — fructose & fructans only (the owner's triggers).
- **NOOM** — green / yellow / orange, computed from caloric density.
- **DASH** — produce / whole grains / lean protein, sodium budget, potassium.
- **Fiber** — daily and per-meal targets, with low-FODMAP high-fiber suggestions.

> ⚠️ Informational tool, **not medical advice**. FODMAP data comes from public references and may be
> incomplete. Anything marked "not verified" is **not** confirmed safe.

## Stack

React + TypeScript + Vite · Tailwind + shadcn/ui · vite-plugin-pwa · Supabase (Postgres/Auth/RLS) ·
TanStack Query · Vitest + Playwright. See [`CLAUDE.md`](./CLAUDE.md) for full conventions and the
diet rules that drive the app.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (optional for first run)
npm run dev                  # http://localhost:5173
```

The app runs without Supabase (offline/demo shell). For cloud sync across devices, set up Supabase —
see [`supabase/README.md`](./supabase/README.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build + preview (test PWA install here, over HTTPS/LAN) |
| `npm run host` | Build + serve in one step — for self-hosting on an always-on machine (see [DEPLOY.md](DEPLOY.md)) |
| `npm run lint` / `npm run typecheck` | Quality gates |
| `npm test` | Vitest unit tests (diet logic) |
| `npm run e2e` | Playwright end-to-end tests |

## Hosting & porting to another device

See **[DEPLOY.md](DEPLOY.md)** for the two options: deploy once to Netlify (a URL
that works everywhere, nothing to keep running) or self-host on an always-on
laptop over Tailscale. Your data lives in Supabase, so no data is copied — each
device just signs in.

## Installing on your devices

- **Laptop:** open the deployed (or `preview`) URL in Chrome/Edge → install icon in the address bar.
- **Android:** open the URL in Chrome → menu → **Add to Home screen**. (PWA install requires HTTPS,
  which the Netlify/Vercel deploy provides.)

## Barcode scanning — testing the camera

The "Scan" button on the Meals screen opens the camera, decodes a retail barcode
(EAN/UPC) via the [`barcode-detector`](https://www.npmjs.com/package/barcode-detector)
polyfill (native `BarcodeDetector` where available — Chrome/Android, 0 KB — and a
lazily-loaded zxing-wasm fallback elsewhere, code-split out of the entry bundle),
then looks the product up on Open Food Facts.

The camera (`getUserMedia`) only runs in a **secure context: HTTPS or `localhost`**.

- **Laptop:** `npm run dev` → open `http://localhost:5173` and grant camera permission.
- **Android phone:** a plain `http://<lan-ip>:5173` URL is **blocked** by the browser.
  Test phone scanning on the deployed Netlify/Vercel **HTTPS** URL (recommended — also
  exercises the PWA), or run `vite --host` behind an HTTPS tunnel / local TLS cert.

On an insecure or unsupported origin the scanner degrades gracefully to "Scanning
isn't available here — add the food manually" rather than throwing. OFF carries no
fructose/fructans data, so every scanned product is **"Not verified"** until you set
the levels by hand. Offline (or OFF "not found"), the flow falls back to manual entry
with the barcode preserved.

## Development workflow (agents)

Five project agents live in [`.claude/agents/`](./.claude/agents): `planner`, `researcher`, `coder`,
`reviewer`, `tester`. Typical flow: **planner → researcher (if data needed) → coder → reviewer →
tester**.

## Roadmap

- **Phase 0 (done)** — foundation: agents, PWA scaffold, Supabase schema, CI/deploy.
- **Phase 1** — meal planning + tracking (FODMAP/NOOM/DASH/fiber dataset + daily log).
- **Phase 2** — exercise planning + tracking (PDF content, 7-minute workout, 4-week cycle).
- **Phase 3** — barcode scanning, photo→meal recognition, martial arts, full offline.

Plans live in [`.claude/plans/`](./.claude/plans) and `.planning/`.
