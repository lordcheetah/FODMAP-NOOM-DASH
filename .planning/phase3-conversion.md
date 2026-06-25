# Phase 3 — Unit→Grams Conversion Layer (recipe nutrient roll-up)

> The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> Scope reminder (CLAUDE.md): **"FODMAP" = fructose + fructans only.** NOOM color is **computed
> from caloric density.** `unknown` FODMAP **must never display as "safe."** This change is about
> **NUTRITION accuracy (DASH/fiber)**, NOT FODMAP safety. Keep the medical disclaimer visible.

## Problem

Logged recipes contribute **calories only** to daily totals. `toLoggedNutrients`
(`src/lib/db/foodLog.ts`) returns `dash_group/sodium_mg/sat_fat_g/potassium_mg/fiber_g = null` for
recipe entries (deliberate v1 limit per `.planning/recipe-rollup.md` Decision D4), and `recipeRollup`
(`src/lib/diet/recipeRollup.ts`) computes only worst-case FODMAP + averaged caloric density.

D4 deferred real fiber/sodium roll-up because `recipe_ingredients.quantity`/`unit` (`"2 cup"`,
`"4 oz slice"`, `"3 large"`, `"1 bay leaf"`) do not convert to each food's `serving_grams`. This
plan builds that **quantity→grams conversion layer** so a recipe's per-serving fiber, sodium,
saturated fat, potassium (and calories) feed `dashProgress`/`fiberProgress` — with ingredients that
cannot be converted marking the nutrient roll-up **INCOMPLETE / approximate**, never silently 0 and
never presented as exact.

## Dependency on the researcher

A `researcher` is concurrently writing **`.planning/phase3-conversion-research.md`**: a
`serving_desc` audit, standard weight/volume factor tables, the canonical `toGrams` algorithm, and a
per-ingredient convertibility coverage estimate. **This plan is the authority on shape, wiring, and
safety; the research doc is the authority on the numeric factor tables and the audited unit
vocabulary.** Where they conflict on a factor value or alias spelling, defer to research; where they
conflict on a return contract or "never show as exact" behavior, defer to this plan.

> **PRECONDITION (blocking):** Task 1 must not start until `.planning/phase3-conversion-research.md`
> exists with (a) the normalized unit list, (b) weight + volume factor tables, and (c) the toGrams
> algorithm. If it is missing or incomplete when the coder picks this up, STOP and request the
> researcher finish it — do not invent factor values.

## Ground truth (verified in code, 2026-06-25)

- `recipeRollup(ingredients: RollupIngredient[])` returns `{ fructoseLevel, fructansLevel, safety,
  noomColor, linkedCount, unlinkedCount, usableForDensityCount, isComplete }`. NOOM color is the
  **simple mean of per-ingredient densities** (`calories/serving_grams`) fed through `noomColor(avg, 1)`.
  (`src/lib/diet/recipeRollup.ts`)
- `RollupIngredient = { food_id: string|null; food: RollupFood|null }` and
  `RollupFood = { fructose_level, fructans_level, calories, serving_grams }`. **It does NOT carry
  `quantity` or `unit`** — those exist on `RecipeIngredientRow` but are dropped by every embed.
  This is the central wiring gap (see Task 4 / Risk R6).
- `toLoggedNutrients(entry)`: food branch returns the food's nutrients + dash_group; **recipe branch
  returns calories only** (everything else null). (`src/lib/db/foodLog.ts`)
- `LoggedNutrients` (consumed by both progress fns): per-serving `dash_group?/sodium_mg?/sat_fat_g?/
  potassium_mg?/fiber_g?/calories?` + `meal` + `servings`. The functions multiply each per-serving
  field by `servings` and treat null/non-finite as 0. **An entry with no `dash_group` still
  contributes sodium/satfat/potassium/fiber but adds to no serving bucket** — this is exactly the
  behavior we want for recipes. (`src/lib/diet/dashProgress.ts`, `fiberProgress.ts`)
- `dashProgress` multiplies nutrients by `e.servings`; `fiberProgress` multiplies `fiber_g` by
  `servings`. So `toLoggedNutrients` must return **per-(recipe-)serving** nutrients; the progress fns
  apply the logged servings multiplier. (Risk R5: do NOT also divide by servings twice.)
