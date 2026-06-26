# Phase 3 — Martial Arts category for the exercise system (implementation plan)

> Planner output. The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> This is a **thin extension** of the Phase 2 exercise system (`.planning/phase2-exercise.md`). It
> adds one value to an enum and surfaces a new category in the seed + UI. No new tables, no new
> columns, no new hooks. Discipline (boxing, BJJ, Muay Thai, etc.) lives in the **existing
> `subcategory` text column**; injury cautions live in the **existing `cautions` array** which
> `ExerciseCard` already renders verbatim.
>
> Data-safety posture (carried over): `cautions` / `modifications` are shown verbatim, never dropped.
> New here: martial arts is **practice-with-instruction content**, never a substitute for a qualified
> instructor or supervised sparring — the UI must say so.

## Ground truth (already built — read before coding)

- **DB enum + tables** (`supabase/migrations/0003_exercise.sql`): `exercise_category` =
  `('cardio','strength','dynamic','stretch','yoga','back')`. `exercises.subcategory text` and
  `exercises.cautions text[]` already exist; `workouts.category exercise_category not null`. RLS:
  reference tables readable by all authed, seed rows are `user_id IS NULL`.
- **Seed constraints** (`0004_exercise_seed_constraints.sql`): partial unique indexes
  `where user_id is null` on `lower(slug)` (exercises, workouts) and `lower(name)` (schedules) —
  these are what make re-seeding idempotent and what would catch a slug collision.
- **Latest migration is `0005_food_barcode.sql`** → the new file is **`0006_martial_arts_category.sql`**.
- **Enum single source of truth** (`src/lib/exercise/types.ts`): `ExerciseCategory` union AND the
  `EXERCISE_CATEGORIES: readonly ExerciseCategory[]` runtime array. The seed validates against this
  array (`EXERCISE_CATEGORY_SET` in `scripts/seed.ts`); the UI does NOT currently derive its category
  list from it (see Task 2 risk).
- **Seed** (`scripts/seed.ts`): `main()` reads `data/exercises.json`, `data/workouts.json`,
  `data/schedule.json`; `seedExercises` builds `Map<lower(slug), id>`; `seedWorkouts` resolves
  `exercise_slug` via that map, delete-then-reinserts `workout_exercises`; `seedSchedules` resolves
  `workout_slug`. Unknown enum → skip+warn; unresolved slug → skip junction (or store rest) + warn.
- **Hooks** (`src/lib/db/exercises.ts`, `workouts.ts`): `useExercises(category?)`,
  `useWorkouts(category?)` already take any `ExerciseCategory` and filter `.eq('category', …)`.
  **No hook change needed** — a new enum value flows through unchanged.
- **UI** (`src/components/exercise/WorkoutBrowser.tsx`): a **hand-maintained** `CATEGORIES` array of
  `{ value, label }` drives the category chips. `ExerciseCard.tsx` renders `subcategory`, `cautions`
  (amber box), `modifications` verbatim — **reuse, do not duplicate**. `WorkoutDetail.tsx` and
  `schedule.ts` render `category` via `.capitalize` on the raw string — **no exhaustive switch/Record
  exists**, so adding a value does NOT break them.
- **Researcher (concurrent) deliverables, assumed present:** `data/martial_arts_exercises.json`
  (`ExerciseSeed[]`, every row `category:"martial-arts"`, discipline in `subcategory`) and
  `data/martial_arts_workouts.json` (`WorkoutSeed[]`, `category:"martial-arts"`), **same schema** as
  the existing files (`src/lib/data/seedTypes.ts`). No new schedule file.

**Exhaustiveness audit (all category-keyed surfaces — only TWO need editing):**
1. `src/lib/exercise/types.ts` — `ExerciseCategory` union + `EXERCISE_CATEGORIES` array. **EDIT (Task 2).**
2. `src/components/exercise/WorkoutBrowser.tsx` — `CATEGORIES: {value,label}[]`. **EDIT (Task 4).**
3. `src/lib/db/types.ts` (`ExerciseRow.category`, `WorkoutRow.category`) — typed as `ExerciseCategory`;
   widening the union covers them automatically. **No edit.**
