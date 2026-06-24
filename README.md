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
| `npm run lint` / `npm run typecheck` | Quality gates |
| `npm test` | Vitest unit tests (diet logic) |
| `npm run e2e` | Playwright end-to-end tests |

## Installing on your devices

- **Laptop:** open the deployed (or `preview`) URL in Chrome/Edge → install icon in the address bar.
- **Android:** open the URL in Chrome → menu → **Add to Home screen**. (PWA install requires HTTPS,
  which the Netlify/Vercel deploy provides.)

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