- `FoodRow` carries `serving_desc: string` (NOT NULL), `serving_grams: number|null`, and the
  nutrient columns. (`src/lib/db/types.ts`)
- `useFoodLog` embed:
  `recipe:recipes(*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams)))`.
  Lacks ingredient `quantity`/`unit` and the food's `serving_desc` + nutrient fields. (`foodLog.ts`)
- `useRecipeSearch` embed (search path):
  `recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams))`.
  `useRecipe` (detail path) embeds `recipe_ingredients(*, food:foods(*))` — already has quantity/unit
  + full food. (`src/lib/db/recipes.ts`)
- `RecipeRow.servings: number | null`. The log embed already pulls `recipes(*)`, so `entry.recipe.
  servings` is available at the `toLoggedNutrients` call site. Search has `recipe.servings` too.
- Recipe data unit landscape (`data/recipes.json`): weight (`oz slice`, `oz`), volume (`cup`, `tbsp`,
  `tsp`), count (`large`, `slice`), and `null` unit (e.g. `2 scallions`, `1 bay leaf`). Some are
  unconvertible-by-count (`bay leaf`, `freshly ground black pepper` with `quantity: null`).
- UI: `DaySummary.tsx` renders DASH + fiber from `entries.map(toLoggedNutrients)` and ALSO recomputes
  calories/NOOM directly from `e.food`/`e.recipe`. `DailyLog.tsx` and `FoodSearch.tsx` render recipe
  verdicts via `recipeRollup`. `Disclaimer` component already exists.

---

## DECISION SUMMARY (confirm the starred ones with the human)

**D1 — New pure module `src/lib/diet/convert.ts`** (name: `convert.ts`, not `units.ts` — "convert"
reads as the verb the callers use). Exports `parseServingDesc`, the unit vocabulary + alias map, the
weight + volume factor tables, and `toGrams`. Pure, no React/DB, heavily unit-tested. Exported from
`src/lib/diet/index.ts`.

**D2 — Separate `recipeNutrients` module, do NOT overload `recipeRollup`.** RECOMMENDED: add a new
sibling `src/lib/diet/recipeNutrients.ts` rather than extending `recipeRollup`. Rationale:
- `recipeRollup` is **health-safety (FODMAP)** code with an exhaustive, hard-won test suite
  (`recipeRollup.test.ts`, `recipeRollup.safety.test.ts`, the 16-combo equivalence). Nutrient
  accuracy is a **different concern** (DASH/fiber) with a different failure mode (wrong-but-not-
  unsafe). Mixing them risks regressing safety tests and entangles "never show unknown as safe"
  (FODMAP) with "never show approximate as exact" (nutrition).
- Keeps `recipeRollup`'s input shape (`RollupIngredient` with no quantity/unit) untouched, so its
  callers and tests don't move. `recipeNutrients` takes the richer shape that includes quantity/unit
  + food serving info.
- The two are composed at call sites (DailyLog, FoodSearch render rollup verdict; toLoggedNutrients +
  DaySummary use recipeNutrients).

**D3 — `recipeNutrients` returns per-serving summed nutrients + completeness.** Σ(ingredient
contributions) / `recipe.servings`, plus `{ convertedCount, unconvertibleCount, isComplete }`.
Servings divisor comes from the **recipe row** (`recipe.servings`); when it is null or ≤ 0, treat the
whole recipe as a single serving's worth is WRONG — instead return `null` nutrients +
`isComplete: false` (cannot attribute per-serving; see D7). Available at both call sites.

**\*D4 — noomColor: KEEP the existing averaged-density behavior in `recipeRollup` UNCHANGED for now.**
Even though grams now exist, do **not** switch `recipeRollup.noomColor` to gram-weighted in this
task. Reasons: (a) it would change existing `recipeRollup.test.ts` NOOM assertions (Risk R3); (b)
gram-weighting depends on the same convertibility that can be incomplete, so a partially-convertible
recipe would get a density mixing weighted + unweighted ingredients — messier than the current simple
mean. RECOMMENDATION: leave `recipeRollup.noomColor` as-is; OPTIONALLY expose a separate
`weightedNoomColor` field on `recipeNutrients` (computed as total-calories / total-grams over
**convertible** ingredients, `null` if not fully convertible or grams total ≤ 0) for future UI, but do
NOT wire it into existing displays in this task. **Confirm with human (Q2).**

