# Phase 1 — Meal Planning + Tracking (implementation plan)

> Planner output. The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> Scope reminder (CLAUDE.md): **"FODMAP" = fructose + fructans only**. NOOM color is **computed
> from caloric density**, never hand-labeled. `unknown` FODMAP **must never display as "safe."**
> Keep the medical disclaimer visible on any meal screen.

## What's already built (ground truth)

- **DB** (`supabase/migrations/0001_init.sql`): `foods`, `recipes`, `recipe_ingredients`
  (`food_id` nullable + `raw_text` fallback), `swaps`, `food_log` (`logged_on`, `meal`,
  `food_id|recipe_id`, `servings`), `daily_targets` (PK = `user_id`; `calorie_budget`,
  `sodium_budget_mg` default 2300, `fiber_goal_g` default 28, `fiber_per_meal_g` default 8,
  `dash_serving_goals` jsonb). RLS: reference tables readable by any authed user
  (seed rows have `user_id IS NULL`); `food_log`/`daily_targets` owner-only.
- **Diet lib** (`src/lib/diet/`): `noomColor(calories, grams) → NoomColor|null`,
  `lowFodmapSafe(fructose, fructans) → 'safe'|'caution'|'avoid'|'not-verified'`,
  `isLowFodmapSafe`, plus types `FodmapLevel`, `NoomColor`, `NoomCategory`, `DashGroup`.
  Barrel: `src/lib/diet/index.ts`. Vitest is wired (`*.test.ts` colocated; `npm test`).
- **Supabase + auth**: `src/lib/supabase.ts` (`supabase` singleton, may be `null`;
  `isSupabaseConfigured`), `src/lib/auth.tsx` (`useAuth()` → `{ user, session, ... }`).
  App gates on sign-in when configured (`src/App.tsx`).
- **Shell**: react-router routes `/`, `/meals` (Placeholder), `/exercise`; TanStack Query
  provider in `src/main.tsx` (default `QueryClient`, no global options); shadcn `Button`,
  `cn()` util, NOOM colors in Tailwind (`bg-noom-green|yellow|orange`).
- **Tests infra**: Vitest (jsdom) via `vite.config.ts`; Playwright (`e2e/`, baseURL `:4173`,
  chromium + Pixel 5, builds+previews prod bundle).

**Gaps Phase 1 fills:** no `data/` dir yet, no seed pipeline, no DB query hooks, no generated
DB types, no Meals UI, `dashProgress`/`fiberProgress` not written.

**Dependency on researchers:** tasks 0→1 consume `data/foods.json`, `data/recipes.json`,
`data/swaps.json`, `data/sample_days.json`. Pure-function + UI scaffolding (tasks 2–10) do
**not** block on the data; only the seed run (task 1) and manual verification (task 11) do.

---

## Task 0 — Define the data-file contracts (codegen-free shared types)

**Goal:** lock the exact JSON shapes the researchers emit so the seed script and the app agree.
**Files:** create `data/README.md` (schema doc) and `src/lib/data/seedTypes.ts` (TS interfaces
mirroring the JSON; importable by the seed script and app).
**Shapes (must match the `foods`/`recipes` tables):**
- `foods.json`: `FoodSeed[]` — `{ name, brand?, serving_desc, serving_grams?, calories?,
  sodium_mg?, sat_fat_g?, potassium_mg?, fiber_g?, added_sugar_g?, fructose_level,
  fructans_level, noom_category?, dash_group?, source? }`. `fructose_level`/`fructans_level`
  are `FodmapLevel` and **default to `'unknown'`** if omitted (never invent `low`).
  **Stable key for idempotency:** `(lower(name), coalesce(lower(brand),''))`.
- `recipes.json`: `RecipeSeed[]` — `{ name, prep_min?, servings?, cal_per_serving?, meal_type?,
  instructions: string[], source?, ingredients: IngredientSeed[] }` where
  `IngredientSeed = { food_name?, raw_text?, quantity?, unit? }`. `food_name` is matched to a
  seeded food by the stable key; unmatched → store `raw_text`, `food_id = null`.
  **Stable key for recipe:** `lower(name)`.
