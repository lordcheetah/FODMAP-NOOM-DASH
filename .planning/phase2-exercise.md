# Phase 2 — Exercise Planning + Tracking (implementation plan)

> Planner output. The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> This plan mirrors the Phase 1 conventions (see `.planning/phase1-meals.md`): hand-authored DB row
> types, idempotent lookup-then-write seeding with the service-role key, typed null-guarded
> user-scoped TanStack Query hooks, pure tested logic in `src/lib/`, thin mobile-first components.
> Exercise has NO diet rules to honor, but it shares the data-safety posture: `cautions`/
> `modifications` from the source must be shown verbatim, never silently dropped.

## What's already built (ground truth)

- **DB** (`supabase/migrations/0001_init.sql`, `0002_seed_constraints.sql`): meal-side tables only.
  RLS pattern: **reference tables** (`foods`, `recipes`, `recipe_ingredients`, `swaps`) are
  `select ... to authenticated using (true)`, hold global seed rows with `user_id IS NULL`, and are
  writable only for `user_id = auth.uid()`. **Personal tables** (`food_log`, `daily_targets`) are
  `for all to authenticated using (user_id = auth.uid())`. Enums: `fodmap_level`, `noom_color`,
  `noom_category`, `dash_group`, `meal_type`. Seed idempotency via **partial unique indexes**
  `where user_id is null` (e.g. `foods_seed_key_idx on foods (lower(name)...) where user_id is null`).