**D5 — Wire into log math via `toLoggedNutrients` recipe branch.** Replace the calories-only recipe
return with `recipeNutrients(...)` per-serving values (calories/fiber/sodium/sat_fat/potassium),
still leaving `dash_group: null` (a recipe has no single DASH group — confirmed correct; it
contributes nutrients but no serving bucket, exactly as `dashProgress` already supports). The progress
fns then multiply by the logged `servings`. This requires the `useFoodLog` embed to include quantity/
unit + the food's `serving_desc` + nutrient fields (Task 4).

**D6 — Unconvertible ⇒ INCOMPLETE, contributes 0 for that ingredient but flags the roll-up.** Per
CLAUDE.md health rule: never present an approximate number as exact. An ingredient whose `toGrams`
is `null` (no unit match, count unit without a usable food serving, missing data) or whose food lacks
`serving_grams`/the nutrient is **counted in `unconvertibleCount`**, contributes nothing to the sum
(it is NOT a 0-value data point — it is unmeasured), and forces `isComplete: false`. Downstream UI
labels any recipe-derived total as **approximate / "partial (N of M ingredients measured)"**.

**\*D7 — Missing `serving_grams` or null `toGrams` or null/≤0 `recipe.servings` handling.**
- Ingredient with `toGrams === null` → unconvertible (counts to `unconvertibleCount`, no contribution).
- Ingredient convertible but `food.serving_grams` null/≤0 → cannot scale nutrients → unconvertible.
- Per-nutrient: if a converted ingredient has the grams but a specific nutrient is null on the food,
  that nutrient gets 0 from that ingredient **but the ingredient still counts as converted** (the food
  is measured; the nutrient is genuinely 0/absent in our data). Document this nuance; it differs from
  D6. (Open Q3 — alternatively treat a null nutrient as making *that nutrient's* total approximate.
  RECOMMENDATION: keep it simple — null nutrient = 0 contribution, ingredient still "converted"; the
  recipe-level `isComplete` already covers the gross gaps.)
- `recipe.servings` null or ≤ 0 → return all nutrients `null` + `isComplete: false` (cannot produce a
  per-serving number safely). **Confirm fallback with human (Q4).**

**D8 — Query wiring: extend `useFoodLog` embed only.** `toLoggedNutrients` is the only consumer that
needs nutrient sums. `useRecipeSearch` already lacks quantity/unit; the search row does NOT currently
show nutrient totals, so we only add nutrient display there if Task 6 chooses to (optional). To keep
this task focused, extend the **log** embed (Task 4); extend the **search** embed only if Task 6
surfaces nutrients in search.

---

## Unit vocabulary & signatures (Task 1 detail)

> Factor *values* and the final audited alias set come from
> `.planning/phase3-conversion-research.md`. The shape below is the contract; fill numbers from
> research. If research lists units beyond these, add them to `WeightUnit`/`VolumeUnit` accordingly.