4. `WorkoutDetail.tsx`, `WorkoutBrowser` row meta, `schedule.ts` — render `category` as a raw
   capitalized string. **No edit** (they will show "Martial-arts"; see Task 4 label note).
5. DB enum + Postgres — **EDIT via migration (Task 1).**
No `switch`/`Record<ExerciseCategory, …>` exists anywhere, so there is no compile-time exhaustiveness
break to fix beyond the two source-of-truth edits.

---

## Task 1 — Migration `0006_martial_arts_category.sql` (add the enum value)

**Goal:** add `'martial-arts'` to the `exercise_category` Postgres enum, idempotently and safely.
**File:** `supabase/migrations/0006_martial_arts_category.sql` (new).
**Statement:**
```sql
alter type exercise_category add value if not exists 'martial-arts';
```
**Postgres caveats — document inline as a header comment and respect them:**
- `ALTER TYPE … ADD VALUE` **cannot run inside a transaction block** in older PG and some migration
  runners wrap each file in a transaction. Keep this migration to **this single statement, in its own
  file**, with **no other DDL** in it (so it can run autocommit). Do not bundle the (non-existent)
  table/column changes here.
- The newly added value **cannot be used in the same transaction** that adds it (e.g. you cannot
  `INSERT … category='martial-arts'` in this same migration). That is fine — seeding (Task 3) runs
  later as a separate process, well after this migration commits.
- `IF NOT EXISTS` makes **re-running safe** (no error if the value is already present).
**No other schema change is needed** — confirmed: discipline → existing `subcategory text`; injury
notes → existing `cautions text[]`; `workouts.category` already accepts the widened enum.
**Reuse:** match the comment/style of `0003`/`0004`/`0005`.
**Acceptance:** migration applies cleanly via the Supabase CLI on a DB that already has `0003`–`0005`;
running it a second time is a no-op (no error); `select enum_range(null::exercise_category)` now
includes `martial-arts`; an authed user can `insert`/`select` an `exercises` row with
`category='martial-arts'` (RLS unchanged, reference-read = `using (true)`).

---

## Task 2 — Add `'martial-arts'` to the type single-source-of-truth

**Goal:** widen the `ExerciseCategory` union and the `EXERCISE_CATEGORIES` runtime array so the seed
validator accepts martial-arts rows and TypeScript knows the value.
**File:** `src/lib/exercise/types.ts`.
**Changes (both, together — they must stay in sync):**
- Add `| 'martial-arts'` to the `ExerciseCategory` union.
- Add `'martial-arts'` to the `EXERCISE_CATEGORIES` array.
**Reuse / do-NOT-duplicate:** this array already feeds `EXERCISE_CATEGORY_SET` in `scripts/seed.ts`
(so the seed will stop skipping MA rows once added) and is the canonical list. Do not redefine the
literal anywhere else.
**Exhaustiveness check (performed; result):** widening the union does **not** break any
`switch`/`Record` (none keyed on `ExerciseCategory` exist). It correctly types `ExerciseRow.category`
/ `WorkoutRow.category` (`src/lib/db/types.ts`) and the `category?` params of `useExercises` /
`useWorkouts` with no further edits. The ONLY hand-maintained list that is NOT derived from this
array is `WorkoutBrowser`'s `CATEGORIES` (handled in Task 4).
**Acceptance:** `npm run typecheck` clean; a quick assertion `EXERCISE_CATEGORIES.includes('martial-arts')`
is true (covered by Task 6 unit test).

---

## Task 3 — Seed merge: also load the two martial-arts JSON files

**Goal:** load `data/martial_arts_exercises.json` and `data/martial_arts_workouts.json` as global
seed rows alongside the existing data, idempotently, **reusing the existing dedupe + slug→id
resolution unchanged**.
**File:** `scripts/seed.ts` (`main()` only; the `seedExercises`/`seedWorkouts` functions are NOT
modified).
**Approach — DECISION: concat-then-seed (recommended), not separate seed calls.** In `main()`:
- Read the two MA files in the existing `Promise.all` (`readJson<ExerciseSeed[]>('martial_arts_exercises.json')`
  and `readJson<WorkoutSeed[]>('martial_arts_workouts.json')`).
