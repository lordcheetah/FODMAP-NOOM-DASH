# CLAUDE.md — FODMAP-NOOM-DASH Health App

Personal health app (single user) to **plan, cook, and track meals/snacks and exercise** against
three overlapping diet frameworks plus fiber goals, usable on **Android and laptop**.

> **Medical disclaimer:** This app is an informational tool, not medical advice. Diet/FODMAP data is
> sourced from public references and may be incomplete. Never present an `unknown` value as safe.

## The diet rules (read carefully — these drive the whole app)

- **Low FODMAP = fructose and fructans ONLY.** The owner's triggers are fructose and fructans, not
  the full FODMAP set (no lactose/polyol/GOS tracking unless explicitly added later). A food is
  `low_fodmap_safe` only when **both** `fructose_level` and `fructans_level` are `low`. Anything
  `unknown` is shown as **"not verified," never "safe."**
- **NOOM color = caloric density (computed, not hand-labeled):**
  - 🟢 green: ≤ ~1.0 cal/g
  - 🟡 yellow: ~1.0–2.4 cal/g
  - 🟠 orange: > 2.4 cal/g
  - Implemented as `noomColor(calories, grams)`; thresholds live in one place.
- **DASH:** emphasize produce, whole grains, lean protein; track daily food-group servings, a
  **sodium budget**, saturated fat, and potassium.
- **Fiber:** first-class tracked nutrient with **daily and per-meal targets**. Because many
  high-fiber foods (wheat, onion, garlic, legumes) are high in **fructans**, the app must suggest
  **low-FODMAP high-fiber** foods (oats, chia, kiwi, raspberries, firm tofu, quinoa) to close a
  fiber gap without breaking fructose/fructans limits.

## Tech stack

- **PWA**: React + TypeScript + Vite, Tailwind CSS + shadcn/ui, vite-plugin-pwa (offline + install).
- **Backend**: Supabase (Postgres + Auth + Row-Level Security). Single user; all rows scoped by RLS.
- **Data/cache**: TanStack Query; Dexie (IndexedDB) for offline read cache + write outbox (Phase 3).
- **External data**: Open Food Facts (barcode/product), USDA FoodData Central (nutrition) — both free.
- **Later**: barcode scan (@zxing/browser), photo→meal (Claude vision via Supabase Edge Function).
- **Testing**: Vitest (unit), Playwright (e2e). **Hosting**: Netlify/Vercel free tier (HTTPS).

## Architecture conventions

- Pure, testable diet logic lives in **`src/lib/diet/`**: `noomColor`, `lowFodmapSafe`,
  `dashProgress`, `fiberProgress`. Components stay thin and call these. Reuse them — don't duplicate.
- Data model (Supabase): `foods`, `recipes`, `recipe_ingredients`, `food_log`, `swaps`,
  `daily_targets` (calorie/sodium budgets, DASH serving goals, daily + per-meal fiber goals);
  exercise tables (`exercises`, `workouts`, `workout_exercises`, `schedules`, `workout_log`) arrive
  in the exercise phase.
- Recipe diet flags **roll up** from ingredients: worst-case fructose/fructans, summed sodium/fiber,
  averaged caloric density.
- Never commit secrets. Keys come from env vars; keep `.env.example` current.

## Commands

- `npm run dev` — local dev server.
- `npm run build` / `npm run preview` — production build + preview (test PWA install here).
- `npm run lint` / `npm run typecheck` — quality gates.
- `npm test` — Vitest unit tests. `npm run e2e` — Playwright.
- Supabase: migrations in `supabase/migrations/`; apply with the Supabase CLI.

## Seed content (in repo)

Four PDFs are the source material: NOOM meal plan (categories, 8 recipes, 7 sample days, swaps),
NOOM workout plan (60+ exercises, 4-week cycle), Mayo "basic stretches" (9), and Mayo "back
exercises in 15 minutes" (7-exercise routine). Plus the WebMD 7-minute workout.

## Development agents (`.claude/agents/`)

| Agent | Use it to… |
|---|---|
| `planner` | Decompose a feature into ordered, verifiable tasks before coding. |
| `researcher` | Source cited FODMAP/NOOM/DASH/nutrition data and evaluate libraries. |
| `coder` | Implement a feature per an approved plan, with tests. |
| `reviewer` | Review the diff for bugs, security, and health-data-safety violations (read-only). |
| `tester` | Write/run Vitest + Playwright tests and report real results. |

Typical flow: **planner → (researcher if data needed) → coder → reviewer → tester**.

## Roadmap (see `.claude/plans/` and `.planning/`)

- **Phase 0** — foundation: agents, scaffold, Supabase, CI/deploy.
- **Phase 1 (v1)** — meal planning + tracking (FODMAP/NOOM/DASH/fiber + daily log).
- **Phase 2** — exercise planning + tracking (PDF content, 7-min workout, 4-week cycle, timers).
- **Phase 3** — barcode, photo→meal, martial arts, full offline.
