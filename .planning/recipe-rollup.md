# Recipe Diet Roll-up (planner output)

> The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> Scope reminder (CLAUDE.md): **"FODMAP" = fructose + fructans only.** NOOM color is **computed
> from caloric density.** `unknown` FODMAP **must never display as "safe."** Keep the medical
> disclaimer visible on any meal screen.

## Problem

Recipes currently render an unknown NOOM dot and **no** FODMAP badge in search
(`FoodSearch.tsx`), and logged recipe entries contribute **calories only**
(`toLoggedNutrients` in `foodLog.ts`). Ingredients are now linked to `foods` rows
(`recipe_ingredients.food_id`, joined via `food:foods(*)`). CLAUDE.md requires a recipe diet
verdict that **rolls up from ingredients**: "worst-case fructose/fructans, summed sodium/fiber,
averaged caloric density."

## Ground truth (verified in code)

- `lowFodmapSafe(fructose, fructans) -> 'safe'|'caution'|'avoid'|'not-verified'`; any axis
  `unknown` -> `not-verified` (`src/lib/diet/lowFodmapSafe.ts`).
- `noomColor(calories, grams) -> NoomColor | null`; returns `null` when grams<=0 or non-finite
  (`src/lib/diet/noomColor.ts`).
- `FodmapLevel = 'low'|'moderate'|'high'|'unknown'`; `NoomColor = 'green'|'yellow'|'orange'`
  (`src/lib/diet/types.ts`).
- `useRecipe(id)` already fetches `*, recipe_ingredients(*, food:foods(*))` and returns
  `{ recipe, ingredients: (RecipeIngredientRow & { food: FoodRow|null })[] }`
  (`src/lib/db/recipes.ts`). `useRecipeSearch` returns `RecipeRow[]` ONLY — no ingredients.
- `useFoodLog(date)` embeds `food:foods(*), recipe:recipes(*)` but **not** ingredients
  (`src/lib/db/foodLog.ts`).
- `FoodRow` carries `fructose_level`, `fructans_level`, `calories`, `serving_grams`, `fiber_g`,
  `sodium_mg`, `dash_group`, etc. (`src/lib/db/types.ts`).
- `RecipeIngredientRow` carries `quantity` and `unit` (free-form: `"cup"`, `"large"`,
  `"oz slice"`, often `null`) — confirmed in `data/recipes.json`. **These units do NOT convert
  to the linked food's `serving_grams`.** This is the core data limitation behind Decision 4.
- `FodmapBadge` already maps safety -> label/color and never shows `not-verified` as green
  (`src/components/diet/FodmapBadge.tsx`). `NoomDot` renders a neutral dot for `null`
  (`src/components/diet/NoomDot.tsx`). `FoodItemRow` already accepts a precomputed `noom` plus
  `fructose`/`fructans` and renders both (`src/components/diet/FoodItemRow.tsx`).

---

## DECISION SUMMARY (the value of this plan)

**D1 — New pure function.** Add `recipeRollup(ingredients)` in
`src/lib/diet/recipeRollup.ts`. Input is the ingredient list with each linked food (or `null`).
Output is a typed verdict object (see Task 1 signature). Pure, no React, no DB.

**D2 — FODMAP aggregation (health-critical).** Implement the precedence **directly** in
`recipeRollup` (do NOT call `lowFodmapSafe` per ingredient and try to "max" the string results —
the `not-verified` vs `moderate` ordering would be wrong). Compute per-axis worst-case levels
first, then derive `safety` with explicit precedence where **`high` dominates `unknown`**:

1. Any KNOWN `high` on either axis -> `avoid`. (`high` dominates everything, even unknowns — a
   recipe with a known-high ingredient is unsafe regardless of other gaps.)
2. Else, any ingredient is `unknown` on either axis **OR** has no linked food (`food === null`)
   -> `not-verified`. (Cannot be "safe" with an unverifiable component.)
3. Else, any `moderate` on either axis -> `caution`.
4. Else (every linked ingredient is `low`/`low` and all are linked) -> `safe`.

**REQUIRED equivalence test:** for a recipe with exactly ONE linked ingredient whose food is
verified (no nulls), `recipeRollup(...).safety` MUST equal
`lowFodmapSafe(food.fructose_level, food.fructans_level)` for all 16 axis combinations. This
keeps the single-ingredient case provably consistent with the established function.