- **Seed** (`scripts/seed.ts`): `tsx` script, loads `data/*.json`, service-role client
  (`auth.persistSession:false`), `assertCanBypassRls`, lookup-then-write by natural key, builds an
  in-memory `Map<key,id>` to resolve `food_name → food_id`, delete-then-reinsert children, prints
  unmatched names. `npm run seed`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_`).
- **DB layer** (`src/lib/db/`): hand-authored `types.ts` row interfaces (numeric → `number`,
  nullable → `T | null`); `queryKeys.ts` central key factory; per-domain hook files
  (`foods.ts`, `recipes.ts`, `foodLog.ts`, `dailyTargets.ts`); `index.ts` barrel. Every hook
  guards `supabase === null` (returns disabled query / throwing mutation) and scopes personal data
  via `useAuth().user.id`. Mutations `invalidateQueries` on success.
- **Diet lib** (`src/lib/diet/`): pure functions + colocated `*.test.ts`, barrel `index.ts`. This is
  the template for a new `src/lib/exercise/`.
- **Shell** (`src/App.tsx`): bottom nav already has an **Exercise** tab; `/exercise` currently renders
  `<Placeholder title="Exercise" />`. Page structure template: `src/pages/Meals.tsx` (date stepper
  with local-time `todayISO`/`addDays`, section cards `rounded-lg border bg-card p-3`, unconfigured/
  signed-out notices, `MEAL_ORDER` button grid). Component conventions: `src/components/meals/*`,
  `src/components/diet/*` (`cn()`, `Button` from `@/components/ui/button`, lucide icons).
- **Tests**: Vitest (jsdom) colocated `*.test.ts`, `npm test`. Playwright `e2e/` (chromium + Pixel 5,
  builds+previews prod bundle, baseURL `:4173`). `e2e/meals.spec.ts` shows the **skip-when-no-creds**
  pattern (`test.skip(!hasCreds, ...)`) — mirror it so CI stays green without a test Supabase project.

**Gaps Phase 2 fills:** no exercise tables/migration, no exercise seed loading, no exercise DB types
or hooks, no `src/lib/exercise/` interval logic, `/exercise` is a placeholder, no exercise tests.

**Dependency on researchers:** the seed run (Task 2) and manual verification consume the concurrent
`data/exercises.json`, `data/workouts.json`, `data/schedule.json` (shapes fixed in Task 1's contract
file). The migration, pure logic, types, hooks, and UI scaffolding do NOT block on the data landing;
only the seed run and final manual check do.

---

## Decisions made up front (confirm before coding — see Risks)

- **D1 — Schedule storage: relational `schedules` + `schedule_days`, NOT JSONB weeks.** Mirrors the
  `recipes`/`recipe_ingredients` parent+ordered-children pattern already in the codebase, queries
  cleanly ("today's workout" = filter by week+day), and lets `schedule_days.workout_id` FK to
  `workouts` for integrity. JSONB would re-introduce slug→id resolution at read time in the client.
- **D2 — Reference exercise tables DO get a `user_id` column + the foods-style RLS.** CLAUDE's table
  list omits `user_id`, but to reuse the exact proven seeding + RLS pattern (global rows
  `user_id IS NULL`, readable by all authed, partial-unique-index upsert, future user-custom rows),
  `exercises`, `workouts`, and `schedules` each get a nullable `user_id`. `workout_exercises` and
  `schedule_days` inherit access from their parent (like `recipe_ingredients`). `workout_log` is
  personal, owner-only.
- **D3 — `workout_log` is two tables: `workout_log` (one row per session) + `workout_log_exercises`
  (per-exercise results).** Matches the `food_log` posture but exercise sessions are inherently
  multi-exercise with per-step results (reps/sets/duration/hold/score/AMRAP rounds), so a child
  table is cleaner than a JSONB blob and keeps results queryable. `workout_log.workout_id` is
  **nullable** to allow ad-hoc/freestyle sessions; a `name` snapshot is stored so history survives
  reference-data edits.
- **D4 — Interval expansion is pure logic in `src/lib/exercise/`**, fully unit-tested independent of
  the timer/clock. The React player consumes the expanded step list and owns only the ticking clock.

---

## Task 1 — Data-file contracts for exercises (codegen-free shared types)

**Goal:** lock the exact JSON shapes the researchers emit so the seed script and app agree (mirrors
Phase 1 Task 0 / `src/lib/data/seedTypes.ts`).
**Files:** extend `src/lib/data/seedTypes.ts` with `ExerciseSeed`, `WorkoutSeed`,
`WorkoutExerciseSeed`, `ScheduleSeed`, `ScheduleWeekSeed`, `ScheduleDaySeed`; document them in
`data/README.md` (add an Exercise section: each field, its DB column, the stable key, defaults).
**Shapes (must match the tables in Task 1.5 + the researcher brief):**
- `exercises.json`: `ExerciseSeed[]` — `{ slug, name, category, subcategory?, muscle_groups[],
  equipment[], difficulty, instructions[], modifications[], cautions[], default_type, default_reps?,
  default_duration_sec?, default_hold_sec?, source }`. **Stable key: `lower(slug)`.**
- `workouts.json`: `WorkoutSeed[]` — `{ slug, name, category, description, duration_min, format,
  rounds?, default_work_sec?, default_rest_sec?, exercises: WorkoutExerciseSeed[], source }` where
  `WorkoutExerciseSeed = { exercise_slug, order, work_sec?, rest_sec?, reps?, hold_sec?, note? }`.
  **Stable key: `lower(slug)`.**
- `schedule.json`: `ScheduleSeed` (single object, or array if multiple cycles) — `{ name, source,
  weeks: [{ week, days: [{ day, label, workout_slug | null }] }] }`. **Stable key: `lower(name)`.**
**Reuse:** add exercise enum string-literal types to `src/lib/diet/types.ts` OR a new
`src/lib/exercise/types.ts` (preferred — keep exercise types out of the diet barrel):
`ExerciseCategory = 'cardio'|'strength'|'dynamic'|'stretch'|'yoga'|'back'`,
`WorkoutFormat = 'timed'|'rounds'|'amrap'|'emom'|'reps'|'freestyle'`,
`ExerciseDefaultType = 'reps'|'duration'|'hold'`. These are the single source of truth for the DB
enums, row types, seed types, and logic — do not redefine inline.
**Acceptance:** `seedTypes.ts` typechecks; `data/README.md` documents every exercise field, its DB
column, the default rules (missing arrays → `[]`, unknown enum → reject/skip with a warning, never
invent a default exercise type), and the stable keys.

---

## Task 1.5 — Migration `0003_exercise.sql` + `0004_exercise_seed_constraints.sql`

**Goal:** add the exercise schema following the existing enum + RLS + seed-index conventions exactly.
**Files:** `supabase/migrations/0003_exercise.sql`, `supabase/migrations/0004_exercise_seed_constraints.sql`.
**Enums (create at top, like `0001`):**
- `exercise_category as enum ('cardio','strength','dynamic','stretch','yoga','back')`
- `workout_format as enum ('timed','rounds','amrap','emom','reps','freestyle')`
- `exercise_default_type as enum ('reps','duration','hold')`
**Tables:**
- `exercises` (reference + user-custom): `id uuid pk default gen_random_uuid()`,
  `user_id uuid references auth.users(id) on delete cascade` (NULL = seed), `slug text not null`,
  `name text not null`, `category exercise_category not null`, `subcategory text`,
  `muscle_groups text[] not null default '{}'`, `equipment text[] not null default '{}'`,
  `difficulty text`, `instructions text[] not null default '{}'`,
  `modifications text[] not null default '{}'`, `cautions text[] not null default '{}'`,
  `default_type exercise_default_type not null`, `default_reps integer`,
  `default_duration_sec integer`, `default_hold_sec integer`, `source text`,
  `created_at timestamptz not null default now()`. Index: gin on `to_tsvector('english', name)` +
  `(user_id)` (mirror `foods`).
- `workouts` (reference + user-custom): `id`, `user_id` (NULL = seed), `slug text not null`,
  `name text not null`, `category exercise_category not null`, `description text`,
  `duration_min integer`, `format workout_format not null`, `rounds integer`,
  `default_work_sec integer`, `default_rest_sec integer`, `source text`, `created_at`.
- `workout_exercises` (ordered junction, child of workout — like `recipe_ingredients`): `id`,
  `workout_id uuid not null references workouts(id) on delete cascade`,
  `exercise_id uuid not null references exercises(id) on delete restrict`,
  `position integer not null` (avoid reserved word `order`; the seed field stays `order`),
  `work_sec integer`, `rest_sec integer`, `reps integer`, `hold_sec integer`, `note text`. Index on
  `(workout_id)`; unique `(workout_id, position)`.
- `schedules` (reference + user-custom): `id`, `user_id` (NULL = seed), `name text not null`,
  `source text`, `created_at`.
- `schedule_days` (child of schedule, ordered): `id`,
  `schedule_id uuid not null references schedules(id) on delete cascade`, `week integer not null`,
  `day integer not null`, `label text`,
  `workout_id uuid references workouts(id) on delete set null` (nullable = rest day). Unique
  `(schedule_id, week, day)`; index on `(schedule_id)`.
- `workout_log` (personal, one row per session): `id`,
  `user_id uuid not null references auth.users(id) on delete cascade`,
  `performed_on date not null default current_date`,
  `workout_id uuid references workouts(id) on delete set null` (nullable for ad-hoc/freestyle),
  `name text` (snapshot so history survives ref-data edits), `duration_sec integer`,
  `rounds_completed integer` (AMRAP/rounds), `notes text`, `completed boolean not null default true`,
  `created_at`. Index `(user_id, performed_on)` (mirror `food_log_user_date_idx`).
- `workout_log_exercises` (per-exercise results, child of `workout_log`): `id`,
  `workout_log_id uuid not null references workout_log(id) on delete cascade`,
  `exercise_id uuid references exercises(id) on delete set null`, `name text` (snapshot),
  `position integer`, `sets integer`, `reps integer`, `duration_sec integer`, `hold_sec integer`,
  `score numeric(8,2)`, `notes text`.
**RLS (mirror `0001` exactly):**
- `exercises`, `workouts`, `schedules`: `enable row level security`; `_read for select to
  authenticated using (true)`; `_insert/_update/_delete` gated on `user_id = auth.uid()`.
- `workout_exercises`, `schedule_days`: read `using (true)`; write `for all` gated by `exists
  (select 1 from <parent> p where p.id = <fk> and p.user_id = auth.uid())` (copy the
  `recipe_ingredients` policy form).
- `workout_log`: `for all to authenticated using (user_id = auth.uid()) with check (...)`.
- `workout_log_exercises`: read+write gated by `exists (select 1 from workout_log wl where
  wl.id = workout_log_id and wl.user_id = auth.uid())`.
**`0004_exercise_seed_constraints.sql` (partial unique indexes `where user_id is null`, like `0002`):**
- `exercises_seed_key_idx on exercises (lower(slug)) where user_id is null`
- `workouts_seed_key_idx on workouts (lower(slug)) where user_id is null`
- `schedules_seed_key_idx on schedules (lower(name)) where user_id is null`
**Acceptance:** both migrations apply cleanly via Supabase CLI on a fresh DB after `0001`/`0002`;
`select` of each new table works as an authed user; an authed user can insert into `workout_log` for
themselves but a crafted insert with another `user_id` is rejected by RLS (reviewer reasons about
the policy text). No secrets; nothing references `auth.users` columns directly beyond `id`.

---

## Task 2 — Extend the seed pipeline for exercises

**Goal:** load `data/exercises.json`, `workouts.json`, `schedule.json` as global seed rows
(`user_id = NULL`), idempotently, resolving `exercise_slug → exercise_id` and `workout_slug →
workout_id`; print unresolved slugs (the data-quality signal back to researchers).
**Files:** extend `scripts/seed.ts` with `seedExercises`, `seedWorkouts`, `seedSchedule` and call
them from `main()` (or a parallel `scripts/seedExercise.ts` sharing helpers — prefer extending
`seed.ts` so one `npm run seed` does everything; keep functions modular).
**How it works (mirror the existing food/recipe flow):**
1. `seedExercises`: lookup-then-write by `lower(slug)` among `user_id IS NULL` rows
   (`.is('user_id', null).eq('slug', slug)` then JS-confirm `lower`). Build
   `Map<lower(slug), exercise_id>`. Reject rows with an unknown `category`/`default_type` enum value
   (warn + skip, never coerce). Arrays default to `[]`.
2. `seedWorkouts`: lookup-then-write by `lower(slug)`, capture `workout_id`. Then delete-then-
   reinsert `workout_exercises` for that `workout_id` (deterministic re-runs, like
   `recipe_ingredients`). Resolve `exercise_slug` via the exercises Map → `exercise_id`; on a miss,
   push to `unresolved` and **skip that junction row** (do not insert a dangling FK — the column is
   NOT NULL). Map seed `order` → `position`.
3. `seedSchedule`: lookup-then-write the `schedules` row by `lower(name)`, capture `schedule_id`,
   delete-then-reinsert `schedule_days`. Resolve each `workout_slug` via the workouts Map →
   `workout_id`; `null`/rest days store `workout_id = null`; unknown slug → push to `unresolved` +
   store `null` so the cycle still seeds.
4. Print summary counts + a combined **unresolved slug** list (exercise + workout), like the existing
   unmatched-ingredient warning.
**Reuse:** `lc()`, `readJson()`, `assertCanBypassRls`, the service-role client, the counts/print
style — all already in `scripts/seed.ts`.
**Acceptance:** `npm run seed` twice → second run inserts 0 new rows (idempotent); spot-check in
Supabase that a known workout (e.g. the 7-minute workout) has its `workout_exercises` in `position`
order and a schedule week/day points at the right `workout_id`; unresolved-slug warnings print when a
workout references a missing exercise.

---

## Task 3 — DB row types + data-layer hooks

**Goal:** typed, null-guarded, user-scoped DB access for exercises, workouts, schedule, and the
workout log — behind hooks the UI calls (mirrors `src/lib/db/*`).
**Files:**
- `src/lib/db/types.ts` — add `ExerciseRow`, `WorkoutRow`, `WorkoutExerciseRow`, `ScheduleRow`,
  `ScheduleDayRow`, `WorkoutLogRow`, `WorkoutLogExerciseRow` (numeric → `number`, nullable →
  `T | null`, arrays non-null). Import enum types from `src/lib/exercise/types.ts`.
- `src/lib/db/queryKeys.ts` — add `exercises(category?)`, `exercise(slug)`, `workouts(category?)`,
  `workout(slug)`, `schedule(name?)`, `workoutLog(userId, date)`, `workoutLogHistory(userId)`.
- `src/lib/db/exercises.ts` — `useExercises(category?)` (browse/list, optional category filter,
  `select('*').order('name')`), `useExerciseSearch(term)` (ilike name, ≥2 chars, like `foods.ts`).
- `src/lib/db/workouts.ts` — `useWorkouts(category?)`; `useWorkout(slug)` → workout + ordered
  `workout_exercises` joined to `exercises` in one round-trip:
  `select('*, workout_exercises(*, exercise:exercises(*))')` then sort children by `position`.
  Returns `{ workout: WorkoutRow, exercises: (WorkoutExerciseRow & { exercise: ExerciseRow })[] }`.
- `src/lib/db/schedule.ts` — `useSchedule(name?)` → schedule + `schedule_days` joined to a light
  `workout:workouts(slug,name,category,duration_min,format)`; helper
  `todaysWorkout(schedule, week, day)` (pure, can live in `src/lib/exercise/`) for "today's
  suggested workout".
- `src/lib/db/workoutLog.ts` — `useWorkoutLog(date)` (sessions for a date with embedded
  `workout_log_exercises`), `useWorkoutLogHistory()` (recent sessions), `useAddWorkoutLog()`
  (insert session + child results in one logical op — insert parent, then children with the new id),
  `useUpdateWorkoutLog()`, `useDeleteWorkoutLog()`. All mutations `invalidateQueries` the
  date/history keys on success.
**Reuse:** `supabase` + null-guard, `useAuth()` scoping, `queryKeys` factory, the disabled-query /
throwing-mutation pattern from `foodLog.ts`/`dailyTargets.ts`. Add a barrel export line in
`src/lib/db/index.ts` for each new file.
**Acceptance:** typecheck passes; `useWorkout(slug)` returns children in `position` order with the
joined exercise; reference hooks work for an authed user; `useWorkoutLog`/mutations are RLS-scoped to
the signed-in user and disabled (no throw on render) when `supabase === null` or signed out.

---

## Task 4 — Pure interval/timer expansion logic in `src/lib/exercise/`

**Goal:** expand a workout (+ its ordered exercises and format) into a flat, ordered list of timed/
rep/hold **steps** the player renders — pure, deterministic, fully unit-tested without any clock.
**Files:** `src/lib/exercise/types.ts` (enums from Task 1), `src/lib/exercise/expandWorkout.ts`,
`src/lib/exercise/expandWorkout.test.ts`, `src/lib/exercise/index.ts` (barrel). Optionally
`src/lib/exercise/todaysWorkout.ts` (the schedule helper from Task 3).
**Signatures (define exactly; coder implements):**
```ts
export type StepKind = 'work' | 'rest' | 'hold' | 'reps' | 'prepare'

export interface WorkoutStep {
  index: number              // 0-based position in the full sequence
  kind: StepKind
  label: string              // exercise name, or "Rest"
  exerciseId: string | null  // null for pure rest/prepare steps
  durationSec: number | null // set for work/rest/hold/prepare; null for untimed reps
  reps: number | null        // set for reps steps; null otherwise
  note: string | null        // per-exercise note / modification hint
  round: number | null       // 1-based round for rounds/amrap/emom; null for single-pass
  totalRounds: number | null
}

export interface ExpandInput {
  format: WorkoutFormat
  rounds?: number | null
  defaultWorkSec?: number | null
  defaultRestSec?: number | null
  prepareSec?: number | null   // optional lead-in countdown (default 0/no step)
  exercises: Array<{
    exerciseId: string
    name: string
    defaultType: ExerciseDefaultType
    workSec?: number | null
    restSec?: number | null
    reps?: number | null
    holdSec?: number | null
    note?: string | null
  }>
}

export function expandWorkout(input: ExpandInput): WorkoutStep[]
```
**Format semantics (the core logic to test):**
- `timed`: each exercise → a `work` step (`workSec` ?? `defaultWorkSec`) followed by a `rest` step
  (`restSec` ?? `defaultRestSec`) **except no trailing rest after the last exercise**. Single pass.
- `rounds`: the whole `timed`-style sequence repeated `rounds` times; `round`/`totalRounds` set;
  optional inter-round rest if `defaultRestSec` is set and the work step omits its own.
- `amrap`: one labeled pass of the exercises with `round = null` initially but `totalRounds = null`;
  AMRAP is time-boxed by the player, so expansion emits ONE pass the player loops, and the count of
  completed loops is recorded as `rounds_completed` at log time. (Document this contract: expansion
  is the repeatable unit; the player owns the AMRAP clock.)
- `emom`: each exercise occupies a fixed 60s (or `defaultWorkSec`) minute slot — emit a `work` step
  of that fixed length per exercise per round; remaining time within the minute is implicit rest
  (player shows countdown). `rounds` = minutes.
- `reps`: each exercise → a `reps` step (no duration) unless its `defaultType === 'hold'`
  (→ `hold` step with `holdSec`); rest steps only if a `restSec` is present.
- `freestyle`: emit one `reps`/`hold`/`work` step per exercise per its `defaultType`, no auto rest —
  a checklist the user advances manually.
- `hold`-type exercises always produce a `hold` step using `holdSec ?? defaultHoldSec` regardless of
  format (e.g. stretches inside a `timed` routine).
- A leading `prepare` step is emitted only when `prepareSec > 0`.
**Acceptance (unit tests cover edges):** empty exercises → `[]`; single `timed` exercise → one `work`
step, NO trailing rest; two `timed` exercises → work,rest,work (no final rest); `rounds:3` triples
the sequence with correct `round`/`totalRounds`; `emom` with 4 exercises × 2 rounds → 8 fixed-length
work steps; a `hold` exercise inside a `timed` workout yields a `hold` step with the right seconds;
`reps` format yields untimed `reps` steps; missing per-exercise secs fall back to defaults; explicit
per-exercise secs override defaults; `prepareSec:10` prepends one `prepare` step. No reliance on
`Date`/timers — pure input→output.

---

## Task 5 — Exercise page: browse, workout detail, and a guided routine player

**Goal:** replace the `/exercise` Placeholder with a real, mobile-first Exercise page: browse by
category, view a workout (exercises, prescriptions, **cautions + modifications shown verbatim**),
run a **guided routine player** with large timers, auto-advance, pause/skip, round tracking, optional
audio/vibration cues, and session logging; plus a **4-week cycle** view showing today's suggested
workout.
**Files:**
- `src/pages/Exercise.tsx` — page shell (mirrors `Meals.tsx`: section cards, optional date context
  for the log, unconfigured/signed-out notices). Holds view state: browse | workout detail | player.
- Wire `src/App.tsx`: replace `<Route path="/exercise" element={<Placeholder.../>}/>` with
  `<Route path="/exercise" element={<Exercise/>}/>` and import the page (drop the Placeholder use).
- `src/components/exercise/CategoryBrowser.tsx` — chips/tabs for the 6 categories →
  `useExercises(category)` / `useWorkouts(category)` lists; tap an item → detail.
- `src/components/exercise/ExerciseCard.tsx` — exercise display: name, muscle groups, equipment,
  difficulty, instructions, **modifications**, **cautions** (cautions visually distinct, never
  collapsed away). Big tap targets.
- `src/components/exercise/WorkoutDetail.tsx` — workout meta (format, duration, rounds) + ordered
  exercise list with prescriptions (work/rest/reps/hold) from `useWorkout(slug)`; a prominent
  **Start** button → player.
- `src/components/exercise/RoutinePlayer.tsx` — consumes `expandWorkout(...)` step list; shows the
  current step large (exercise name, big countdown for timed/hold, rep target for reps), progress
  (step X of N, round Y of Z), controls: **pause/resume, skip, previous, end**. Auto-advances when a
  timed step's countdown hits 0. For AMRAP, loops the pass and counts completed rounds with a
  manual "+1 round" / "done" control. On finish → log dialog.
- `src/components/exercise/CompleteDialog.tsx` — record `rounds_completed`, total time (auto from the
  clock), per-exercise reps/score/notes (optional), mark complete → `useAddWorkoutLog`.
- `src/components/exercise/CycleView.tsx` — `useSchedule()` rendered as weeks×days grid; highlight
  today (via `todaysWorkout`); tapping a day with a workout opens its `WorkoutDetail`.
- `src/components/exercise/WorkoutLogList.tsx` — recent sessions (`useWorkoutLogHistory`) +
  today's sessions (`useWorkoutLog(date)`), with delete.
- `src/components/exercise/useIntervalTimer.ts` — small hook owning the ticking clock: drives the
  current step's countdown, fires `onStepComplete`, handles pause/resume/skip. Keep clock concerns
  here; the player stays declarative.
**Timer/clock implementation notes (address the Risks):**
- Drive the countdown from a **wall-clock target timestamp** (`stepEndsAt = performance.now() +
  durationSec*1000`) and recompute remaining each tick, NOT by decrementing a counter — so background
  throttling / dropped `setInterval` ticks don't drift the total. On `visibilitychange` → visible,
  recompute remaining from the timestamp and auto-advance past any steps that elapsed while hidden.
- **Audio/vibration are opt-in and lazy:** a "Sound" toggle (default off); create/`resume()` the
  `AudioContext` and call `navigator.vibrate` only from within the user gesture that starts the
  routine (autoplay/vibration policies require a gesture). Never block the routine on audio.
- **Big tap targets + accessibility:** controls ≥44px, `aria-label`s, `aria-live="polite"` on the
  countdown/step label so it's announced, visible focus states. Keep contrast for at-a-glance use.
**Reuse:** `Meals.tsx` page structure (date stepper helpers `todayISO`/`addDays` if a date context is
wanted for the log), `Button`, `cn()`, lucide icons, the section-card styling, `Disclaimer`-style
notice component pattern (a brief "consult a professional / stop if pain" note for exercise), the
unconfigured/signed-out notice blocks. Pull ALL display data via the Task 3 hooks; pull step logic
via `expandWorkout`.
**Acceptance:** `/exercise` renders without the Placeholder; browsing a category lists exercises/
workouts; opening a workout shows ordered exercises with cautions+modifications visible; pressing
Start runs the player with a large countdown that auto-advances and tracks rounds; pause/skip/end
work; finishing opens the complete dialog and `useAddWorkoutLog` writes a session; the cycle view
highlights today's workout. Existing `e2e/app.spec.ts` still passes.

---

## Task 6 — Tests: unit + e2e

**Goal:** lock the interval-expansion math and the core browse→play→log loop.
**Files:**
- `src/lib/exercise/expandWorkout.test.ts` (lands with Task 4) — the format/edge matrix above.
- `src/lib/exercise/todaysWorkout.test.ts` — week/day → workout (and rest-day null) resolution.
- Optional small test for `useIntervalTimer` drift/visibility logic using fake timers
  (`vi.useFakeTimers()` + mocked `performance.now`) — assert remaining is recomputed from the
  timestamp, not decremented, and that elapsed-while-hidden steps auto-advance.
- `e2e/exercise.spec.ts` — mirror `e2e/meals.spec.ts` skip pattern:
  `test.skip(!hasCreds, ...)` reading `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` (+ an
  `E2E_TEST_WORKOUT` slug/name env, default a short seeded routine). Flow: login → Exercise tab →
  open a short workout → Start → (skip through steps to finish quickly, or use a 1-step routine) →
  complete → assert it appears in today's log → reload → it persists. Document that e2e needs the
  Supabase test project + seeded exercise data; without creds it skips, never fails.
**Acceptance:** `npm test` green incl. the expansion suite (all format edges covered); `npm run e2e`
green with test creds for the play→log→reload flow; without creds the exercise spec is skipped, not
failing; `app.spec.ts` stays green.

---

## Suggested execution order & waves

- **Wave A (no data dependency, parallelizable):**
  - Task 1 (contracts + exercise enum types) — unblocks everything.
  - Task 1.5 (migrations) — after Task 1's enum decisions; can proceed in parallel with logic.
  - Task 4 (pure `expandWorkout` + tests) — depends only on Task 1 enum types.
- **Wave B:** Task 3 (DB types + hooks) — after Task 1.5 (needs the schema) and Task 1 types.
- **Wave C:** Task 2 (seed extension) — once researcher JSON lands AND Task 1.5 migrations applied.
  Runs in parallel with Wave B/D.
- **Wave D:** Task 5 (UI) — after Tasks 3 (hooks) + 4 (logic). Largest task; split sub-waves:
  browse/detail first, then player, then complete-dialog + cycle view + log list.
- **Wave E:** Task 6 — unit tests land with Task 4; e2e after Task 5 + a seeded test project.

---

## Risks & things for the human to confirm

- **Timer accuracy / Page Visibility throttling (mobile, screen-lock).** `setInterval` is throttled
  or paused in background tabs and on screen lock; a decrement-counter timer will drift. Mitigation
  (Task 5): drive from a wall-clock target timestamp, recompute remaining each tick, and reconcile
  on `visibilitychange`. **Confirm** whether a wake-lock (`navigator.wakeLock`) to keep the screen on
  during a routine is in scope for v2 (it materially improves the workout-on-phone experience but is
  best-effort and not universally supported).
- **Audio autoplay / vibration restrictions.** Browsers block `AudioContext` and `navigator.vibrate`
  outside a user gesture, and iOS Safari has tighter rules / no vibration. Mitigation: opt-in toggle,
  init audio inside the Start gesture, degrade silently. **Confirm** cues are nice-to-have (the
  routine must work fully muted).
- **Schedule data model (D1).** Plan chose relational `schedules`+`schedule_days` over JSONB weeks.
  **Confirm** — if the researcher's `schedule.json` is expected to be edited/extended often as raw
  JSON, JSONB might be preferred; otherwise relational is the better fit for this codebase.
- **Reference exercise tables get `user_id` + foods-style RLS (D2).** CLAUDE's table list omits
  `user_id` on `exercises`/`workouts`/`schedules`. The plan adds it to reuse the proven seed+RLS
  pattern and allow future user-custom exercises. **Confirm** this is acceptable (alternative:
  service-role-only seeding with read-for-all and NO user-custom rows, which is simpler but blocks
  the user ever adding their own exercise/workout).
- **`workout_log` split into session + per-exercise child (D3).** **Confirm** the per-exercise
  results table is wanted in v1, vs. a simpler single-row session log (mark-complete + total time +
  notes + rounds) with per-exercise detail deferred. Recommend the split since the player already
  knows per-step results, but the simpler form is a valid v1 cut.
- **AMRAP/EMOM semantics.** Expansion treats the exercise pass as the repeatable unit and lets the
  player own the AMRAP time-box / EMOM minute clock (recording `rounds_completed`). **Confirm** the
  researcher's `format` values and any per-workout time-cap field; if AMRAP needs an explicit
  `cap_min`, add it to the workout shape in Task 1.
- **Slug stability between data files.** `workout_exercises` and `schedule_days` resolve by
  `exercise_slug`/`workout_slug`. Researchers must keep slugs consistent across the three JSON files;
  the seed prints unresolved slugs as the feedback loop (mirrors Phase 1's unmatched-ingredient
  signal). **Confirm** exact-slug matching is acceptable (no alias map).
- **E2E auth reuses the meals strategy** — needs the throwaway Supabase test user + seeded exercise
  data in a test/staging project, never the owner's real account. **Confirm** the test project will
  also carry the exercise seed.

---

## Final verification (definition of done for Phase 2)

1. `npm run typecheck` + `npm run lint` clean.
2. `npm test` green, including the full `expandWorkout` format/edge matrix and `todaysWorkout`.
3. Migrations `0003`/`0004` apply cleanly on a fresh DB after `0001`/`0002`; RLS verified
   (reference readable by all authed; `workout_log`/children owner-only).
4. `npm run seed` is idempotent for exercises/workouts/schedule (0 inserts on second run); unresolved
   slugs print; spot-check a known workout's ordered `workout_exercises` and a schedule day's workout.
5. `/exercise` is a working page: browse by category, workout detail with cautions+modifications,
   guided player with large auto-advancing timers + pause/skip + round tracking, session logging that
   persists across reload, and a 4-week cycle highlighting today.
6. `npm run e2e` green with test creds for browse→play→complete→log→reload; skipped (not failed)
   without creds; `app.spec.ts` still green.
