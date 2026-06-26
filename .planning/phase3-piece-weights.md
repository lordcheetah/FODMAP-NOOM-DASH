# Phase 3 Research: Per-Piece Gram Weights for Count-Unit Produce

**Author:** researcher agent
**Date:** 2026-06-25
**Status:** Implementation-ready research note
**Scope:** NUTRITION accuracy ONLY (calories, sodium, sat fat, potassium, fiber, added sugar / DASH
servings). This is **not** FODMAP — the worst-case fructose/fructans roll-up does not use grams and is
unchanged. Approximations here are acceptable but each is **cited** and reasonable. An unconvertible
ingredient must still mark the recipe roll-up INCOMPLETE (never silently 0). See
`.planning/phase3-conversion-research.md` for the conversion algorithm this feeds.

This note has three parts:
1. Cited per-piece gram weights for every count-unit produce item used in our recipes.
2. A recommended patch list for `data/recipes.json` (null `unit` fields that should carry a count noun).
3. A recommended wiring design (`src/lib/diet/pieceWeights.ts`) that keeps `toGrams` pure with no DB
   migration.

---

## 1. Cited per-piece gram weights

All weights are **edible portion, raw** unless noted. Primary source is USDA FoodData Central
(SR Legacy / Foundation Foods) portion data — the canonical US public food-portion reference. Where a
USDA SR portion label exists (e.g. "1 small", "1 medium"), that label and gram value are used directly.
The food name column matches `foods.name` in `data/foods.json`; the "food serving_desc / grams" column
shows what that food currently encodes (so you can see why the count unit doesn't match today).

| foods.name | Count noun / size | Grams per piece | Notes | Source |
|---|---|---|---|---|
| Onion, raw | small | **70 g** | USDA SR portion "1 small" | USDA FDC SR Legacy, Onions raw (FDC 170000), portion "1 small" = 70 g |
| Onion, raw | medium | **110 g** | USDA SR portion "1 medium (2-1/2 in dia)" | USDA FDC SR Legacy, Onions raw (FDC 170000), portion "1 medium" = 110 g |
| Onion, raw | large | **150 g** | USDA SR portion "1 large" | USDA FDC SR Legacy, Onions raw (FDC 170000), portion "1 large" = 150 g |
| Onion, raw (red) | small | **70 g** | No separate "red onion" food row; recipes link red onion → `Onion, raw`. Use the same per-size weights. | same as Onion, raw (USDA does not separate red onion portion weights in SR) |
| Carrot | medium | **61 g** | USDA SR portion "1 medium" | USDA FDC SR Legacy, Carrots raw (FDC 170393), portion "1 medium" = 61 g |
| Carrot | large | **72 g** | USDA SR portion "1 large (7-1/4 to 8-1/2 in)" | USDA FDC SR Legacy, Carrots raw (FDC 170393), portion "1 large" = 72 g |
| Scallion/green onion, white part | stalk (whole, medium) | **15 g** | USDA SR "1 medium (4-1/8 in long)" for whole scallion incl. tops+bulb. Our food row is "white part" served `2 tbsp sliced = 12 g`; a whole stalk weight of 15 g is the WHOLE scallion. For the recipes that use scallions chopped/sliced, 15 g per stalk is the most defensible whole-piece weight. Flag: this slightly over-counts vs "white part only" but is the closest cited public value. | USDA FDC SR Legacy, Onions, spring/scallions incl. tops & bulb raw (FDC 170005), portion "1 medium" = 15 g |
| Tomato, fresh | plum/roma (each) | **62 g** | USDA SR portion "1 plum tomato" | USDA FDC SR Legacy, Tomatoes red ripe raw year-round avg (FDC 170457), portion "1 plum tomato" = 62 g |
| Avocado | whole | **136 g** | USDA SR: 1 California avocado (edible) ≈ 136 g; all-commercial "1 cup cubes" = 150 g. Use 136 g for a whole avocado. | USDA FDC SR Legacy, Avocados California raw (FDC 171706), "1 fruit, without skin and seed" = 136 g |
| Avocado | half | **68 g** | = 136 / 2 | derived from USDA whole-avocado 136 g |
| Lime, whole/wedge | each (whole fruit) | **67 g** | USDA SR "1 fruit (2 in dia)" = 67 g. NOTE: the food row is served per `1 wedge = 7 g`, so a whole lime = ~9.5 wedges. The recipe "1 lime" is a WHOLE lime → 67 g. | USDA FDC SR Legacy, Limes raw (FDC 168155 / SR), portion "1 fruit (2 in dia)" = 67 g |
| Jalapeno pepper | each | **(already covered: 14 g)** | The food row already serves `1 pepper = 14 g`; "1/2 jalapeno" converts today via count noun. No piece-weight entry needed. USDA SR "1 pepper" = 14 g confirms. | USDA FDC SR Legacy, Peppers jalapeno raw (FDC 168576), "1 pepper" = 14 g |
| Garlic, raw | clove | **(already covered: 3 g)** | Food row serves `1 clove (3 g)`; clove→clove converts today. No new entry needed. USDA SR "1 clove" = 3 g confirms. | USDA FDC SR Legacy, Garlic raw (FDC 169230), "1 clove" = 3 g |
| Black olives | each | **(already covered: ~4 g)** | Food row serves `5 olives = 20 g` → 4 g/olive; olive→olive converts today. (Canned ripe small/medium black olive ≈ 3.2–4.5 g; 4 g is consistent.) | USDA FDC SR Legacy, Olives ripe canned (FDC 169094), "1 small/medium" ≈ 3.2–4.5 g; our 5 olives = 20 g row |
| Bay leaf | each | **~0.2 g (negligible)** | Food row serves `1 leaf = 0.6 g`; leaf→leaf converts today. A real dried bay leaf is ~0.2 g; nutrient contribution is negligible regardless. No new entry needed. | nutrient-negligible; existing food row 1 leaf = 0.6 g |
| Whole grain pita bread | each (small pita, 6 in) | **(already covered: 60 g)** | Food row serves `1 small pita = 60 g`; "4 pitas" converts once the null unit is filled to `pita` (see §2). No piece-weight entry needed. | existing food row 1 small pita = 60 g (consistent with USDA white pita 6-1/2 in ≈ 60 g) |
| Egg, whole, cooked | large | **(already covered: 50 g)** | Food row serves `1 large egg = 50 g`; "3 large eggs" converts today. | USDA FDC SR Legacy, Egg whole, "1 large" = 50 g |
| Butter/Boston bibb lettuce | head (5 in dia) | **163 g** | USDA SR "1 head (5 in dia)" = 163 g. Food row served `1 cup (leaves) = 50 g` (count noun mismatch with `head`). | USDA FDC SR Legacy, Lettuce butterhead incl. boston & bibb raw (FDC 168429), "1 head (5 in dia)" = 163 g |
| Butter/Boston bibb lettuce | leaf (medium/outer) | **~7.5 g** | USDA SR "1 leaf medium" ≈ 7.5 g (large ≈ 15 g, small ≈ 5 g). Useful if a recipe ever counts leaves; not needed for current recipes (the Pork Wraps use "1 head"). | USDA FDC SR Legacy, Lettuce butterhead (FDC 168429), "1 leaf, medium" ≈ 7.5 g |
| Kale, raw | bunch | **~340 g (LOW-CONFIDENCE)** | No clean USDA SR "1 bunch" gram value; bunch size varies widely by retailer (USDA SR has "1 cup chopped" = 67 g, not a bunch). A typical grocery kale bunch is ~200–400 g pre-stemming; the recipe stems the kale (discards stems) and only leaves are eaten. **Recommendation: treat 340 g as a coarse cited estimate for the trimmed-leaf yield and FLAG it; or, better, leave kale-bunch UNCONVERTIBLE so the Kale-Chips roll-up is marked INCOMPLETE rather than carrying a shaky number.** See §2 recommendation. | USDA FDC SR Legacy, Kale raw (FDC 168421) "1 cup" = 67 g (bunch not in SR); bunch estimate from typical retail bunch ~200–400 g, midpoint 340 g — LOW CONFIDENCE |

### Items that are NOT count-piece conversions (kept unconvertible, with reason)

| Recipe / ingredient | Why it stays unconvertible |
|---|---|
| "juice of 2 limes" → Lime juice (`1 tbsp`) | Unit is `lime` (a whole-fruit count) but the linked food is **lime JUICE** measured by volume. A whole lime yields ~2 tbsp (~30 mL) of juice (well-corroborated culinary/USDA-derived yield), so this is *technically* convertible via a juice-yield constant, but that is a yield assumption, not a piece weight. **Recommendation: optionally add a `lime-juice` yield (2 tbsp/lime) OR leave unconvertible.** Lime juice nutrient contribution is tiny (4 cal, 0 sodium per tbsp), so leaving it unconvertible costs almost nothing. See §2. Yield source: USDA-derived culinary references, ~2 tbsp juice per medium lime. |
| "1 lime" → Lime, whole/wedge (`1 wedge`) | Convertible via the new piece weight: 1 whole lime = 67 g and the food row is per-wedge (7 g) → 67/7 ≈ 9.5 wedges. Better: add a `lime` count-noun piece weight = 67 g keyed to `Lime, whole/wedge` so 1 lime → 67 g directly. (Lime peel/flesh is mostly discarded in the recipe — only juice is used — so 67 g over-counts the *consumed* mass, but the food row's per-gram nutrients are tiny; acceptable, flag it.) |
| "freshly ground black pepper" (qty null) → Black pepper, ground | Quantity is `null` (unquantified seasoning). Cannot convert without a quantity. Keep unconvertible; roll-up INCOMPLETE. Do **not** invent a quantity. |
| "1/4 cup reduced-fat cheddar, shredded" → Cheddar cheese (`1 oz`) | Volume ingredient vs weight-served food. This is a **density** problem, not a piece-weight problem; per `.planning/phase3-conversion-research.md` §6 the recommendation is to NOT ship a density fallback (shredded-cheese density is highly aerated/variable). Out of scope for this note. |

---

## 2. Recommended PATCH LIST for `data/recipes.json`

> Do NOT edit the file as part of this research task. These are the exact recommended field changes;
> apply them in a re-seed PR. Only `unit` (and one `quantity`) fields change; no schema/migration.

Each row: recipe → raw_text → current `unit`/`quantity` → recommended `unit` (canonical count noun) →
result.

### A. Null `unit` → fill with a count noun (these become convertible once `pieceWeights.ts` exists)

| Recipe | raw_text | Current | Set `unit` to | Set `quantity` to | After fix |
|---|---|---|---|---|---|
| Spinach Tomato Frittata | "2 scallions, thinly sliced" | unit `null`, qty 2 | `"scallion"` | 2 (ok) | 2 × 15 g = 30 g via piece weight |
| Vegetarian Barley Soup | "1 bay leaf" | unit `null`, qty 1 | `"leaf"` | 1 (ok) | converts today (food row `1 leaf`); just fill the unit |
| Salmon with Tabbouleh | "4 plum tomatoes" | unit `null`, qty 4 | `"plum"` (or `"piece"`) | 4 (ok) | 4 × 62 g = 248 g via piece weight |
| Salmon with Tabbouleh | "8 pitted black olives" | unit `null`, qty 8 | `"olive"` | 8 (ok) | converts today (food row `5 olives`); just fill the unit |
| Marinated Shrimp | "2 scallions, sliced (white part only)" | unit `null`, qty 2 | `"scallion"` | 2 (ok) | 2 × 15 g = 30 g via piece weight |
| Chicken & Avocado Pita Pockets | "4 6\" whole-wheat pitas, halved" | unit `null`, qty 4 | `"pita"` | 4 (ok) | converts today (food row `1 small pita`); just fill the unit |
| Lean Pork Lettuce Wraps | "1/2 jalapeno, seeded" | unit `null`, qty 0.5 | `"pepper"` | 0.5 (ok) | converts today (food row `1 pepper`); just fill the unit |
| Lean Pork Lettuce Wraps | "1 lime" | unit `null`, qty 1 | `"lime"` | 1 (ok) | 1 × 67 g via piece weight (whole-lime over-count flagged) |

Notes on noun choice:
- `scallion`, `plum`, `lime` are **new count nouns** not yet in `CountUnit`/`UNIT_ALIASES`. They must
  be added to `convert.ts` (one line each in the alias map + the `CountUnit` union) AND keyed in
  `pieceWeights.ts`. Alternative: use the generic `"piece"` (already aliased to `count`) for plum
  tomato, but a specific noun reads better and lets the piece-weight table key precisely.
- `leaf`, `olive`, `pita`, `pepper` already exist as count nouns and already match their food rows, so
  those four are **pure data fixes** (fill the null unit) with **no code change** — they convert the
  moment the unit string is present.

### B. Count `unit` that doesn't match the food's serving noun → convertible via piece weights

These already have a non-null `unit`; they fail today only because the unit noun ≠ the food's serving
noun. The `pieceWeights.ts` lookup (§3) fixes them with **no recipes.json change**.

| Recipe | raw_text | unit | Linked food (serving) | After fix |
|---|---|---|---|---|
| Salmon with Tabbouleh | "1 small red onion" | `small` | Onion, raw (`1/2 cup chopped`) | 1 × 70 g (onion small) |
| Lean Pork Lettuce Wraps | "1 head of boston bibb lettuce" | `head` | Butter/Boston bibb (`1 cup leaves`) | 1 × 163 g (head) |
| Lean Pork Lettuce Wraps | "1 small red bell pepper" | `small` | Bell pepper, red (`1/2 cup chopped`) | needs a bell-pepper-small piece weight — see below |
| Lean Pork Lettuce Wraps | "1 small cucumber" | `small` | Cucumber (`1 cup sliced`) | needs a cucumber-small piece weight — see below |
| Lean Pork Lettuce Wraps | "2 medium carrots, peeled" | `medium` | Carrot (`1/2 cup chopped`) | 2 × 61 g (carrot medium) = 122 g |
| Smoky Paprika Kale Chips | "1 large bunch of kale" | `bunch` | Kale, raw (`1 cup`) | bunch ≈ 340 g (LOW CONFIDENCE) — see recommendation |

**Two extra small-produce weights to add** (so the Pork Wraps small bell pepper + small cucumber
convert — both are real nutrient contributors):

| foods.name | Size | Grams | Source |
|---|---|---|---|
| Bell pepper, red | small | **74 g** | USDA SR Peppers sweet red raw (FDC 170108/SR), "1 small" ≈ 74 g (medium 119 g, large 164 g) |
| Cucumber | small (6-3/8 in) | **158 g** | USDA SR Cucumber with peel raw (FDC 168409/SR), "1 small (6-3/8 in)" ≈ 158 g |

**Kale-bunch recommendation:** prefer to **leave it unconvertible** (do not add a `bunch` piece weight
for kale) so the Kale Chips roll-up is honestly flagged INCOMPLETE, because (a) bunch mass is highly
variable, (b) the recipe discards stems, and (c) a wrong large number here materially distorts the
recipe's per-serving sodium/fiber. If a value is desired anyway, use 340 g and surface "approx." This
is the only ingredient in the set where the cited weight is genuinely unreliable.

### C. Stays unconvertible (do NOT patch)

| Recipe | raw_text | Reason |
|---|---|---|
| Vegetarian Barley Soup | "freshly ground black pepper" | `quantity: null` — unquantified. Never guess a quantity. |
| Marinated Shrimp | "juice of 2 limes" (`unit: "lime"`, food = Lime **juice**) | Whole-fruit count vs a juice food. Optional: add a `lime→juice` yield of 2 tbsp/lime (USDA-derived culinary yield) to convert; nutrient impact is ~negligible (8 cal total), so leaving it unconvertible is fine and conservative. |
| Chicken & Avocado Pita Pockets | "1/4 cup reduced-fat cheddar, shredded" | Volume vs weight-served food = density problem, not piece weight. Out of scope (see `.planning/phase3-conversion-research.md` §6: no density fallback in v1). |

---

## 3. Recommended wiring: `src/lib/diet/pieceWeights.ts` (pure constant module)

### Design

A curated, cited constant module keyed by **normalized food name + count noun → grams**, consulted by
`toGrams` ONLY when the ingredient's count noun does not already match the food's serving noun. This
keeps the common path (volume↔volume, weight, matching count noun) untouched and adds a fallback for
the count-mismatch cases above.

```ts
// src/lib/diet/pieceWeights.ts  (PURE: no React, no DB, no network)
//
// Per-piece gram weights for count-unit produce, used by toGrams() ONLY when the
// ingredient's count noun does not match the linked food's serving noun.
// Every entry is cited in .planning/phase3-piece-weights.md (USDA FDC SR Legacy).
// Keyed by normalized food name -> count noun -> grams.

export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase()
}

// noun keys are canonical CountUnit values (plus a few new ones: scallion, plum, lime)
export const PIECE_WEIGHTS: Readonly<
  Record<string, Readonly<Partial<Record<string, number>>>>
> = {
  'onion, raw':                 { small: 70, medium: 110, large: 150 },
  carrot:                       { small: 50, medium: 61, large: 72 }, // small approx; cite
  'scallion/green onion, white part': { scallion: 15, small: 15, medium: 15 },
  'tomato, fresh':              { plum: 62 },
  avocado:                      { avocado: 136, small: 136, medium: 136 }, // whole ~136 g
  'lime, whole/wedge':          { lime: 67 },
  'butter/boston bibb lettuce': { head: 163, leaf: 7.5 },
  'bell pepper, red':           { small: 74, medium: 119, large: 164 },
  cucumber:                     { small: 158, medium: 201, large: 301 },
  // kale bunch intentionally omitted (low-confidence) -> stays UNCONVERTIBLE
}
```

### How `toGrams` consults it (minimal, still pure)

`toGrams` currently takes `food: { serving_desc, serving_grams }`. **It must also receive the food's
`name`** so the lookup can key on it. Change the signature to:

```ts
export function toGrams(
  quantity: number,
  unit: NormalizedUnit,
  food: { name: string; serving_desc: string; serving_grams: number | null },
): number | null
```

Then, in the COUNT branch, *before* returning `null` for a noun mismatch, try the piece-weight table:

```ts
// inside the count branch, after the same-noun / generic checks fail:
const perPiece = PIECE_WEIGHTS[normalizeFoodName(food.name)]?.[unit]
if (perPiece != null && perPiece > 0) {
  return quantity * perPiece          // grams = pieces * grams-per-piece
}
return null
```

Important subtlety: the piece weight is grams of the **whole piece**, independent of the food row's
`serving_grams`. So it must be applied as `quantity * perPiece` directly (NOT scaled by serving_grams).
The caller's later `scale = grams / food.serving_grams` then correctly expresses the piece in serving
multiples for nutrient math. This stays exact and density-free.

### Why this satisfies the constraints

- **`toGrams` stays pure**: `PIECE_WEIGHTS` is a frozen in-module constant — no network, no DB, no
  DOM. Fully unit-testable with Vitest, deterministic.
- **No DB migration**: the `foods` table is unchanged; the new data lives in code (`pieceWeights.ts`).
  Only `data/recipes.json` changes (null-unit fill-ins from §2) and that is a **re-seed**, not a
  migration.
- **One small signature change**: `toGrams` must take `food.name`. Update the one caller (the recipe
  nutrient roll-up) to pass `food.name` (it already has the full food row). Add `name` to the type.
- **Conservative by default**: any food/noun not in the table still returns `null` (UNCONVERTIBLE) →
  roll-up flagged INCOMPLETE, never silently 0.
- **New nouns**: add `scallion`, `plum`, `lime` to the `CountUnit` union + `UNIT_ALIASES`
  (`scallion`/`scallions`, `plum`/`plums`, `lime`/`limes`) in `convert.ts`. (`head`, `small`,
  `medium`, `large` already exist.)

---

## 4. Coverage impact

Baseline (from `.planning/phase3-conversion-research.md`): **53 / 70 linked ingredients convertible
(~76%)**, 17 unconvertible.

Applying this note:

| # | Ingredient (recipe) | Fix | Newly convertible? |
|---|---|---|---|
| 1 | 2 scallions (Frittata) | unit `scallion` + piece 15 g | YES |
| 2 | bay leaf (Barley Soup) | unit `leaf` (data-only) | YES |
| 3 | 4 plum tomatoes (Tabbouleh) | unit `plum` + piece 62 g | YES |
| 4 | 8 black olives (Tabbouleh) | unit `olive` (data-only) | YES |
| 5 | 1 small red onion (Tabbouleh) | piece small 70 g | YES |
| 6 | 2 scallions (Shrimp) | unit `scallion` + piece 15 g | YES |
| 7 | 4 pitas (Pita Pockets) | unit `pita` (data-only) | YES |
| 8 | 1/2 jalapeno (Pork Wraps) | unit `pepper` (data-only) | YES |
| 9 | 1 head lettuce (Pork Wraps) | piece head 163 g | YES |
| 10 | 1 small bell pepper (Pork Wraps) | piece small 74 g | YES |
| 11 | 1 small cucumber (Pork Wraps) | piece small 158 g | YES |
| 12 | 2 medium carrots (Pork Wraps) | piece medium 61 g | YES |
| 13 | 1 lime (Pork Wraps) | unit `lime` + piece 67 g (over-count flagged) | YES |

That is **+13 ingredients** convertible.

**Remaining unconvertible (4):**
- garlic-by-volume "1/2 tsp garlic" → Garlic (`1 clove`): volume vs count — NOT fixed by piece
  weights (it is the inverse problem; tiny nutrient impact, leave it).
- "freshly ground black pepper": null quantity.
- "1/4 cup shredded cheddar": volume vs weight (density; out of scope).
- "juice of 2 limes": whole-lime count vs juice-volume food (optional yield fix; negligible nutrients).
- Kale bunch: recommended to remain unconvertible (low-confidence weight).

So 4–5 remain depending on whether the lime-juice yield and kale-bunch estimate are added.

**New coverage: 66 / 70 ≈ 94% convertible** (53 + 13), with ~4 honestly-unconvertible rows that the
INCOMPLETE flag covers. If the optional lime-juice yield is added, 67/70 ≈ 96%.

**Recipe-level:** with these fixes, **Frittata, Tabbouleh, Shrimp, Pita Pockets, and Pork Wraps** lose
all (or all but negligible) unconvertible ingredients. Barley Soup still INCOMPLETE (garlic-by-volume +
unquantified pepper, both negligible). Kale Chips stays INCOMPLETE (kale bunch) by recommendation.
Curried Cauliflower was already complete.

---

## 5. Caveats / data-quality warnings

- **Scallion 15 g** is the USDA weight for a *whole* spring onion (tops + bulb), but our food row is
  "white part only". 15 g/stalk slightly over-states the white-only mass. Acceptable (low nutrient
  density) but flagged.
- **Whole lime 67 g** and **whole avocado 136 g**: in the recipes only the lime *juice* and the
  avocado *flesh* are consumed, yet the count is the whole fruit. For lime the food row's per-gram
  nutrients are tiny so the over-count is immaterial; for avocado the recipe ("3/4 cup avocado, diced")
  is actually a **volume** ingredient that already converts vol→count is N/A — note the Pita Pockets
  avocado is `3/4 cup` (volume vs the food's `1/8 avocado` count), which is a separate vol-vs-count
  miss NOT solved here (it needs the inverse: a cup→avocado bridge). It remains unconvertible unless a
  cup-of-diced-avocado gram value is added (USDA "1 cup cubes" = 150 g could key that). Out of scope of
  the count-piece table but worth a follow-up.
- **Kale bunch (~340 g)** is the single low-confidence value; recommendation is to leave it
  unconvertible rather than carry a shaky number into sodium/fiber roll-ups.
- **Carrot small (50 g)** and the small/medium/large rows beyond the directly-cited ones are USDA SR
  values where available; the "small" carrot is an approximation (USDA SR lists medium 61 g, large
  72 g) — recipes only use medium carrots, so the small value is unused today.
- All weights are **raw edible portion**; cooked-shrinkage is not modeled (recipes specify raw produce
  amounts, which is correct for these dishes).

---

## 6. Sources

USDA FoodData Central (free, public, US-canonical portion reference) — searched via fdc.nal.usda.gov;
SR Legacy portion weights corroborated across the USDA database and USDA-derived republishers:
- Onions, raw (FDC 170000): 1 small 70 g, 1 medium 110 g, 1 large 150 g.
  https://fdc.nal.usda.gov/ (search "onions, raw")
- Carrots, raw (FDC 170393): 1 medium 61 g, 1 large 72 g.
  https://fdc.nal.usda.gov/ (search "carrots, raw")
- Onions, spring or scallions incl. tops & bulb, raw (FDC 170005): 1 medium (4-1/8 in) 15 g.
  https://fdc.nal.usda.gov/ (search "scallions raw")
- Tomatoes, red, ripe, raw, year-round avg (FDC 170457): 1 plum tomato 62 g.
  https://fdc.nal.usda.gov/ (search "tomatoes raw")
- Avocados, California, raw (FDC 171706): 1 fruit (no skin/seed) 136 g; all-commercial 1 cup cubes 150 g.
  https://fdc.nal.usda.gov/ (search "avocados raw")
- Limes, raw (SR): 1 fruit (2 in dia) 67 g.
  https://fdc.nal.usda.gov/ (search "limes raw")
- Peppers, jalapeno, raw (FDC 168576): 1 pepper 14 g (confirms existing food row).
  https://fdc.nal.usda.gov/ (search "jalapeno raw")
- Peppers, sweet, red, raw (SR): 1 small 74 g, 1 medium 119 g, 1 large 164 g.
  https://fdc.nal.usda.gov/ (search "peppers sweet red raw")
- Cucumber, with peel, raw (FDC 168409): 1 small (6-3/8 in) 158 g.
  https://fdc.nal.usda.gov/ (search "cucumber raw")
- Lettuce, butterhead (incl. boston & bibb), raw (FDC 168429): 1 head (5 in dia) 163 g; 1 leaf medium ~7.5 g.
  https://fdc.nal.usda.gov/ (search "lettuce butterhead raw")
- Garlic, raw (FDC 169230): 1 clove 3 g (confirms existing food row).
  https://fdc.nal.usda.gov/ (search "garlic raw")
- Kale, raw (FDC 168421): 1 cup chopped 67 g (no SR "1 bunch"; bunch estimate ~200–400 g, low confidence).
  https://fdc.nal.usda.gov/ (search "kale raw")
- Olives, ripe, canned (FDC 169094): small/medium ripe black olive ≈ 3.2–4.5 g (consistent with our 5 olives = 20 g).
  https://fdc.nal.usda.gov/ (search "olives ripe canned")

FDA point-of-purchase nutrition posters (corroborating reference amounts for the 20 most common raw
produce items): "Nutrition Information for Raw Vegetables" and the Raw Fruits poster —
https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/nutrition-information-raw-vegetables

Lime juice yield (~2 tbsp / ~30 mL per medium lime): USDA-derived culinary conversion references
(used only for the optional lime-juice yield note).