**Unlinked ingredients (`food === null`, e.g. water).** Excluded from nutrient sums but **count
as an unverifiable component -> drive `safety` to at most `not-verified`** (rule 2). Recommended
conservative default: **do NOT exempt water or any "nutrition-free" item.** Tradeoff: a recipe
that lists plain water as a `raw_text`-only ingredient will read "Not verified" even though water
is harmless. Rationale: the app cannot distinguish "intentionally nutrition-free and safe" from
"unmatched / data gap" — both arrive as `food === null`. In a health app, defaulting an unknown
component to "verified safe" is the exact failure mode CLAUDE.md forbids. The clean fix is a DATA
fix: seed a real `Water` food row (both axes `low`, 0 nutrients) and link it, which makes the
recipe legitimately `safe`. Expose `unlinkedCount` in the output so the UI can explain *why* a
recipe is not verified. (Open question O1 for the human.)

**D3 — NOOM color (averaged density).** Per CLAUDE.md "averaged caloric density." Compute each
usable ingredient's density = `food.calories / food.serving_grams` (only when both are present and
`serving_grams > 0` and `calories >= 0`); average those densities (simple mean of per-ingredient
densities); feed the average through the same thresholds as `noomColor`. If **no** ingredient is
usable -> `noomColor: null` (unknown dot, never guessed). Implementation reuses the thresholds:
call `noomColor(avgDensity, 1)` so the single source of truth in `noomColor.ts` stays canonical
(density already computed; passing grams=1 makes calories==density). Document this trick in a code
comment. (Note: averaging per-ingredient densities is NOT the same as total-calories /
total-grams; CLAUDE.md says "averaged caloric density," and a true weighted density is not
computable anyway because quantities don't convert to grams — see D4. Recommend the simple mean
and note the approximation. Open question O2.)

**D4 — Fiber / sodium ("summed") — DEFER feeding into daily totals (v1).** True per-serving
sums are **not computable** from current data: `recipe_ingredients.quantity`/`unit` (`"2 cup"`,
`"4 oz slice"`, `"3 large"`) do not convert to each food's `serving_grams`, and even a whole-recipe
sum would need quantity->grams conversion we don't have, divided by `recipes.servings`. Producing a
number here would be **wrong**, which a health app must avoid.

v1 approach:
- `recipeRollup` computes the **qualitative** verdict (FODMAP `safety` + per-axis worst case +
  NOOM color + completeness flags) **now**.
- **Keep recipe logging calories-only in daily DASH/fiber/sodium totals.** `toLoggedNutrients`
  stays as-is for recipes (calories from `cal_per_serving`; fiber/sodium/dash_group remain
  `null`). The existing doc comment in `foodLog.ts` already states this; update it to point at this
  plan and clarify it is now an *intentional* limitation, not a TODO blocked on missing roll-up.
- Optional, clearly-labeled informational extra (Task 6, low priority): a read-only "per whole
  recipe (not per serving)" naive sum of `food.fiber_g` / `food.sodium_mg` across **linked**
  ingredients, shown ONLY on a recipe-detail view, explicitly labeled "approximate, ignores
  quantities, not added to your daily totals." Do NOT surface this number in search rows or the
  daily log, and never feed it to `dashProgress`/`fiberProgress`.

Defer accurate roll-up to a future task that adds a quantity->grams unit-conversion layer (needs
researcher input on a unit/density table; see Risks). Flagged as O3.

**D5 — Query wiring.** Recommend **extending the existing embeds** so the verdict renders without
extra round-trips:
- `useRecipeSearch`: change select to
  `*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams))`.
  Return a richer shape `RecipeSearchResult = { recipe: RecipeRow; ingredients: RollupIngredient[] }`
  rather than `RecipeRow[]`. Limit stays 30. Payload: ~7 ingredients x 4 small fields x 30 rows is
  modest (a few KB) and avoids 30 follow-up `useRecipe` calls.
- `useFoodLog`: extend the recipe embed to
  `recipe:recipes(*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams)))`
  so logged recipe rows can render the verdict in `DailyLog`. A day's log is small, so payload is
  negligible.