```ts
// src/lib/diet/convert.ts

/** Canonical (normalized) unit keys. */
export type WeightUnit = 'g' | 'kg' | 'mg' | 'oz' | 'lb'
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'fl-oz' | 'pint' | 'quart' | 'gallon'
/** Count/serving-relative units (need the food's own serving to resolve). */
export type CountUnit = 'count' | 'slice' | 'serving'
export type NormalizedUnit = WeightUnit | VolumeUnit | CountUnit

/** Parsed serving description, e.g. "1 cup (240 g)" → { qty: 1, unit: 'cup' }. */
export interface ParsedServing { qty: number; unit: NormalizedUnit }

/** Alias map: free-form text → canonical unit. Populate from research's audit. */
// e.g. 'tablespoon','tablespoons','tbsp','tbsp.','T' → 'tbsp'; 'ounce','oz','oz.' → 'oz';
//      'large','small','medium','clove','leaf','bay leaf' → null (unconvertible count) OR 'count'
//      per research's coverage decision. Keep ONE source of truth here.
export const UNIT_ALIASES: Record<string, NormalizedUnit>

/** Grams per 1 unit, for direct weight conversion. From research. */
export const WEIGHT_GRAMS: Record<WeightUnit, number> // g:1, oz:28.3495, lb:453.592, ...

/** Milliliters per 1 unit, for volume → ml (then ml→g needs density; see toGrams). */
export const VOLUME_ML: Record<VolumeUnit, number>    // tsp:4.929, tbsp:14.787, cup:236.588, ...

/**
 * Parse a serving_desc string into a single qty+unit, or null when it can't be parsed
 * into a recognized unit. Handles a leading number incl. fractions ("1/2", "1 1/2", "0.5")
 * and a unit token; ignores a trailing parenthetical gram hint for parsing purposes
 * (the toGrams path prefers food.serving_grams as truth).
 */
export function parseServingDesc(serving_desc: string): ParsedServing | null

/**
 * Convert `quantity` of `unit` to grams using the food's own serving as the bridge.
 * Algorithm (per research):
 *  - WEIGHT unit: grams = quantity * WEIGHT_GRAMS[unit]. (direct; food not needed)
 *  - VOLUME unit: requires the food's serving_desc to also be volume → derive the food's
 *    grams-per-ml (food.serving_grams / VOLUME_ML[parsed food serving unit]); else, if the
 *    food serving is weight, volume can't be bridged → null. (No global density table; we use
 *    the FOOD's own serving as the density bridge.)
 *  - COUNT/serving-relative unit: requires the food's serving_desc to be the SAME count unit
 *    (or 'serving'); grams = quantity * food.serving_grams / food_serving_qty. If the food's
 *    serving is not a matching count → null.
 *  - Anything unresolved → null (UNCONVERTIBLE; never guess).
 * Returns grams (number) or null.
 */
export function toGrams(
  quantity: number,
  unit: NormalizedUnit,
  food: { serving_desc: string; serving_grams: number | null },
): number | null
```

`toGrams` returns `null` (not 0, not throw) for every unresolved case. `quantity` non-finite/≤0 → the
researcher decides (likely `null`); plan default: `quantity <= 0 || !Number.isFinite(quantity)` → null.

---

## Tasks

### Task 1 — Pure conversion module + tests `src/lib/diet/convert.ts`
**Goal:** `parseServingDesc`, unit vocabulary + alias map, weight/volume factor tables, and
`toGrams` exactly per the signatures above and the research factor tables.
**Files:** create `src/lib/diet/convert.ts`, `src/lib/diet/convert.test.ts`; export from
`src/lib/diet/index.ts`.
**Reuse:** research factor tables/algorithm; keep ONE alias map. No new deps.
**Precondition:** `.planning/phase3-conversion-research.md` present (see PRECONDITION above).
**Acceptance (tests — the matrix):**
- Weight direct: `toGrams(4, 'oz', anyFood)` ≈ 113.4 g (food irrelevant for weight).
- Volume, food serving same unit family: cup→cup, tbsp→cup, etc. resolve via food's ml bridge.
- Volume where food serving is weight-only → `null`.
- Count via matching food serving: `toGrams(3, 'count', {serving_desc:'1 large (50 g)'...})` → 150 g
  (or per the parsed food serving qty); count where food serving is volume/weight → `null`.
- Fractions in `parseServingDesc`: `"1/2 cup"`→{0.5,'cup'}; `"1 1/2 cups"`→{1.5,'cup'};
  `"0.5 tsp"`→{0.5,'tsp'}.
- Aliases normalize: `"tbsp."`,`"Tablespoons"`→'tbsp'; `"oz."`→'oz'.
- Unconvertible → `null`: unrecognized unit (`"bay leaf"`), `quantity: null`/≤0, missing serving.
- `parseServingDesc('not a serving')` → `null`.

