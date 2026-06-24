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
`swaps.json` (100), `sample_days.json` (7).

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