- **Concatenate** before the existing calls:
  `const allExercises = [...exercises, ...martialExercises]` and
  `const allWorkouts = [...workouts, ...martialWorkouts]`; pass `allExercises`/`allWorkouts` into the
  existing `seedExercises` / `seedWorkouts`.
- **Why concat, not a second seed call:** `seedWorkouts` resolves `exercise_slug` against the single
  `exerciseIdBySlug` map built by `seedExercises`. Concatenating means MA workouts can reference MA
  **or** existing exercises (e.g. a martial-arts conditioning circuit that includes a generic
  burpee), and the existing idempotency (`lower(slug)` lookup-then-write) + unresolved-slug reporting
  apply to the merged set with **zero new code paths**. Separate calls would need a second, merged
  map and would risk duplicating the resolution logic.
- Update the startup `console.log` counts to include the MA totals (e.g. add them into the existing
  exercises/workouts counts, or print a `(+N martial arts)` note). The unresolved-slug + skipped-enum
  warnings already aggregate across all rows, so MA rows flow into them automatically.
- **Schedule:** unchanged. `data/schedule.json` is the only schedule file. See Task 4 risk for the
  optional "Your Favorite Workout!" rest-day slots — do NOT wire MA into the schedule in this task.
**Idempotency / collision guard:** the partial unique indexes on `lower(slug)` (from `0004`) plus the
lookup-then-write mean a re-run inserts 0 rows. **Slug collisions between MA and existing data are a
researcher-data risk** (see Risks) — if an MA exercise reuses an existing slug, the second one in the
concatenated array will **update** (overwrite) the first rather than insert a duplicate. The seed will
not error, so this must be guarded by a cross-file slug-uniqueness check (Task 6 data test) and by the
researcher namespacing MA slugs (e.g. `ma-boxing-jab`).
**Reuse:** `readJson`, `lc`, `seedExercises`, `seedWorkouts`, the counts/warning print block — all
unchanged. Only `main()` wiring changes.
**Acceptance:** `npm run seed` twice → second run reports +0 new exercises/+0 new workouts
(idempotent); a known MA workout's `workout_exercises` are present in `position` order; a MA workout
that references a missing exercise prints in the existing "unresolved slug(s)" warning; running with
the MA files absent fails fast with the existing readJson error (acceptable — they are required
deliverables) OR, if graceful degradation is wanted, wrap the two MA reads to default to `[]` on
ENOENT (recommend defaulting to `[]` so the seed still runs before the researcher lands the files —
**confirm**).

---

## Task 4 — UI: surface martial-arts as a browsable category with a safety note + discipline grouping

**Goal:** martial-arts appears as a category chip in `WorkoutBrowser`; within it the user can tell
disciplines apart (boxing vs BJJ) via `subcategory`; a martial-arts-specific **safety note** appears
(distinct from the existing diet/medical disclaimer); cautions/modifications continue to render via
`ExerciseCard` (reused).
**Files:**
- `src/components/exercise/WorkoutBrowser.tsx` — **EDIT:**
  - Add `{ value: 'martial-arts', label: 'Martial Arts' }` to the `CATEGORIES` array (gives a clean
    label instead of the auto-capitalized "Martial-arts" the raw-string renderers would show).
  - When `category === 'martial-arts'`, render the **MartialArtsSafetyNote** (below) above the lists.
  - **Discipline grouping:** within the martial-arts view, group/label exercises (and optionally
    workouts) by `subcategory`. Minimal approach: insert subheaders by `subcategory` in the
    "Individual moves" list (group the `exerciseList` by `e.subcategory`, render a small heading per
    discipline, fall back to "General" when `subcategory` is null). Reuse the existing list row markup;
    do not introduce a new card. Keep it behind the `category === 'martial-arts'` branch so other
    categories are unchanged. (Workouts list may stay flat; the row meta already shows `subcategory`
    via `category`/format line — confirm whether workouts also need discipline subheaders.)