### Task 2 — Per-ingredient nutrient scaling helper
**Goal:** `ingredientNutrients(ingredient, food)` scales a food's per-serving nutrients by
`grams / food.serving_grams`.
**Files:** add to `src/lib/diet/recipeNutrients.ts` (created in Task 3) or co-locate; export it.
**Signature:**
```ts
export interface IngredientNutrients {
  grams: number | null  // null = unconvertible
  calories?: number; fiber_g?: number; sodium_mg?: number
  sat_fat_g?: number; potassium_mg?: number
}
// `ingredient` carries quantity + normalized unit; `food` carries serving_grams + nutrient fields
export function ingredientNutrients(
  quantity: number | null,
  unit: string | null,        // raw unit text → normalized via UNIT_ALIASES inside
  food: NutrientFood | null,  // serving_desc, serving_grams, calories, fiber_g, sodium_mg, sat_fat_g, potassium_mg
): IngredientNutrients
```
**Logic:** normalize `unit` via alias map; `grams = toGrams(quantity, normUnit, food)`. If `grams ===
null` OR `food == null` OR `food.serving_grams` null/≤0 → return `{ grams: null }` (UNCONVERTIBLE,
D6/D7). Else `factor = grams / food.serving_grams`; each nutrient = `(food.nutrient ?? 0) * factor`
(null nutrient → 0 contribution but ingredient still converted, D7).
**Reuse:** `toGrams`, `UNIT_ALIASES` from Task 1; `num()`-style guarding mirrors dash/fiberProgress.
**Acceptance (tests):**
- Convertible ingredient scales linearly (double grams → double each nutrient).
- `grams: null` when `toGrams` null, when food null, when `serving_grams` null/≤0.
- Null specific nutrient → that nutrient 0, `grams` still a number (converted).

### Task 3 — `recipeNutrients` aggregate (new sibling module)
**Goal:** per-serving summed nutrients + completeness from a recipe's ingredients (D2/D3/D7).
**Files:** create `src/lib/diet/recipeNutrients.ts`, `src/lib/diet/recipeNutrients.test.ts`; export
from `index.ts`. Do **NOT** modify `recipeRollup.ts`.
**Signature:**
```ts
export interface NutrientIngredient {
  quantity: number | null
  unit: string | null
  food: NutrientFood | null  // serving_desc, serving_grams, calories, fiber_g, sodium_mg, sat_fat_g, potassium_mg
}
export interface RecipeNutrients {
  // per SERVING (whole-recipe Σ / servings); null when servings invalid (D7)
  calories: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
  convertedCount: number
  unconvertibleCount: number
  /** every ingredient converted AND servings valid */
  isComplete: boolean
}
export function recipeNutrients(
  ingredients: NutrientIngredient[],
  servings: number | null,
): RecipeNutrients
```
**Logic:** sum `ingredientNutrients(...)` across ingredients; tally converted/unconvertible. If
`servings` null/≤0/non-finite → all nutrient fields `null`, `isComplete: false` (D7/Q4). Else divide
each whole-recipe sum by `servings`. `isComplete = unconvertibleCount === 0 && ingredients.length > 0
&& servingsValid`. Empty ingredient list → all nutrients `null` (or 0?) + `isComplete: false` — choose
`null` (nothing measured), consistent with "never present approximate/empty as exact."
**Reuse:** `ingredientNutrients`.
**Acceptance (tests):**
- Fully convertible recipe: per-serving fiber = (Σ ingredient fiber) / servings, within tolerance.
- One unconvertible ingredient → `unconvertibleCount === 1`, `isComplete === false`, others still
  summed (it contributes nothing, not 0-as-data).
- `servings = null`/0 → all nutrient fields `null`, `isComplete false`.
- Hand-calc check: a known seed recipe's per-serving fiber matches a manual computation within ±0.5 g.

### Task 4 — Wire into the log math (`toLoggedNutrients` + `useFoodLog` embed)
**Goal:** a logged recipe entry returns rolled-up **per-serving** nutrients so it feeds
`dashProgress`/`fiberProgress` (D5).
**Files:** `src/lib/db/foodLog.ts` (and `LoggedRecipe`/`FoodLogEntry` types).
**Changes:**
1. Extend the recipe embed to include quantity/unit + the food's serving + nutrients:
   `recipe:recipes(*, recipe_ingredients(food_id, quantity, unit, food:foods(serving_desc,serving_grams,calories,fiber_g,sodium_mg,sat_fat_g,potassium_mg,fructose_level,fructans_level)))`.
   (Keep `fructose_level,fructans_level,calories,serving_grams` so `recipeRollup` still works in
   `DailyLog`.) Update `LoggedRecipe`'s `recipe_ingredients` element type to a shape carrying
   quantity/unit + the richer food (a `NutrientIngredient`-compatible + `RollupIngredient`-compatible
   superset). Keep `RollupIngredient` assignable so `DailyLog`'s `recipeRollup` call is unaffected.