- Define a slim shared type `RollupIngredient = { food_id: string|null; food: Pick<FoodRow,
  'fructose_level'|'fructans_level'|'calories'|'serving_grams'> | null }` so `recipeRollup`'s input
  is exactly this minimal shape (full `FoodRow` also satisfies it structurally — `useRecipe` keeps
  working). Place it next to `recipeRollup` or in `src/lib/db/types.ts`; coder picks, but keep ONE
  definition.

Rejected alternative: per-recipe `useRecipe` calls from each search row (N+1 queries, worse UX,
more code). The selective-field embed is cheaper and keeps one render path.

**D6 — UI.** Search recipe rows and logged recipe entries render the real `NoomDot` +
`FodmapBadge` from the roll-up; `not-verified` stays neutral (never green); disclaimer stays
visible. Files in Tasks 4 and 5.

---

## Health-safety aggregation — truth table

Let the recipe's linked ingredients yield a worst-case per-axis level, and let
`hasUnverifiable = (any ingredient food===null) OR (any axis === 'unknown')`.

Per-axis worst case uses severity order for ranking only:
`low (0) < moderate (1) < high (2)`, with `unknown` tracked **separately** (it does not rank above
`high`).

| Any known `high` (either axis) | `hasUnverifiable` | Any `moderate` (either axis) | -> `safety`     |
|--------------------------------|-------------------|------------------------------|-----------------|
| yes                            | (any)             | (any)                        | **avoid**       |
| no                             | yes               | (any)                        | **not-verified**|
| no                             | no                | yes                          | **caution**     |
| no                             | no                | no                           | **safe**        |

Edge cases nailed down by this table:
- Recipe = {spinach low/low} + {unmatched water food=null} -> no high, hasUnverifiable=yes ->
  **not-verified** (NOT safe). Correct per D2.
- Recipe = {onion fructans=high} + {water food=null} -> known high -> **avoid** (high dominates the
  unknown). Correct.
- Recipe = {oats low/low} + {tofu low/low}, all linked, none unknown -> **safe**.
- Recipe = {food fructose=moderate, fructans=low} only -> **caution**, and equals
  `lowFodmapSafe('moderate','low')`. Equivalence test must pass.
- Empty ingredient list (no rows at all) -> treat as **not-verified** (nothing to verify; never
  "safe"). State this explicitly in the function and test it.

---

## Tasks

### Task 1 — `recipeRollup()` pure function + tests
**Goal:** implement the verdict per D2/D3 and the truth table.
**Files:** create `src/lib/diet/recipeRollup.ts`, `src/lib/diet/recipeRollup.test.ts`; export from
`src/lib/diet/index.ts`.
**Signature (reuse existing types):**
```ts
import type { FodmapLevel, NoomColor } from './types'
import type { FodmapSafety } from './lowFodmapSafe'

export interface RollupFood {
  fructose_level: FodmapLevel
  fructans_level: FodmapLevel
  calories: number | null
  serving_grams: number | null
}
export interface RollupIngredient {
  food_id: string | null
  food: RollupFood | null   // null when ingredient is unlinked (raw_text only)
}
export interface RecipeRollup {
  fructoseLevel: FodmapLevel   // worst-case across linked ingredients ('unknown' if any unknown)
  fructansLevel: FodmapLevel   // worst-case across linked ingredients
  safety: FodmapSafety         // per the truth table
  noomColor: NoomColor | null  // averaged density; null when not computable
  linkedCount: number          // ingredients with a non-null food
  unlinkedCount: number        // ingredients with food === null
  usableForDensityCount: number// ingredients with calories>=0 && serving_grams>0
  isComplete: boolean          // unlinkedCount===0 && no axis unknown (i.e. fully verified)
}
export function recipeRollup(ingredients: RollupIngredient[]): RecipeRollup
```
**Logic notes:** compute worst-case per axis (track `unknown` separately from severity); derive
`safety` via the truth-table precedence (high dominates unknown); average per-ingredient densities
and run through `noomColor` thresholds (reuse `noomColor`); empty list -> `not-verified`,
`noomColor: null`, all counts 0. Full `FoodRow` is structurally assignable to `RollupFood`, so
`useRecipe`'s richer ingredients can be passed directly.
**Reuse:** `noomColor`, `FodmapLevel`, `NoomColor`, `FodmapSafety`.
**Acceptance (tests):**
- 16-combo equivalence: single linked verified ingredient -> `safety ===
  lowFodmapSafe(fructose,fructans)` for every (fructose x fructans) pair.
