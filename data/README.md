# `data/` — seed content contracts

This directory holds the researcher-authored JSON that the seed script
(`scripts/seed.ts`, run via `npm run seed`) loads into Supabase as **global seed
rows** (`user_id IS NULL`). The TypeScript contracts that mirror these shapes
live in [`src/lib/data/seedTypes.ts`](../src/lib/data/seedTypes.ts) and reuse the
diet-domain enums from `src/lib/diet/types.ts`.

> **Scope reminder (CLAUDE.md):** "FODMAP" = **fructose + fructans only**. An
> omitted FODMAP level **defaults to `unknown`** and must **never** be invented
> as `low`. `unknown` is shown as "not verified," never "safe."

Current files (validated): `foods.json` (178), `recipes.json` (8),
`swaps.json` (100), `sample_days.json` (7), `exercises.json` (80),
`workouts.json` (29), `schedule.json` (4 weeks × 7 days, 0 unresolved cross-refs).

---

## `foods.json` → `FoodSeed[]` → `foods` table

| JSON field             | DB column        | Notes                                                                 |
| ---------------------- | ---------------- | --------------------------------------------------------------------- |
| `name` (required)      | `name`           | Display name. Part of the stable key.                                 |
| `brand`                | `brand`          | Optional. Part of the stable key. (Not present in current data.)      |
| `serving_desc` (req.)  | `serving_desc`   | e.g. `"1 cup"`, `"100 g"`.                                             |
| `serving_grams`        | `serving_grams`  | Needed to compute NOOM color (`noomColor(calories, grams)`).          |
| `calories`             | `calories`       |                                                                       |
| `sodium_mg`            | `sodium_mg`      |                                                                       |
| `sat_fat_g`            | `sat_fat_g`      |                                                                       |
| `potassium_mg`         | `potassium_mg`   |                                                                       |
| `fiber_g`              | `fiber_g`        | First-class tracked nutrient.                                         |
| `added_sugar_g`        | `added_sugar_g`  |                                                                       |
| `fructose_level`       | `fructose_level` | `FodmapLevel`. **Defaults to `unknown`** if omitted.                  |
| `fructans_level`       | `fructans_level` | `FodmapLevel`. **Defaults to `unknown`** if omitted.                  |
| `noom_category`        | `noom_category`  | `NoomCategory`.                                                       |
| `dash_group`           | `dash_group`     | `DashGroup`.                                                          |
| `low_fodmap_high_fiber`| _(none)_         | **Not a DB column.** Curated flag; seed script ignores it. See below. |
| `source`               | `source`         | Citation for the diet/nutrition data.                                 |

**Stable key (idempotency):** `(lower(name), coalesce(lower(brand), ''))`.

**`low_fodmap_high_fiber`:** a research-convenience boolean marking a food as a
low-FODMAP high-fiber pick. There is no corresponding `foods` column, so the seed
script does not persist it. The app's fiber-gap suggestions use the curated
`LOW_FODMAP_HIGH_FIBER` constant in `src/lib/diet/fiberSuggestions.ts`, not this
flag. If a future feature needs it in the DB, add a migration + column first.

---

## `recipes.json` → `RecipeSeed[]` → `recipes` (+ `recipe_ingredients`)

| JSON field          | DB column         | Notes                                  |
| ------------------- | ----------------- | -------------------------------------- |
| `name` (required)   | `name`            | Part of the stable key.                |
| `prep_min`          | `prep_min`        |                                        |
| `servings`          | `servings`        |                                        |
| `cal_per_serving`   | `cal_per_serving` |                                        |
| `meal_type`         | `meal_type`       | `MealType`.                            |
| `instructions` (req.)| `instructions`   | `string[]`.                            |
| `source`            | `source`          |                                        |
| `ingredients` (req.)| _(child rows)_    | → `recipe_ingredients` (see below).    |

**Stable key (idempotency):** `lower(name)`.

### `ingredients[]` → `IngredientSeed[]` → `recipe_ingredients` table

| JSON field   | DB column  | Notes                                                              |
| ------------ | ---------- | ----------------------------------------------------------------- |
| `food_name`  | `food_id`  | Matched **exact, case-insensitive** to a seeded `foods.name`.     |
| `raw_text`   | `raw_text` | Stored as the fallback (always kept).                             |
| `quantity`   | `quantity` |                                                                   |
| `unit`       | `unit`     |                                                                   |

**Matching rule:** `food_name` is resolved against the in-memory foods map by
`lower(name)`. On a **miss**, `food_id` is set to `null`, `raw_text` is kept, and
the unmatched `food_name` is printed in the seed summary (the data-quality signal
back to the researchers). No alias/synonym map — names must match `foods.json`
exactly (case-insensitive). The seed re-creates a recipe's ingredient rows on
every run (delete-then-insert) so re-runs are deterministic.

> **Known data-quality gap (current data):** ~65% of named ingredients do not
> match because `foods.json` uses descriptive suffixes (e.g. food
> `"Spinach, raw"` vs ingredient `"Spinach"`; food `"Egg, whole, cooked"` vs
> ingredient `"Eggs"`). These fall back to `raw_text` until the names are
> reconciled. Run `npm run seed` to see the full unmatched list.

---

## `swaps.json` → `SwapSeed[]` → `swaps` table

| JSON field       | DB column        |
| ---------------- | ---------------- |
| `from_food` (req)| `from_food`      |
| `to_food` (req)  | `to_food`        |
| `calories_saved` | `calories_saved` |
| `note`           | `note`           |

**Stable key (idempotency):** `(lower(from_food), lower(to_food))`.

---

## `sample_days.json` → `SampleDay[]` — **not yet wired**