2. In `toLoggedNutrients` recipe branch: call `recipeNutrients(entry.recipe.recipe_ingredients,
   entry.recipe.servings)`; return per-serving `calories/fiber_g/sodium_mg/sat_fat_g/potassium_mg`
   (fall back to `cal_per_serving` for calories ONLY if recipeNutrients calories is null — document
   this so a no-conversion recipe still shows calories like before). Keep `dash_group: null` (recipe
   has no single group — confirmed intended; nutrients still sum, no serving bucket). Do NOT multiply
   by servings here — `dash/fiberProgress` apply the logged `servings` (Risk R5).
3. Update the doc comment: recipes now contribute real per-serving fiber/sodium/satfat/potassium when
   convertible; calories fall back to `cal_per_serving`; supersede the D4 "calories-only" note,
   pointing at this plan.
**Reuse:** `recipeNutrients`; existing query plumbing.
**Acceptance (tests + typecheck):**
- Unit test on `toLoggedNutrients`: a recipe entry now returns non-null `fiber_g`/`sodium_mg` for a
  convertible recipe; an all-unconvertible recipe returns null nutrients (+ calories fallback) and
  does NOT inject 0s as data.
- `dashProgress`/`fiberProgress` over a day including the recipe reflect its per-serving nutrients ×
  logged servings (Risk R5: not divided twice).
- `DailyLog`'s `recipeRollup` still compiles and renders (RollupIngredient still assignable).

### Task 5 — UI: surface "approximate / partial (N of M measured)"
**Goal:** wherever recipe nutrients now contribute or show, mark them approximate so totals are never
read as exact (CLAUDE.md health rule).
**Files:** `src/components/meals/DaySummary.tsx` (totals), `src/components/meals/DailyLog.tsx`
(per-recipe chips, optional).
**Changes:**
- `DaySummary`: when ANY logged recipe entry has an incomplete nutrient roll-up
  (`recipeNutrients(...).isComplete === false`, or `unconvertibleCount > 0`, or null servings),
  show an unobtrusive note near the DASH/Fiber totals: e.g. "Includes recipe estimates — some recipe
  ingredients could not be measured, so fiber/sodium totals are approximate." Compute this from the
  same entries already mapped. Keep the existing `Disclaimer`.
- Optional (`DailyLog`): on a logged recipe row whose nutrient roll-up is partial, add a tiny
  "approx (N of M ingredients measured)" subtitle/badge. Keep the existing FODMAP "not verified"
  subtitle logic separate — these are two different gaps (safety vs measurement); do not conflate.
**Reuse:** `recipeNutrients`, `Disclaimer`.
**Acceptance:** a day containing a partially-convertible recipe shows the approximate note; a day with
only fully-convertible recipes/foods shows no spurious note; the note wording never implies exactness;
disclaimer still present. **Prominence: confirm with human (Q5)** — recommend a quiet inline note
(not a blocking banner).

### Task 6 (optional) — Recipe nutrients in search/detail
**Goal:** if desired, show per-serving recipe nutrients in `FoodSearch` rows / a recipe detail view,
with the same "approx" labeling. Requires extending `useRecipeSearch` embed to add quantity/unit +
food nutrient fields (mirror Task 4). Skip in v1 if no detail view exists and search nutrient chips
aren't wanted; FODMAP/NOOM verdict in search is unchanged regardless.
**Acceptance (if built):** search/detail recipe nutrient figures carry the approx label and never
read as exact; embed payload stays modest (selective fields, limit 30).

### Task 7 — Tests (consolidated gate)
**Goal:** lock the conversion math, the aggregate, the log path, and the no-double-divide invariant.
**Files:** `convert.test.ts`, `recipeNutrients.test.ts` (Tasks 1/3), a `toLoggedNutrients` recipe-path
test in `src/lib/db/` (or co-located), and an assertion that `recipeRollup` tests are UNCHANGED.
**Acceptance:** `npm test` green including: the full `toGrams`/`parseServingDesc` matrix; recipe
nutrient sum + completeness; `toLoggedNutrients` recipe path contributes fiber/sodium; a known
recipe's per-serving fiber within ±0.5 g of a hand calc; **all existing `recipeRollup.test.ts` /
`recipeRollup.safety.test.ts` pass unmodified**; `npm run typecheck` + `npm run lint` clean.

---