- High-dominates-unknown: {high/low} + {food:null} -> `avoid`.
- Unverifiable-not-safe: {low/low} + {food:null} -> `not-verified`, `unlinkedCount===1`,
  `isComplete===false`.
- All-low all-linked -> `safe`, `isComplete===true`.
- NOOM averaging: two ingredients with densities 0.5 and 2.0 -> avg 1.25 -> `yellow`; ingredients
  lacking grams are skipped; none usable -> `null`.
- Empty list -> `not-verified`, `noomColor: null`.

### Task 2 — Wire ingredients into recipe SEARCH (`useRecipeSearch`)
**Goal:** search results carry enough ingredient data to compute the verdict (D5).
**Files:** `src/lib/db/recipes.ts` (and `RollupIngredient` import).
**Change:** select
`*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams))`;
return `RecipeSearchResult[]` where `RecipeSearchResult = { recipe: RecipeRow; ingredients:
RollupIngredient[] }`. Keep `enabled`/limit/`likeContains` behavior. Update `queryKeys.recipeSearch`
usage unchanged (term key still valid).
**Reuse:** existing query plumbing; `RollupIngredient` from Task 1.
**Acceptance:** typecheck passes; a unit/integration smoke (or the e2e in Task 7) shows a known
recipe's `ingredients` array is populated with food axis fields; the embed returns the same recipe
set as before (limit 30, ilike name).