- `swaps.json`: `SwapSeed[]` — `{ from_food, to_food, calories_saved?, note? }`.
  **Stable key:** `(lower(from_food), lower(to_food))`.
- `sample_days.json`: `SampleDay[]` — `{ day_label, meals: { meal_type, recipe_name?,
  food_name?, servings? }[] }`. **v1 use:** seed these as **recipes/foods references only** for a
  future "load a sample day" feature; do NOT write them to `food_log` (that's per-user). Document
  as not-yet-wired so a partial dataset doesn't block the build.
**Reuse:** `FodmapLevel`, `NoomCategory`, `DashGroup`, `MealType` from `src/lib/diet/types.ts`
(add `MealType = 'breakfast'|'lunch'|'dinner'|'snack'` there — currently missing).
**Acceptance:** `src/lib/data/seedTypes.ts` typechecks; `data/README.md` documents each field,
its DB column, the default-to-unknown rule, and the stable keys.

---

## Task 1 — Idempotent seed script (Node + service-role key)

**Decision: a Node/TS script run locally, NOT generated SQL.** Reasons: researcher JSON is the
source of truth; the script does food-name→food_id matching and upsert-by-natural-key in code,
which is far cleaner than templating SQL; it re-runs safely after data edits. Generated SQL would
have to be regenerated and re-reasoned about on every data change.

**Goal:** load `data/*.json` into `foods`, `recipes`, `recipe_ingredients`, `swaps` as **global
seed rows with `user_id = NULL`**, idempotently (safe to re-run).
**Files:** create `scripts/seed.ts`; add npm script `"seed": "tsx scripts/seed.ts"`; add `tsx`
to devDependencies (only new dep); update `.env.example` with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (server-only, **never** `VITE_`-prefixed so Vite never bundles them);
ensure `.env`/`.env.local` are git-ignored (verify `.gitignore`).
**How it works:**
1. Read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (loaded from a local,
   git-ignored `.env`). Create a service-role client (`createClient(url, serviceKey,
   { auth: { persistSession: false } })`) — service role **bypasses RLS**, required to write
   `user_id = NULL` rows.
2. **foods:** upsert by stable key. Since the table has no DB unique constraint on
   `(name, brand)`, do **lookup-then-insert/update**: `select id from foods where user_id is null
   and lower(name)=… and coalesce(lower(brand),'')=…`; insert if absent, else update. Build an
   in-memory `Map<stableKey, id>`. (Alternative: add a `0002_seed_constraints.sql` migration with
   a partial unique index `where user_id is null` and use `upsert onConflict` — note this as an
   optional hardening, see Risks.)
3. **recipes:** upsert by `lower(name)` (same lookup-then-write). Capture `recipe_id`s.
4. **recipe_ingredients:** for each recipe, **delete existing ingredients for that recipe_id, then
   re-insert** (children are cheap; makes re-runs deterministic). Resolve `food_name` via the foods
   Map → `food_id`; on miss, log a warning and store `raw_text` with `food_id = null`.
5. **swaps:** upsert by `(lower(from_food), lower(to_food))`.
6. Print a summary: counts inserted/updated, and a list of **unmatched ingredient names** (the key
   data-quality signal back to the researchers).
**How the owner runs it:** put real values in a local `.env` (copy `.env.example`,
`SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard → Project Settings → API → `service_role`
secret), then `npm run seed`. The key is never committed and never shipped to the client.
**Reuse:** `src/lib/data/seedTypes.ts`; `@supabase/supabase-js` (already a dep).
**Acceptance:** running `npm run seed` twice yields identical row counts the second time (0 new
inserts, no duplicates); spot-check in Supabase that a known high-fructan food (onion/garlic) has
`fructans_level = 'high'` and a safe food (spinach) has both axes `low`; unmatched-ingredient
warnings are printed.

---

## Task 2 — `dashProgress()` pure function + tests

**Goal:** given a day's resolved log entries + targets, compute DASH servings per food group,
sodium total vs budget, and saturated-fat / potassium totals.
**Files:** `src/lib/diet/dashProgress.ts`, `src/lib/diet/dashProgress.test.ts`; export from
`src/lib/diet/index.ts`.
**Signatures (reuse `DashGroup` from types):**
```ts
export interface LoggedNutrients {
  dash_group?: DashGroup | null
  sodium_mg?: number | null
  sat_fat_g?: number | null
  potassium_mg?: number | null
  fiber_g?: number | null
  calories?: number | null
  meal: MealType            // breakfast|lunch|dinner|snack
  servings: number          // multiplier already excluded from per-serving fields below
}
// Per-serving nutrient fields are multiplied by `servings` inside the functions, so the
// data layer passes per-serving values + the servings count (single source of truth).

export interface DashTargets {
  sodium_budget_mg?: number | null
  dash_serving_goals?: Partial<Record<DashGroup, number>>
}

export interface DashProgress {
  servingsByGroup: Record<DashGroup, number>      // all 8 groups, default 0
  goalsByGroup: Partial<Record<DashGroup, number>>
  sodiumMg: number
  sodiumBudgetMg: number | null
  sodiumOverBudget: boolean
  satFatG: number
  potassiumMg: number
}
export function dashProgress(entries: LoggedNutrients[], targets: DashTargets): DashProgress
```
**Logic:** one serving of a logged item = one DASH serving for its `dash_group` (×`servings`);
sum sodium/satfat/potassium as `value × servings`; `sodiumOverBudget = budget != null &&
sodiumMg > budget`. Null/undefined nutrients treated as 0; entries with no `dash_group` contribute
to sodium/etc. but not to any serving bucket.
**Acceptance:** unit tests: empty log → all zeros, `sodiumOverBudget=false`; a log with
2 veg servings + 1 fruit + 800mg sodium against a 2300 budget produces the right buckets and
`sodiumOverBudget=false`; crossing the budget flips the flag; missing nutrients don't throw.

---

## Task 3 — `fiberProgress()` pure function + tests (incl. low-FODMAP fiber gap)

**Goal:** daily fiber vs goal, per-meal fiber vs per-meal target, and a **fiber gap** with
suggested **low-FODMAP high-fiber** foods to close it.
**Files:** `src/lib/diet/fiberProgress.ts`, `src/lib/diet/fiberProgress.test.ts`; export from
index. Add a small curated constant `LOW_FODMAP_HIGH_FIBER` (oats, chia, kiwi, raspberries, firm
tofu, quinoa — from CLAUDE.md) in this file or `src/lib/diet/fiberSuggestions.ts`.
**Signatures (reuse `MealType`, `LoggedNutrients`):**
```ts
export interface FiberTargets {
  fiber_goal_g?: number | null        // daily
  fiber_per_meal_g?: number | null    // per meal
}
export interface FiberSuggestion { name: string; fiber_g: number; note?: string }
export interface MealFiber {
  meal: MealType
  fiberG: number
  targetG: number | null
  gapG: number              // max(0, target - consumed); 0 if no target
  meetsTarget: boolean
}
export interface FiberProgress {
  totalFiberG: number
  goalG: number | null
  dailyGapG: number         // max(0, goal - total)
  meetsGoal: boolean
  byMeal: MealFiber[]       // always all 4 meals in fixed order
  suggestions: FiberSuggestion[]  // [] when no daily gap; else low-FODMAP high-fiber picks
}
export function fiberProgress(entries: LoggedNutrients[], targets: FiberTargets): FiberProgress
```
**Logic:** `totalFiberG = Σ(fiber_g × servings)`; per-meal sums the same; gaps are
`max(0, target − consumed)`; suggestions returned only when `dailyGapG > 0`, drawn from the
curated low-FODMAP list (all items are fructose+fructans `low` by construction — this is the
fructose/fructans-safe nudge the spec requires). Suggestions are static guidance, not a claim
about the user's other foods.
**Acceptance:** tests: no entries + goal 28 → `dailyGapG=28`, `meetsGoal=false`, suggestions
non-empty and every suggestion is from the low-FODMAP list; hitting the goal → `dailyGapG=0`,
`suggestions=[]`; per-meal target 8 with a 5g breakfast → that meal `gapG=3`,`meetsTarget=false`;
all 4 meals always present in `byMeal`.

---

## Task 4 — Generated Supabase row types

**Goal:** typed DB rows for the data layer without hand-drift.
**Files:** `src/lib/db/types.ts`. **Decision:** hand-author a minimal `Tables` interface set
(`FoodRow`, `RecipeRow`, `RecipeIngredientRow`, `FoodLogRow`, `DailyTargetsRow`, `SwapRow`)
matching `0001_init.sql` rather than wiring `supabase gen types` into the build (keeps the toolchain
light; the schema is small and stable). Reuse the enum types from `src/lib/diet/types.ts`
(`FodmapLevel`, `NoomCategory`, `DashGroup`, `MealType`).
**Acceptance:** types compile and are imported by the hooks in Task 5; field names/optionality
match the migration (e.g. `food_log.logged_on: string`, `servings: number`,
`food_id: string | null`).

---

## Task 5 — Data layer: typed TanStack Query hooks

**Goal:** all DB access for meals behind typed hooks that respect RLS + the current user.
**Files:** `src/lib/db/foods.ts` (search), `src/lib/db/recipes.ts`, `src/lib/db/foodLog.ts`,
`src/lib/db/dailyTargets.ts`. Optionally `src/lib/db/queryKeys.ts` for a key factory.
**Hooks & contracts:**
- `useFoodSearch(term: string)` → `useQuery`, `enabled: term.length >= 2`. Query:
  `foods.select(...).or(name ilike, brand ilike).limit(30)`. RLS already returns seed
  (`user_id null`) + the user's own rows. Returns `FoodRow[]`.
- `useRecipeSearch(term)` and `useRecipe(id)` → recipe + its `recipe_ingredients` joined to
  `foods` (for roll-up flags). Returns `{ recipe, ingredients: (RecipeIngredientRow & { food:
  FoodRow|null })[] }`.
- `useFoodLog(date: string)` → `useQuery(['foodLog', userId, date])`; selects `food_log` for
  `logged_on = date` with embedded `food:foods(*)` and `recipe:recipes(*)` so the UI/diet
  functions get nutrients in one round-trip. `enabled: !!userId`.
- `useAddLogEntry()` / `useUpdateLogEntry()` / `useDeleteLogEntry()` → `useMutation`; on success
  `invalidateQueries(['foodLog', userId, date])`. Insert sets `user_id` from `useAuth().user.id`,
  `logged_on`, `meal`, `food_id|recipe_id`, `servings`. (DB CHECK enforces one of food/recipe.)
- `useDailyTargets()` → `useQuery(['dailyTargets', userId])` selecting the single row (PK
  `user_id`); returns row or `null`. `useUpsertDailyTargets()` → `upsert onConflict:'user_id'`,
  invalidates on success.
**Reuse:** `supabase` + `isSupabaseConfigured` (`src/lib/supabase.ts`), `useAuth()`
(`src/lib/auth.tsx`), `QueryClient` already provided in `main.tsx`, `src/lib/db/types.ts`.
Guard every hook for `supabase === null` (return disabled query / no-op mutation) so the
offline/demo shell still renders.
**Mapping helper:** add `toLoggedNutrients(logRow): LoggedNutrients` (in `src/lib/db/foodLog.ts`)
that resolves food vs recipe (recipe uses `cal_per_serving`; recipe DASH/fiber roll-up is a known
gap — see Risks) so pages feed `dashProgress`/`fiberProgress` directly.
**Acceptance:** typecheck passes; a temporary smoke call (or the e2e in Task 11) shows
`useFoodLog` returns rows scoped to the signed-in user and a mutation round-trips +
auto-refreshes the list.

---

## Task 6 — Meals page scaffold + routing + shared item display bits

**Goal:** replace the `/meals` Placeholder with a real page and date selector; build the reusable
"food row" presentation (NOOM dot + safety badge + key nutrients) used by search and the log view.
**Files:** `src/pages/Meals.tsx`; wire in `src/App.tsx` (`<Route path="/meals" element={<Meals/>}/>`);
`src/components/diet/NoomDot.tsx`, `src/components/diet/FodmapBadge.tsx`,
`src/components/diet/FoodItemRow.tsx`, `src/components/diet/Disclaimer.tsx`.
**Behavior:** Meals page holds the selected `date` (default today, `YYYY-MM-DD`), a meal-type
context for "add", and renders Search + DailyLog + Summary sections (Tasks 7–9). A date stepper
(prev/today/next). `Disclaimer` shows the medical-disclaimer text (lift the copy already in
`Dashboard.tsx`) and the "unknown = not verified, never safe" rule — kept visible on the page.
**Reuse:** `noomColor`, `lowFodmapSafe` from `@/lib/diet`; `bg-noom-*` Tailwind colors; `cn()`;
`COLOR_DOT`/`SAFETY_LABEL` patterns from `Dashboard.tsx` (promote into the new components, then
the Dashboard demo can import them too — DRY).
**`FodmapBadge` rule:** maps `lowFodmapSafe` → label/color: safe=green "Safe (fructose/fructans)",
caution=yellow, avoid=red "Avoid", **not-verified=neutral "Not verified"** (never green). Show
fructose/fructans axes on tap/title for transparency.
**Acceptance:** `/meals` renders without the Placeholder; NoomDot/Badge render correctly for the
spinach (green/safe), onion (high-fructan → Avoid), unknown (Not verified) cases; disclaimer
visible. Existing e2e (`e2e/app.spec.ts`) still passes.

---

## Task 7 — Food/recipe search UI

**Goal:** searching shows per-item NOOM color, fructose/fructans safety badge, and key nutrients
(calories, fiber, sodium), plus add-to-log.
**Files:** `src/components/meals/FoodSearch.tsx` (used by `Meals.tsx`).
**Behavior:** debounced text input (≥2 chars) → `useFoodSearch` (+ `useRecipeSearch`); each result
is a `FoodItemRow` with `NoomDot` (computed via `noomColor(calories, serving_grams)`), `FodmapBadge`
(from `fructose_level`/`fructans_level`), and nutrient chips. Each row has an "Add" affordance →
Task 8.
**Reuse:** Task 5 hooks, Task 6 components, `Button`. For recipes, NOOM color from
`cal_per_serving` needs grams — if recipe grams unknown, render the dot as unknown (mirror
`noomColor` returning null), don't guess.
**Acceptance:** typing "spin" surfaces spinach with a green dot + Safe; typing a high-fructan food
shows Avoid; nutrients display; empty/short queries show nothing or a hint, no error.

---

## Task 8 — Add-to-log (meal + servings)

**Goal:** add a searched food/recipe to the log under breakfast/lunch/dinner/snack with a servings
amount.
**Files:** `src/components/meals/AddToLogDialog.tsx` (or inline popover); used from `FoodSearch`.
**Behavior:** pick meal type (default = the page's current meal context), enter servings (numeric,
default 1, min 0.25 step 0.25), confirm → `useAddLogEntry` with the selected `date`. Optimistic or
spinner; on success the dialog closes and the daily log + summary refresh (query invalidation).
**Reuse:** `useAddLogEntry`, `useAuth` (for `user_id`), `Button`, meal-type enum (`MealType`).
**Acceptance:** adding spinach to lunch with 2 servings inserts one `food_log` row
(`logged_on=date`, `meal='lunch'`, `servings=2`) and it appears under Lunch immediately; reload
keeps it (RLS-scoped to the user).

---

## Task 9 — Daily log view + running summaries

**Goal:** the day's log grouped by meal with running totals: calories vs budget, NOOM color mix,
DASH servings, sodium budget, and fiber (daily + per-meal with the gap nudge).
**Files:** `src/components/meals/DailyLog.tsx` (entries grouped by meal, each `FoodItemRow` with
servings + remove), `src/components/meals/DaySummary.tsx` (the totals panel).
**Behavior:**
- Build `LoggedNutrients[]` from `useFoodLog(date)` via `toLoggedNutrients` (Task 5).
- **Calories:** Σ(calories×servings) vs `daily_targets.calorie_budget` (progress bar + over/under).
- **NOOM mix:** count items per color (green/yellow/orange) via `noomColor`; render as a
  small stacked bar / counts using `bg-noom-*`. Items with null color shown as "uncolored".
- **DASH:** `dashProgress(entries, targets)` → servings per group vs goals + sodium vs budget
  (highlight when `sodiumOverBudget`).
- **Fiber:** `fiberProgress(entries, targets)` → daily total vs goal with `dailyGapG`; per-meal
  bars vs `fiber_per_meal_g`; when `dailyGapG>0` show the **suggestions** ("add e.g. oats, chia,
  kiwi…") clearly labeled as low-FODMAP high-fiber.
- Remove control per entry → `useDeleteLogEntry`; servings edit → `useUpdateLogEntry` (optional in
  v1; at minimum remove + re-add).
- Disclaimer + "unknown = not verified" rule visible (Task 6 component).
**Reuse:** `dashProgress`, `fiberProgress`, `noomColor` from `@/lib/diet`; Task 5 hooks; Task 6
components.
**Acceptance:** logging a known sample day yields totals matching a hand calculation (calories,
fiber daily+per-meal, sodium, DASH servings, NOOM counts); a low-fiber day shows a non-zero gap +
low-FODMAP suggestions; a day over the sodium budget flags it; removing an entry updates all totals.

---

## Task 10 — Targets UI (daily_targets)

**Goal:** let the user set calorie / sodium / fiber goals (daily + per-meal) and DASH serving goals.
**Files:** `src/components/meals/TargetsForm.tsx` + a route or modal from `Meals.tsx`
(e.g. a "Targets" button opening a sheet). Optionally `src/pages/Targets.tsx` if a full route is
preferred.
**Behavior:** load via `useDailyTargets` (prefill with DB defaults — 2300 sodium, 28 fiber, 8/meal
— if no row yet); numeric inputs for `calorie_budget`, `sodium_budget_mg`, `fiber_goal_g`,
`fiber_per_meal_g`, and per-group `dash_serving_goals` (jsonb). Save → `useUpsertDailyTargets`
(`onConflict: 'user_id'`), invalidate; summaries (Task 9) immediately reflect new targets.
**Reuse:** `useDailyTargets`/`useUpsertDailyTargets` (Task 5), `Button`, `DashGroup` for the group
list.
**Acceptance:** first save creates the `daily_targets` row for the user; changing the fiber goal to
35 updates the fiber gap in `DaySummary` on next render; reload persists; values are RLS-scoped.

---

## Task 11 — Tests: unit + e2e

**Goal:** lock the diet math and the core logging loop.
**Files:** unit tests live with their functions (Tasks 2–3 already include
`dashProgress.test.ts`, `fiberProgress.test.ts` — this task ensures coverage of edge cases:
nulls, missing targets, all-4-meals invariant, suggestions only-on-gap, sodium-flag boundary).
E2E: `e2e/meals.spec.ts`.
**E2E flow:** login → go to Meals → search + add a meal → see correct summaries (calories/fiber/
NOOM/sodium/DASH) → reload → entry + summaries persist. Also assert the disclaimer is present and a
known-unknown food still reads "Not verified," never "Safe."
**E2E Supabase session strategy (decision):** the current Playwright config builds the **prod**
bundle, so the app will gate on real Supabase auth. Options, in order of preference:
1. **Dedicated test user + global setup:** add a Playwright `globalSetup` (or a `storageState`
   project) that signs in once via `supabase.auth.signInWithPassword` using
   `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` from env, captures the session, and writes it to
   localStorage `storageState` reused by tests. Requires a throwaway Supabase user + seeded data
   (Task 1) in a **test/staging** project — never the owner's real account. Add these env vars to
   `.env.example` (test-only, git-ignored values) and CI secrets.
2. **Per-test programmatic login** via `page.evaluate` calling the same sign-in, if global state is
   flaky.
Document that e2e needs a configured Supabase test project; without it, skip the meals e2e (the
shell e2e in `app.spec.ts` stays green because it doesn't require auth when env is unset). Tag the
meals spec so CI can gate it on the presence of test creds.
**Acceptance:** `npm test` green incl. new diet tests; `npm run e2e` (with test creds) green for
the login→log→summary→reload flow; without creds the meals spec is skipped, not failing.

---

## Suggested execution order & parallelism

1. Task 0 (contracts) — unblocks everything.
2. Tasks 2, 3, 4 in parallel (pure functions + types; no data/UI deps).
3. Task 5 (hooks) after Task 4.
4. Task 1 (seed) once researcher JSON lands (parallel to 2–5).
5. Tasks 6 → 7 → 8 → 9 → 10 (UI, sequential-ish; 9 depends on 2/3/5, 10 depends on 5).
6. Task 11 last (unit tests can land with their functions; e2e after UI + seed).

---

## Risks & things for the human to confirm

- **Recipe ingredient → food matching (data quality).** Idempotent matching is by `food_name` ⇄
  `foods.name`. Researchers must use names that match `foods.json` exactly (case-insensitive), or
  ingredients fall back to `raw_text` with no nutrients/flags. The seed script prints unmatched
  names; expect a feedback loop. **Confirm:** is exact-name matching acceptable, or do we want an
  alias/synonym map?
- **Recipe diet roll-up not implemented in v1.** `food_log` can reference a recipe, but
  `dashProgress`/`fiberProgress` consume per-item nutrients. CLAUDE.md specifies recipe flags
  *roll up* from ingredients (worst-case fructose/fructans, summed sodium/fiber, avg density).
  **Decision needed:** for Phase 1, do we (a) log only individual foods (simplest, recommended for
  v1) and defer recipe roll-up, (b) compute roll-up client-side from `recipe_ingredients` on the
  fly, or (c) precompute and store roll-ups during seeding? Recommend (a) for the log math + show
  recipe-level info read-only in search, with roll-up as a fast follow.
- **E2E auth.** Needs a throwaway Supabase test user + seeded test project and `E2E_TEST_*` env.
  **Confirm** a staging/test Supabase project exists (don't run e2e writes against the real
  account/data).
- **Seeding auth/keys.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is highly sensitive — it
  lives only in a local git-ignored `.env`, is never `VITE_`-prefixed, and is never deployed. The
  seed script must error clearly if the key is missing. **Confirm** the owner is comfortable running
  the seed locally with the service-role key.
- **No DB unique constraints for upsert.** Idempotency relies on lookup-then-write by natural keys.
  Optional hardening: a `0002_seed_constraints.sql` migration adding partial unique indexes
  (`where user_id is null`) so the script can use native `upsert`. **Confirm** whether to add it.
- **`tsx` dev dependency** is the only new package proposed (to run the TS seed script). Acceptable?
- **`MealType` is not yet in `src/lib/diet/types.ts`** (only in the DB enum). Task 0 adds it so the
  pure functions and hooks share one definition.
```