## Dependencies & execution order
1. **Researcher** finishes `.planning/phase3-conversion-research.md` (BLOCKING for Task 1).
2. **Task 1** (`convert.ts` + tests) — foundation; do first.
3. **Task 2** (`ingredientNutrients`) depends on Task 1.
4. **Task 3** (`recipeNutrients` + tests) depends on Task 2.
5. **Task 4** (log wiring) depends on Task 3.
6. **Task 5** (UI approx note) depends on Task 4. **Task 6** optional, after Task 3 (+ search embed).
7. **Task 7** runs continuously; unit tests land with Tasks 1/3, integration after Task 4.

## Risks
- **R1 — serving_desc parse coverage.** `parseServingDesc`/`toGrams` only convert what the audited
  vocabulary covers; volume↔weight bridging depends on the food's own serving being the same family.
  Mitigation: unconvertible → null → `unconvertibleCount` → "approximate" UI. Research's coverage
  estimate sets expectations; do not inflate coverage by guessing densities.
- **R2 — count-unit unconvertibility.** `large`/`slice`/`bay leaf`/`null` units only convert when the
  food's serving is a matching count/serving. Many will be unconvertible — that's acceptable and must
  surface as approximate, never as 0.
- **R3 — changing existing `recipeRollup` tests.** D2/D4 explicitly keep `recipeRollup` and its NOOM
  behavior untouched. Reviewer must reject any diff that edits `recipeRollup.ts` or its test files.
- **R4 — wrong nutrient totals (health-critical).** A convertible-but-mis-bridged volume could yield a
  bad gram figure. Mitigation: food's-own-serving bridge (no global density table), tolerance-bound
  hand-calc test, and the approximate label so nothing reads as exact.
- **R5 — double-divide by servings.** `recipeNutrients` divides whole-recipe sums by `recipe.servings`
  to get per-serving; `dash/fiberProgress` then multiply by the **logged** `servings`.
  `toLoggedNutrients` must NOT divide or multiply again. Test the end-to-end multiplier explicitly.
- **R6 — embed drift.** quantity/unit + food serving/nutrient fields must be ADDED to the `useFoodLog`
  embed (and `LoggedRecipe` type) or `recipeNutrients` silently sees `undefined` → all unconvertible.
  Verify the embed string and type together; add a test that a logged recipe's ingredients carry
  quantity/unit.
- **R7 — performance.** Per-render `recipeNutrients` over a day's small log is cheap; for search
  (Task 6) keep selective fields + limit 30. Negligible.

## Open questions for the human (confirm)
- **Q1 — Module split:** new `recipeNutrients.ts` separate from `recipeRollup.ts` (RECOMMENDED), vs
  extending `recipeRollup`. Confirm the split.
- **Q2 — gram-weighted NOOM:** leave `recipeRollup.noomColor` as the simple density mean (RECOMMENDED,
  no test churn) and only optionally expose a separate `weightedNoomColor`? Or switch the canonical
  recipe NOOM to gram-weighted now (changes existing tests)?
- **Q3 — null nutrient on a converted food:** treat as 0 contribution with ingredient still "converted"
  (RECOMMENDED, simple) vs marking that nutrient's total approximate?
- **Q4 — null/≤0 `recipe.servings`:** return null per-serving nutrients + isComplete false
  (RECOMMENDED) vs assume servings=1?
- **Q5 — approximate prominence:** quiet inline note in DaySummary near the affected totals
  (RECOMMENDED) vs a more prominent banner/per-row badge everywhere?

## Final verification checklist
- [ ] `.planning/phase3-conversion-research.md` consulted; factor tables sourced from it, not guessed.
- [ ] `toGrams`/`parseServingDesc` matrix green (weight, volume same/diff family, count via matching
      serving, fractions, aliases, unconvertible→null, missing serving_grams).
- [ ] `recipeNutrients` per-serving sum correct; unconvertible flagged, never injected as 0-data.
- [ ] `toLoggedNutrients` recipe path now contributes real per-serving fiber/sodium/satfat/potassium;
      calories fall back to `cal_per_serving`; `dash_group` stays null.
- [ ] No double divide/multiply by servings (end-to-end test).
- [ ] FODMAP worst-case roll-up + `recipeRollup` tests UNCHANGED.
- [ ] UI marks recipe-derived totals "approximate / partial (N of M measured)"; disclaimer visible.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean.