- `src/components/exercise/MartialArtsSafetyNote.tsx` — **NEW** small presentational component:
  an amber/warning box (mirror `ExerciseCard`'s cautions styling: `border-amber-300 bg-amber-50 …`
  with `AlertTriangle`) containing a fixed, non-dismissible note distinct from the diet disclaimer,
  e.g.: "Martial arts carry a real injury risk. Warm up first. Learn techniques from a qualified
  instructor — this app is a reference, not a substitute for coaching. Never spar without supervision.
  Stop if you feel pain." Keep it a pure component (no data deps) so it is trivially testable.
**Reuse — do NOT duplicate:** `ExerciseCard` already renders `subcategory`, `cautions`, and
`modifications` verbatim; `WorkoutDetail` already renders the per-workout exercise list via
`ExerciseCard`. The safety note is the only genuinely new UI; everything else is enumeration +
grouping over existing components. The page-level disclaimer in `Exercise.tsx` stays as-is (the MA
note is category-specific and additive, not a replacement).
**Content-safety constraint:** copy must never imply the app replaces instruction or supervised
practice. The safety note plus per-exercise `cautions` carry this; do not add any "you're ready to
spar" style affordance.
**Acceptance:** with MA data seeded, a "Martial Arts" chip appears; selecting it lists MA workouts +
moves grouped by discipline and shows the safety note; opening an MA workout shows the standard
detail with each move's cautions/modifications verbatim; non-MA categories render exactly as before
(no safety note, no grouping). `npm run typecheck`/`lint` clean.

---

## Task 5 — (folded into Task 4) no new hooks/migrations

No data-layer work is required: `useExercises('martial-arts')` and `useWorkouts('martial-arts')`
already work via the widened enum (Task 2) and the unchanged `.eq('category', …)` filter. Listed here
explicitly so the coder does not invent new hooks. **Acceptance:** none beyond Tasks 2–4.

---

## Task 6 — Tests: unit + data cross-ref + e2e note

**Goal:** lock the enum widening, the no-collision invariant, and the browse→safety-note behavior.
**Files:**
- `src/lib/exercise/types.test.ts` (new or extend existing) — assert
  `EXERCISE_CATEGORIES.includes('martial-arts')` and that the array length matches the union's
  expected member count (a guard that the array and union stay in sync). Optionally assert
  `new Set(EXERCISE_CATEGORIES).size === EXERCISE_CATEGORIES.length` (no dup values).
- **Data cross-ref validation test** (preferred over mocking the live seed) — a Vitest that reads
  `data/martial_arts_exercises.json` + `data/martial_arts_workouts.json` (+ the base
  `exercises.json`) and asserts:
  1. every MA exercise has `category === 'martial-arts'` and a non-empty `subcategory`;
  2. every MA workout's `exercises[].exercise_slug` resolves to a slug present in **either** the MA
     exercises or the base exercises (mirror the seed's resolution rule — catches unresolved slugs
     before a DB run);
  3. **no slug collision**: the set of MA exercise slugs is disjoint from base exercise slugs
     (`lower(slug)`), and likewise MA workout slugs vs base workout slugs (catches the overwrite risk
     from Task 3). Gate/skip gracefully if the MA files are absent so CI stays green pre-researcher.
- A **seed merge/dedupe unit test** is OPTIONAL and lower-value (the seed touches the network); the
  data cross-ref test above covers the same invariants without a DB. Recommend the cross-ref test.
- `e2e/exercise.spec.ts` — add a case (or extend) following the existing `test.skip(!hasCreds, …)`
  pattern: login → Exercise tab → select "Martial Arts" → assert the safety note is visible → open an
  MA routine → assert at least one exercise's cautions render. Skip (never fail) without creds/seeded
  MA data, like the other specs.
**Acceptance:** `npm test` green incl. the type-sync + data cross-ref tests; with MA data the e2e MA
case passes; without creds it skips; existing `app.spec.ts` and the Phase 2 exercise tests stay green.

---

## Suggested execution order