Shape: `{ day: number, breakfast?, lunch?, dinner?, snack? }` where each meal
slot names a recipe (or free-text item) by string.

**v1 status:** reference data only, for a **future "load a sample day" feature**.
The seed script does **not** persist sample days and does **not** write them to
`food_log` (that table is strictly per-user, RLS-scoped). Documented here so a
partial dataset never blocks the build.

---

# Exercise data (Phase 2)

The three files below seed the exercise schema
(`supabase/migrations/0003_exercise.sql`) as **global seed rows**
(`user_id IS NULL`). Their TS contracts are `ExerciseSeed`, `WorkoutSeed`,
`ScheduleSeed` in [`src/lib/data/seedTypes.ts`](../src/lib/data/seedTypes.ts) and
reuse the exercise enums from
[`src/lib/exercise/types.ts`](../src/lib/exercise/types.ts) (the single source of
truth for `ExerciseCategory`, `WorkoutFormat`, `ExerciseDefaultType`,
`Difficulty`). Cross-references resolve by **exact, case-insensitive slug** (no
alias map); the seed prints any unresolved slugs.

## `exercises.json` → `ExerciseSeed[]` → `exercises` table

| JSON field             | DB column              | Notes                                                                  |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `slug` (required)      | `slug`                 | Stable key. `lower(slug)` is unique among seed rows.                   |
| `name` (required)      | `name`                 | Display name.                                                          |
| `category` (required)  | `category`             | `ExerciseCategory`. Unknown value → **row skipped** (warn).           |
| `subcategory`          | `subcategory`          |                                                                        |
| `muscle_groups`        | `muscle_groups`        | `text[]`; omitted → `[]`.                                              |
| `equipment`            | `equipment`            | `text[]`; omitted → `[]`.                                              |
| `difficulty`           | `difficulty`           | `'easy' \| 'medium' \| 'hard'`.                                        |
| `instructions`         | `instructions`         | `text[]`; omitted → `[]`.                                              |
| `modifications`        | `modifications`        | `text[]`; **shown verbatim**, never dropped. Omitted → `[]`.          |
| `cautions`             | `cautions`             | `text[]`; **shown verbatim**, never dropped. Omitted → `[]`.          |
| `default_type` (req.)  | `default_type`         | `ExerciseDefaultType`. Unknown → **row skipped**. Never invented.     |
| `default_reps`         | `default_reps`         |                                                                        |
| `default_duration_sec` | `default_duration_sec` |                                                                        |
| `default_hold_sec`     | `default_hold_sec`     |                                                                        |
| `source`               | `source`               | Citation.                                                              |

**Stable key (idempotency):** `lower(slug)`.

## `workouts.json` → `WorkoutSeed[]` → `workouts` (+ `workout_exercises`)

| JSON field          | DB column          | Notes                                                       |
| ------------------- | ------------------ | ---------------------------------------------------------- |
| `slug` (required)   | `slug`             | Stable key.                                                |
| `name` (required)   | `name`             |                                                            |
| `category` (req.)   | `category`         | `ExerciseCategory`. Unknown → **row skipped**.            |
| `description`       | `description`      |                                                            |
| `duration_min`      | `duration_min`     | Also the AMRAP/EMOM time-box source (no separate cap).     |
| `format` (req.)     | `format`           | `WorkoutFormat`. Unknown → **row skipped**.               |
| `rounds`            | `rounds`           |                                                            |
| `default_work_sec`  | `default_work_sec` |                                                            |
| `default_rest_sec`  | `default_rest_sec` |                                                            |
| `exercises` (req.)  | _(child rows)_     | → `workout_exercises` (see below).                         |
| `source`            | `source`           |                                                            |

**Stable key (idempotency):** `lower(slug)`.

### `exercises[]` → `WorkoutExerciseSeed[]` → `workout_exercises`

| JSON field      | DB column     | Notes                                                                  |
| --------------- | ------------- | --------------------------------------------------------------------- |
| `exercise_slug` | `exercise_id` | Resolved exact/case-insensitive to `exercises.slug`. Miss → **row skipped** (FK is NOT NULL) + printed. |
| `order` (req.)  | `position`    | Renamed (`order` is a reserved word). Unique per workout.             |
| `work_sec`      | `work_sec`    |                                                                       |
| `rest_sec`      | `rest_sec`    |                                                                       |
| `reps`          | `reps`        |                                                                       |
| `hold_sec`      | `hold_sec`    |                                                                       |
| `note`          | `note`        |                                                                       |

The seed re-creates a workout's `workout_exercises` on every run
(delete-then-insert) so re-runs are deterministic.

## `schedule.json` → `ScheduleSeed` (or `ScheduleSeed[]`) → `schedules` (+ `schedule_days`)

Shape: `{ name, source?, weeks: [{ week, days: [{ day, label?, workout_slug? }] }] }`.
A single cycle object **or** an array of cycles is accepted.

| JSON field             | DB column     | Notes                                                                       |
| ---------------------- | ------------- | --------------------------------------------------------------------------- |
| `name` (required)      | `name`        | Stable key. `lower(name)` unique among seed rows.                           |
| `source`               | `source`      |                                                                             |
| `weeks[].week`         | `week`        |                                                                             |
| `weeks[].days[].day`   | `day`         | Unique per `(schedule_id, week, day)`.                                      |
| `weeks[].days[].label` | `label`       | Original category text preserved (the PDF names categories, not variants).  |
| `weeks[].days[].workout_slug` | `workout_id` | Resolved to a workout. `null` (rest) or unresolved slug → `workout_id = null`. |

**Stable key (idempotency):** `lower(name)`. `schedule_days` are recreated each
run (delete-then-insert).