### Task 3 — Wire ingredients into LOGGED recipe entries (`useFoodLog`)
**Goal:** logged recipe rows can render the verdict (D5).
**Files:** `src/lib/db/foodLog.ts`.
**Change:** extend the recipe embed to
`recipe:recipes(*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams)))`;
update `FoodLogEntry`'s `recipe` type to `(RecipeRow & { recipe_ingredients: RollupIngredient[] }) |
null`. **Do NOT change `toLoggedNutrients` nutrient behavior** (recipes stay calories-only in totals
per D4) — only update its doc comment to mark the calories-only roll-up as an intentional v1 limit
referencing this plan and D4.
**Reuse:** existing hook; `RollupIngredient`.
**Acceptance:** typecheck passes; `useFoodLog` returns recipe entries with a populated
`recipe.recipe_ingredients`; `dashProgress`/`fiberProgress` totals are UNCHANGED for recipe entries
(a recipe still contributes only calories) — assert via existing/added unit test on
`toLoggedNutrients` for a recipe entry.

### Task 4 — Search UI: real verdict on recipe rows (`FoodSearch.tsx`)
**Goal:** recipe rows show computed `NoomDot` + `FodmapBadge` from `recipeRollup` (D6).
**Files:** `src/components/meals/FoodSearch.tsx`.
**Change:** consume the new `RecipeSearchResult[]`; for each, `const rollup =
recipeRollup(r.ingredients)`; pass `noom={rollup.noomColor}` and
`fructose={rollup.fructoseLevel}` / `fructans={rollup.fructansLevel}` to `FoodItemRow` (the badge
will render via existing `lowFodmapSafe` mapping — which agrees with `rollup.safety` for the
verified case; for mixed cases the badge derives from the worst-case axes, which matches the
truth table). When `unlinkedCount > 0`, append a subtitle hint like "· not verified: N unlinked
ingredient(s)" so the reason is visible. Remove the hard-coded `noom={null}` and the
"no badge" gap for recipes.
**Reuse:** `recipeRollup`, `FoodItemRow`, `NoomDot`, `FodmapBadge`.
**Acceptance:** typing a known low/low recipe shows a colored dot + "Safe"; a recipe containing a
high-fructan ingredient (e.g. onion/garlic) shows "Avoid"; a recipe with an unlinked ingredient
shows "Not verified" (neutral, never green) with the hint; nutrient chips still show.

### Task 5 — Daily log UI: verdict on logged recipe entries (`DailyLog.tsx`)
**Goal:** logged recipe entries render the verdict like foods do (D6).
**Files:** `src/components/meals/DailyLog.tsx`.
**Change:** when `entry.recipe` is present, compute `recipeRollup(entry.recipe.recipe_ingredients)`
and pass `noom`/`fructose`/`fructans` to `FoodItemRow` (currently recipes pass `noom=null` and no
badge). Keep `entryChips` as-is (calories-only for recipes per D4). Keep the "not verified, never
safe" rule.
**Reuse:** `recipeRollup`, `FoodItemRow`.
**Acceptance:** a logged recipe shows its computed dot + badge; an unverifiable recipe reads "Not
verified," never "Safe"; foods are unchanged.

### Task 6 (optional, low priority) — Read-only "per whole recipe (approx)" sums on recipe detail
**Goal:** informational only; never enters daily totals (D4).
**Files:** wherever a recipe-detail view exists or is added (check for one; if none, SKIP this task
in v1 rather than building a new page). If shown, compute naive `sum(food.fiber_g)` /
`sum(food.sodium_mg)` over LINKED ingredients only.
**Acceptance:** if implemented, the number is labeled "approximate · ignores quantities · not added
to your daily totals" and appears ONLY on recipe detail — not in search rows or the daily log.

### Task 7 — Tests
**Goal:** lock the new math and the render path.
**Files:** `src/lib/diet/recipeRollup.test.ts` (from Task 1 — primary, must be thorough); extend
`e2e/meals.spec.ts` (if present) with: search a known recipe -> assert its badge text; assert a
known-unverifiable recipe reads "Not verified," never "Safe."
**Acceptance:** `npm test` green incl. the 16-combo equivalence + truth-table edge cases; `npm run
typecheck` and `npm run lint` clean; e2e (with test creds) green or skipped without creds (matches
Phase 1 e2e strategy).

---

## Dependencies & order
1. **Task 1** (pure function + tests) — no deps; do first.
2. **Tasks 2 and 3** (query wiring) — depend on `RollupIngredient` type from Task 1; can run in
   parallel.
3. **Task 4** depends on Task 2; **Task 5** depends on Task 3.
4. **Task 6** optional, only if a recipe-detail view exists; otherwise defer.
5. **Task 7** unit tests land with Task 1; e2e after Tasks 4–5.

## Risks
- **Wrong fiber/sodium totals (highest risk) — mitigated by D4** (defer; keep calories-only). Do
  NOT let the coder "helpfully" sum ingredient fiber/sodium into daily totals; reviewer must reject
  any change feeding recipe fiber/sodium into `dashProgress`/`fiberProgress` without a real
  quantity->grams conversion layer.
- **High-dominates-unknown ordering.** Easy to get wrong if implemented by string-maxing
  `lowFodmapSafe` results. D2 mandates direct precedence + the 16-combo equivalence test. Reviewer
  to verify the precedence matches the truth table.
- **Unlinked/water default.** Conservative "not verified" may surprise the user on recipes with
  benign unlisted-nutrient items. Mitigation: `unlinkedCount` in output + subtitle hint; real fix
  is seeding a `Water` food. Confirm O1.
- **NOOM averaging method** (mean of densities vs weighted) is an approximation forced by missing
  gram quantities. Confirm O2.
- **Embed payload size** in `useRecipeSearch` (30 recipes x ingredients). Selective fields keep it
  small; acceptable. Watch if recipe count grows.

## Open questions for the human
- **O1:** Confirm the conservative default — an unlinked ingredient (incl. water) forces
  "Not verified," never "Safe." Alternative is seeding a real `Water`/known-nutrition-free food row
  and linking it (preferred clean fix). OK to proceed conservative for v1?
- **O2:** NOOM color = simple mean of per-ingredient caloric densities (CLAUDE.md "averaged caloric
  density"), since gram-weighted density isn't computable. Acceptable?
- **O3:** Accurate per-serving fiber/sodium roll-up is deferred to a future task that needs a
  quantity->grams unit-conversion table (likely a `researcher` task). Confirm deferral.

## Final verification checklist
- [ ] `recipeRollup` single-linked-ingredient equals `lowFodmapSafe` for all 16 axis combos.
- [ ] Known-high ingredient -> `avoid` even with unlinked components present.
- [ ] Any unlinked/unknown component -> `safety` never `safe` (>= `not-verified`).
- [ ] NOOM color from averaged density; `null` when no ingredient has calories+grams.
- [ ] Recipe rows in search AND daily log show real `NoomDot` + `FodmapBadge`; `not-verified`
      neutral, never green.
- [ ] Daily DASH/fiber/sodium totals UNCHANGED for recipe entries (calories-only).
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean; disclaimer still visible on meals.