1. **Task 1** (migration) — independent; apply it first so the DB accepts the value.
2. **Task 2** (types) — independent of the DB; unblocks both seed and UI. Can land in parallel with 1.
3. **Task 3** (seed merge) — needs Task 2 (so MA rows aren't skipped) + the researcher JSON; run the
   seed after Task 1 is applied (the enum value must exist in the committed DB).
4. **Task 4** (UI) — needs Task 2; visible end-to-end once Task 3 has seeded data.
5. **Task 6** (tests) — type-sync + data cross-ref land with Task 2/3; e2e after Task 4 + seeded data.

Wave-friendly: {1, 2} in parallel → 3 (after data lands) and 4 in parallel → 6.

---

## Risks & things to confirm

- **Postgres enum-add transaction caveat (Task 1).** `ALTER TYPE … ADD VALUE` must be its own
  single-statement migration and its new value can't be used in the same transaction. Mitigation:
  isolated `0006_*` file, `IF NOT EXISTS`, seeding deferred to a separate process. **Confirm** the
  Supabase CLI/runner in use doesn't wrap single-statement migrations in a way that rejects `ADD
  VALUE` (modern PG ≥12 allows `ADD VALUE` in a transaction for non-immediate use, but the runner may
  still need autocommit — keep the file single-statement to be safe).
- **Slug collisions between MA and existing data (Task 3/6).** Concat means a duplicate `lower(slug)`
  causes a silent **overwrite**, not an error (the partial unique index permits update via
  lookup-then-write). Mitigation: the Task 6 cross-ref disjointness test + researcher namespacing MA
  slugs (recommend an `ma-`/discipline prefix). **Confirm** the researcher will namespace slugs.
- **Missing MA files before the researcher lands them (Task 3).** Recommend defaulting the two MA
  reads to `[]` on ENOENT so `npm run seed` still works in the interim; **confirm** vs. hard-failing.
- **Exhaustiveness.** Audit found NO `switch`/`Record<ExerciseCategory,…>` to break; only the two
  source-of-truth lists (`EXERCISE_CATEGORIES`, `WorkoutBrowser.CATEGORIES`) and the DB enum need the
  new value. Raw-string category renderers (`WorkoutDetail`, `schedule.ts`) will display
  "Martial-arts" unless given the clean "Martial Arts" label — the `WorkoutBrowser` `CATEGORIES`
  label covers the chip; **confirm** whether the detail/cycle views also need a label map (currently
  out of scope; they `.capitalize` the raw value, yielding "Martial-arts").
- **Content must never imply it replaces instruction.** The MA safety note + per-exercise cautions
  carry this; no "ready to spar" affordances. Reviewer should check the copy.
- **Schedule "Your Favorite Workout!" slots (optional).** `data/schedule.json` has 4 rest-day-style
  slots (`workout_slug: null`, label "Your Favorite Workout!"). These COULD point at an MA workout
  slug to surface MA in the 4-week cycle. **Optional, not required** — leaving them null keeps them as
  user-choice. If wanted later, set `workout_slug` to a seeded MA workout in `schedule.json`; the
  existing `seedSchedules` resolution handles it with no code change. Do not do this in this phase
  unless the user asks.

---

## Final verification (definition of done)

1. `npm run typecheck` + `npm run lint` clean.
2. `0006_martial_arts_category.sql` applies on a DB at `0005`, is re-run-safe, and
   `enum_range(null::exercise_category)` includes `martial-arts`.
3. `EXERCISE_CATEGORIES` (and the union) include `martial-arts`; type-sync unit test green.
4. `npm run seed` loads the two MA files merged with the base data, is idempotent (+0 on re-run), and
   reports any unresolved MA slugs; data cross-ref test confirms MA→exercise slugs resolve and there
   are no MA/base slug collisions.
5. `/exercise` shows a "Martial Arts" chip; selecting it lists MA workouts/moves grouped by discipline
   with the MA safety note; opening an MA workout shows cautions + modifications verbatim; other
   categories unchanged.
6. e2e MA case passes with creds + seeded data; skipped (not failed) without; Phase 2 exercise tests
   and `app.spec.ts` stay green.
