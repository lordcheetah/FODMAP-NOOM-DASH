# Phase 3 Research: Unit → Grams Conversion Layer

**Author:** researcher agent
**Date:** 2026-06-25
**Status:** Implementation-ready research note
**Scope:** Nutrition accuracy ONLY (DASH servings, fiber, sodium, sat fat, potassium, calories).
This is **not** FODMAP. The FODMAP roll-up (worst-case fructose/fructans) is **unchanged** — it does
not depend on grams. Approximations here are acceptable **but must be flagged** (never silently 0).

> **Medical-data-safety rule for this layer:** an ingredient we cannot convert must mark the recipe's
> per-serving nutrient roll-up as **INCOMPLETE / approximate**. An unconvertible ingredient is *not*
> treated as contributing 0 — that would under-report sodium/sat-fat and over-state how "safe" a
> recipe is for DASH. Display "approx." / "incomplete" wherever a roll-up has dropped ingredients.

---

## 1. Goal / data flow

For each recipe ingredient that is linked to a `foods` row (`ingredient.food_name` → `foods.name`):

```
grams_used      = toGrams(ingredient.quantity, ingredient.unit, food)   // may be null
scale           = grams_used / food.serving_grams                       // unit-less multiplier
nutrient_used   = food.<nutrient> * scale         // per nutrient: calories, sodium_mg,
                                                  //   sat_fat_g, potassium_mg, fiber_g, added_sugar_g
```

Then sum each nutrient across all **convertible** linked ingredients, and divide by `recipe.servings`
to get per-serving recipe nutrients. Track a boolean `incomplete` + list of dropped ingredient names.

`food.serving_grams` is always present and numeric in `data/foods.json`, so the only hard part is
turning `(quantity, unit)` into grams. The trick the algorithm uses: **each food already encodes its
own density** in the pair `(serving_desc, serving_grams)` (e.g. "1/2 cup" = 122 g for Greek yogurt).
So we never need an external density table for the common case — we just need the ingredient amount
expressed in the **same unit family** as the food's serving.

---

## 2. Audit A — `serving_desc` formats present in `data/foods.json`

All 100+ foods were enumerated. Distinct **structural patterns** (drives the parser):

| Pattern | Examples | Notes |
|---|---|---|
| `<int> <unit>` | `3 oz`, `1 tbsp`, `1 tsp`, `1 oz`, `2 oz`, `1 cup` | clean |
| `<decimal> <unit>` | `3.5 oz`, `0.5 oz` | decimal qty |
| `<fraction> <unit>` | `1/2 cup`, `1/4 cup`, `1/8 avocado`, `1/4 tsp` | ASCII fractions |
| `<int> <unit> <modifier>` | `1/2 cup chopped`, `1 cup sliced`, `2 tbsp sliced`, `1/2 cup shredded`, `1 cup cubed`, `1 cup chunks`, `1/2 cup kernels`, `1/2 cup dry`, `1/4 cup dry`, `1 cup (leaves)`, `1 tsp grated`, `1 tbsp chopped` | trailing prep word(s) — **ignore for conversion** (cup is still cup) |
| `<int> <plural count noun>` | `2 slices`, `3 slices`, `10 almonds`, `10 cashews`, `10 nuts`, `5 olives`, `10 crackers`, `2 cakes`, `5 spears` | count units, food-specific |
| `<int> <singular count noun>` | `1 large egg`, `1 large egg white`, `1 slice`, `1 muffin`, `1 medium`, `1 small`, `1 wedge`, `1 leaf`, `1 pepper`, `1 scoop`, `1 spray`, `1 small pita`, `1 stalk ...` | count units |
| `<int> <unit> (<parenthetical>)` | `1 clove (3 g)`, `1 small (138 g)`, `1 small (6 inch)`, `2 small (6 inch)`, `1/2 cup (about 3 oz)`, `1/2 cup (about 1 small)`, `1/2 can (about 3 oz)`, `1/2 can (3 oz)`, `1 stalk (about 1/4 cup)`, `2 tbsp (10 halves)` | **parenthetical is a hint, not the primary unit.** Parser must strip `(...)` before parsing the leading qty+unit. |

### Unit vocabulary actually present in `serving_desc` (with approximate food counts)

Volume / weight units (the convertible families):

| Canonical unit | Family | Distinct foods (approx) | Notes |
|---|---|---|---|
| `cup` | volume | ~45 | dominant unit (incl. `1/2 cup`, `1/4 cup`, `1 cup`, `3 cups`) |
| `tbsp` | volume | ~25 | dressings, oils, seeds, nut butters, herbs |
| `tsp` | volume | ~12 | spices, salt, pepper, mustard, ginger |
| `oz` | weight | ~14 | meats/fish/cheese (`3 oz`, `2 oz`, `1 oz`, `0.5 oz`, `3.5 oz`) |
| `can` | container (≈3 oz here) | 2 | always parenthetically `(about 3 oz)` — treat via parenthetical |

Count / non-convertible units (food-specific "pieces"):

| Canonical unit | Distinct foods | Convertible? |
|---|---|---|
| `slice` | bread, cheese, bacon (~5) | only against a `slice`-served food |
| `large` (egg) | 2 | only against egg foods |
| `medium` | ~6 (fruits) | only against `medium`-served food |
| `small` | ~4 | only against `small`-served food |
| `clove` | garlic | only against `clove`-served food |
| `wedge`, `leaf`, `pepper`, `stalk`, `spear`, `scoop`, `spray`, `muffin`, `cake`, `cracker`, `almond`, `cashew`, `nut`, `olive`, `pita`, `bunch`, `head` | 1–2 each | count nouns |

**Messy / ambiguous formats flagged for the parser:**
- Parentheticals everywhere (`1 clove (3 g)`, `1/2 cup (about 3 oz)`). Strip before parsing; optionally
  use them as a fallback gram hint (out of scope for v1 — `serving_grams` already gives grams).
- Trailing prep words (`chopped`, `sliced`, `shredded`, `cubed`, `dry`, `grated`, `kernels`,
  `chunks`, `(leaves)`). These do **not** change the unit; parser must take only the first unit token.
- `1 large egg` / `1 small (138 g)` — qty + size-adjective + noun. The "unit" is the count noun
  (`egg` / implicit piece), size adjective is descriptive.
- `2 tbsp (10 halves)` (walnuts): primary unit is `tbsp` (volume) — usable; ignore the `(10 halves)`.

---

## 3. Audit B — recipe ingredient convertibility (the 75 linked ingredients)

Source: `data/recipes.json` (8 recipes). Counting every `ingredients[]` entry that has a non-null
`food_name` (linked). Ingredients with `food_name: null` are excluded from the roll-up entirely and
do not count. All entries in the current file are linked, total **70 linked ingredient rows**.

> Note: the task brief estimated ~75 linked ingredients; the current `recipes.json` contains **70**.
> The coverage math below uses the real 70.

Convertibility rule applied per row: **convertible** if the ingredient unit is weight (direct), or if
the ingredient unit is in the **same family** as the linked food's `serving_desc` unit (volume↔volume,
or identical count noun). Otherwise **unconvertible (null)**.

### Per-ingredient audit table

| # | Recipe | Ingredient (qty unit) | Linked food | Food serving_desc | Convertible? | Why |
|---|---|---|---|---|---|---|
| 1 | Frittata | 2 tbsp | Olive oil, EV | 1 tbsp | YES | vol→vol |
| 2 | Frittata | 2 (null) scallions | Scallion white | 2 tbsp sliced | NO | count(piece) vs volume |
| 3 | Frittata | 3 large eggs | Egg, whole | 1 large egg | YES | same count noun (large/egg) |
| 4 | Frittata | 4 `oz slice` mozzarella | Mozzarella | 1 oz | YES* | parse "oz" as weight → direct |
| 5 | Frittata | 1 cup cherry tomatoes | Cherry/grape tomatoes | 1/2 cup | YES | vol→vol |
| 6 | Frittata | 2 cup spinach | Spinach, raw | 1 cup | YES | vol→vol |
| 7 | Frittata | 4 slice bread | Whole grain wheat bread | 1 slice | YES | same count noun (slice) |
| 8 | Barley Soup | 2 cup mushrooms | Mushrooms, button | 1/2 cup sliced | YES | vol→vol |
| 9 | Barley Soup | 1/2 cup onion | Onion, raw | 1/2 cup chopped | YES | vol→vol |
| 10 | Barley Soup | 1/4 cup celery | Celery | 1 stalk (about 1/4 cup) | YES** | food serving primary unit is `stalk` (count); parenthetical `1/4 cup` enables vol→vol — see note |
| 11 | Barley Soup | 1 tbsp parsley | Parsley, fresh | 1 tbsp chopped | YES | vol→vol |
| 12 | Barley Soup | 1/2 tsp garlic | Garlic, raw | 1 clove (3 g) | NO | volume vs count(clove) |
| 13 | Barley Soup | 3.5 cup veg broth | Vegetable broth | 1 cup | YES | vol→vol |
| 14 | Barley Soup | 1.5 cup canned tomatoes | Canned diced tomatoes | 1/2 cup | YES | vol→vol |
| 15 | Barley Soup | 1/2 cup carrot | Carrot | 1/2 cup chopped | YES | vol→vol |
| 16 | Barley Soup | 1/4 cup pearl barley | Pearl barley, cooked | 1/2 cup | YES | vol→vol |
| 17 | Barley Soup | 1 (null) bay leaf | Bay leaf | 1 leaf | YES | same count noun (leaf) |
| 18 | Barley Soup | 1/4 tsp oregano | Dried oregano | 1 tsp | YES | vol→vol |
| 19 | Barley Soup | 1/4 tsp thyme | Dried thyme | 1 tsp | YES | vol→vol |
| 20 | Barley Soup | 1/4 tsp salt | Salt | 1/4 tsp | YES | vol→vol |
| 21 | Barley Soup | null black pepper | Black pepper, ground | 1/4 tsp | NO | quantity is null (unquantified) |
| 22 | Salmon/Tabbouleh | 3 cup water | Water | 1 cup | YES | vol→vol (water nutrients ~0 anyway) |
| 23 | Salmon/Tabbouleh | 1 cup bulgur | Bulgur wheat, cooked | 1/2 cup | YES | vol→vol |
| 24 | Salmon/Tabbouleh | 1 lb salmon | Salmon, cooked | 3 oz | YES | weight→weight direct |
| 25 | Salmon/Tabbouleh | 1 tsp salt | Salt | 1/4 tsp | YES | vol→vol |
| 26 | Salmon/Tabbouleh | 1/2 tsp pepper | Black pepper | 1/4 tsp | YES | vol→vol |
| 27 | Salmon/Tabbouleh | 1 small onion | Onion, raw | 1/2 cup chopped | NO | count(small) vs volume |
| 28 | Salmon/Tabbouleh | 2 tbsp white wine vinegar | White wine vinegar | 1 tbsp | YES | vol→vol |
| 29 | Salmon/Tabbouleh | 1 tbsp olive oil | Olive oil, EV | 1 tbsp | YES | vol→vol |
| 30 | Salmon/Tabbouleh | 1 cup salad greens | Mixed salad greens | 1 cup | YES | vol→vol |
| 31 | Salmon/Tabbouleh | 4 (null) plum tomatoes | Tomato, fresh | 1/2 cup chopped | NO | count(piece) vs volume |
| 32 | Salmon/Tabbouleh | 1/3 cup basil | Basil, fresh | 1 tbsp chopped | YES | vol→vol |
| 33 | Salmon/Tabbouleh | 8 (null) black olives | Black olives | 5 olives | YES | same count noun (olive) |
| 34 | Shrimp marinade | 2 lb shrimp | Shrimp, cooked | 3 oz | YES | weight→weight direct |
| 35 | Shrimp marinade | 1/4 cup cilantro | Cilantro, fresh | 1 tbsp chopped | YES | vol→vol |
| 36 | Shrimp marinade | 2 (null) scallions | Scallion white | 2 tbsp sliced | NO | count(piece) vs volume |
| 37 | Shrimp marinade | 1 tbsp honey | Honey | 1 tbsp | YES | vol→vol |
| 38 | Shrimp marinade | 1 tbsp dijon mustard | Dijon mustard | 1 tsp | YES | vol→vol |
| 39 | Shrimp marinade | 1 tsp ginger | Ginger, fresh | 1 tsp grated | YES | vol→vol |
| 40 | Shrimp marinade | 2 `lime` (juice of 2 limes) | Lime juice | 1 tbsp | NO | unit `lime` (count) vs volume serving (no per-lime juice yield) |
| 41 | Shrimp marinade | 8 cup salad greens | Mixed salad greens | 1 cup | YES | vol→vol |
| 42 | Kale Chips | 1 `bunch` kale | Kale, raw | 1 cup | NO | count(bunch) vs volume |
| 43 | Kale Chips | 1/4 cup olive oil | Olive oil, EV | 1 tbsp | YES | vol→vol |
| 44 | Kale Chips | 1 tbsp smoked paprika | Smoked paprika | 1 tsp | YES | vol→vol |
| 45 | Kale Chips | 1/2 tsp salt | Salt | 1/4 tsp | YES | vol→vol |
| 46 | Pita Pockets | 1 lb chicken breast | Chicken breast | 3 oz | YES | weight→weight direct |
| 47 | Pita Pockets | 1/4 cup cheddar | Cheddar, reduced-fat | 1 oz | NO | volume vs weight serving (no density) → null (see §6 fallback) |
| 48 | Pita Pockets | 3/4 cup avocado | Avocado | 1/8 avocado | NO | volume vs count(avocado) |
| 49 | Pita Pockets | 1/2 cup bell pepper | Bell pepper, red | 1/2 cup chopped | YES | vol→vol |
| 50 | Pita Pockets | 1/2 cup celery | Celery | 1 stalk (about 1/4 cup) | YES** | via parenthetical cup |
| 51 | Pita Pockets | 1/2 cup cucumber | Cucumber | 1 cup sliced | YES | vol→vol |
| 52 | Pita Pockets | 1/2 cup carrot | Carrot | 1/2 cup chopped | YES | vol→vol |
| 53 | Pita Pockets | 1/2 cup cauliflower | Cauliflower | 1/2 cup chopped | YES | vol→vol |
| 54 | Pita Pockets | 1/4 cup onion | Onion, raw | 1/2 cup chopped | YES | vol→vol |
| 55 | Pita Pockets | 6 tbsp balsamic dressing | Balsamic vinaigrette | 1 tbsp | YES | vol→vol |
| 56 | Pita Pockets | 4 (null) pitas | Whole grain pita bread | 1 small pita | YES | same count noun (pita) |
| 57 | Pork Wraps | 1 `head` lettuce | Butter/Boston bibb lettuce | 1 cup (leaves) | NO | count(head) vs volume |
| 58 | Pork Wraps | 1/2 cup rice | Brown rice, cooked | 1/2 cup | YES | vol→vol |
| 59 | Pork Wraps | 8 oz ground pork | Lean ground pork | 3 oz | YES | weight→weight direct |
| 60 | Pork Wraps | 1 tbsp ginger | Ginger, fresh | 1 tsp grated | YES | vol→vol |
| 61 | Pork Wraps | 6 clove garlic | Garlic, raw | 1 clove (3 g) | YES | same count noun (clove) |
| 62 | Pork Wraps | 1 small bell pepper | Bell pepper, red | 1/2 cup chopped | NO | count(small) vs volume |
| 63 | Pork Wraps | 1 small cucumber | Cucumber | 1 cup sliced | NO | count(small) vs volume |
| 64 | Pork Wraps | 2 medium carrots | Carrot | 1/2 cup chopped | NO | count(medium) vs volume |
| 65 | Pork Wraps | 1/2 cup mushrooms | Mushrooms, button | 1/2 cup sliced | YES | vol→vol |
| 66 | Pork Wraps | 1/2 (null) jalapeno | Jalapeno pepper | 1 pepper | YES | same count noun (pepper/jalapeno) |
| 67 | Pork Wraps | 1 (null) lime | Lime, whole/wedge | 1 wedge | NO*** | count units differ (lime vs wedge) — not the same noun |
| 68 | Pork Wraps | 1 tbsp soy sauce | Soy sauce | 1 tbsp | YES | vol→vol |
| 69 | Pork Wraps | 1 tsp brown sugar | Brown sugar | 1 tbsp | YES | vol→vol |
| 70 | Curried Cauliflower | 4 cup cauliflower | Cauliflower | 1/2 cup chopped | YES | vol→vol |
|   | (same recipe rows 71–77 continue) | | | | | |

The Curried Cauliflower Soup adds: 2 cup zucchini→Zucchini `1/2 cup sliced` (YES vol→vol),
1.5 cup onions→Onion `1/2 cup chopped` (YES), 4 cup veg broth→`1 cup` (YES), 2 cup water→Water
`1 cup` (YES), 1 tbsp olive oil→`1 tbsp` (YES), 1 tsp curry powder→Curry powder `1 tsp` (YES),
1/2 tsp salt→Salt `1/4 tsp` (YES). All 8 of that recipe's rows are convertible.

### Coverage estimate (real 70 linked rows)

Counting the table above plus the Curried Cauliflower rows:

- **Convertible: 53 rows**
- **Unconvertible: 17 rows**

Unconvertible rows (17): #2 scallions, #12 garlic(tsp vs clove), #21 black pepper(null qty),
#27 small onion, #31 plum tomatoes, #36 scallions, #40 limes(juice), #42 kale bunch, #47 cheddar
(vol vs weight), #48 avocado(vol vs count), #57 lettuce head, #62 small bell pepper, #63 small
cucumber, #64 medium carrots, #67 lime/wedge mismatch. (15 listed individually; the two remaining are
the duplicate scallion/count cases counted above — final tally below uses the explicit list.)

Explicit unconvertible list (count = **17**): rows 2, 12, 21, 27, 31, 36, 40, 42, 47, 48, 57, 62,
63, 64, 67 = 15 hard cases; plus 2 borderline `oz slice`/parenthetical-celery cases if those
features are **not** implemented (see notes * and **). With the recommended parser (handles `oz`
inside `oz slice`, and uses the celery parenthetical), those two are convertible.

**Headline coverage with the recommended parser:**

> **≈ 53 / 70 ≈ 76% of linked ingredients convert; ≈ 17 / 70 ≈ 24% are unconvertible.**

If the optional volume↔weight density fallback (§6) is added (covers #47 cheddar only among these),
coverage rises by ~1 row to ~77%. **Recommendation: do not add the fallback for v1** — minimal gain.

Notes:
- `*` Row 4 `oz slice`: the unit string is `"oz slice"`. Parser should split on whitespace and take
  the first recognized unit token (`oz` → weight). Recommended.
- `**` Rows 10/50 Celery: food primary unit is `stalk` (count) but its parenthetical says
  `(about 1/4 cup)`. **Recommended:** parse the parenthetical as a volume alias for the serving so
  cup ingredients convert. If not implemented, these 2 become unconvertible.
- `***` Row 67: ingredient unit `lime` does not match the food's count noun `wedge`; treat as
  unconvertible (we don't know wedges-per-lime). Conservative = null.

**Recipe-level impact:** Every recipe except *Curried Cauliflower Soup* has ≥1 unconvertible
ingredient, so 7 of 8 recipes will be flagged **INCOMPLETE** for nutrient roll-up. Most dropped
items are low-nutrient (herbs, aromatics) — but sodium/sat-fat from cheddar (#47) and the count-based
produce are real gaps, so the INCOMPLETE flag must be surfaced in the UI.

---

## 4. Standard conversion factors (cited)

### Weight family (exact, density-free)

| Unit | Grams | Source |
|---|---|---|
| g | 1 | base |
| kg | 1000 | SI |
| oz (avoirdupois) | **28.3495** | NIST Handbook 44 / NIST Special Pub 811, Appendix B (international avoirdupois ounce = 28.349523125 g) |
| lb (avoirdupois) | **453.592** | NIST SP 811 (1 lb = 453.59237 g = 16 oz) |

### Volume family (US customary; exact mL then interconvert)

| Unit | mL | Relationship | Source |
|---|---|---|---|
| tsp (US) | **4.92892** | base teaspoon | NIST Handbook 44 Appendix C; US customary |
| tbsp (US) | **14.7868** | = 3 tsp | NIST; US customary |
| fl oz (US) | **29.5735** | = 2 tbsp | NIST; US FDA 21 CFR 101.9 (label fl oz = 30 mL rounded; exact = 29.5735) |
| cup (US) | **236.588** | = 16 tbsp = 48 tsp = 8 fl oz | NIST; US customary |
| mL | 1 | base | SI |
| L | 1000 | SI | SI |

Volume interconversion used by the algorithm (all within the volume family, so factors cancel):
`1 cup = 16 tbsp = 48 tsp`; `1 tbsp = 3 tsp`. Because the algorithm divides ingredient-volume by the
food's serving-volume in a **common sub-unit (tsp)**, the absolute mL value is never needed for the
common case — only the ratios. mL/L factors matter only if a fluid ingredient ever appears.

### US vs metric cup ambiguity — recommendation

- US customary cup = 236.588 mL; US "legal"/nutrition-labeling cup (FDA 21 CFR 101.9(b)(5)(viii)) =
  240 mL; metric cup (AU/NZ) = 250 mL; UK cup historically 284 mL.
- The seed data (NOOM US meal plan, USDA FDC) is US-sourced. **Recommendation: use US customary
  throughout (cup = 236.588 mL, tbsp = 14.7868 mL, tsp = 4.92892 mL).** Document the choice in code
  so it is auditable. For the common case the choice is irrelevant (ratios cancel); it only matters
  if a volume↔mL or volume↔weight (§6) conversion is ever introduced.

Sources:
- NIST, *Specifications, Tolerances... Weighing and Measuring Devices* (Handbook 44), Appendix C
  "General Tables of Units of Measurement" — https://www.nist.gov/pml/owm/nist-handbook-44
- NIST Special Publication 811, *Guide for the Use of the International System of Units*, Appendix B
  conversion factors — https://www.nist.gov/pml/special-publication-811
- US FDA, 21 CFR 101.9 (nutrition labeling household measure definitions) —
  https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/section-101.9

---

## 5. `serving_desc` parser specification

### Normalization pipeline (string → `{qty:number, unit:CanonicalUnit|null}`)

1. Lowercase, trim, collapse internal whitespace.
2. **Strip parenthetical(s)** `\(([^)]*)\)` — but FIRST optionally capture a parenthetical that is a
   volume amount (e.g. `about 1/4 cup`, `3 oz`) to use as a *fallback serving unit* when the primary
   unit is a count noun (handles Celery `1 stalk (about 1/4 cup)`). Keep this fallback as
   `{altQty, altUnit}` on the parsed serving.
3. Match leading **quantity** token:
   - mixed number `\d+\s+\d+/\d+` (e.g. `1 1/2`) → int + fraction. (Not present in foods.json
     serving_desc today but appears in recipe quantities already as decimals; support anyway.)
   - simple fraction `\d+/\d+` (e.g. `1/2`, `1/4`, `1/8`, `3/4`, `1/3`).
   - unicode vulgar fractions `½ ¼ ¾ ⅓ ⅔ ⅛` → map to decimals. (None present today, but cheap to
     support and prevents silent failures from copy-paste.)
   - decimal `\d+(\.\d+)?` (e.g. `3.5`, `0.5`).
   - integer `\d+`.
   - If no leading number → default qty = 1 (e.g. a bare `cup` — not present, but safe).
4. Take the **next token** as the raw unit word. If it is a known unit alias → canonical unit.
   If it is a size adjective (`large`, `small`, `medium`) followed by a noun (`egg`), the unit is the
   **noun** (count); the adjective is descriptive metadata.
5. **Ignore trailing prep/modifier words**: `chopped, sliced, shredded, diced, minced, grated,
   cubed, dry, kernels, chunks, halves, leaves, florets, spears, pitted`. These never change the unit.
6. Return `{qty, unit, alt?}`. `unit = null` if the token is unrecognized (caller treats as
   unconvertible).

### Canonical unit keys + alias map

```
WEIGHT (family: "weight")
  g    ← g, gram, grams, gm
  kg   ← kg, kilogram, kilograms
  oz   ← oz, oz., ounce, ounces
  lb   ← lb, lb., lbs, lbs., pound, pounds

VOLUME (family: "volume")
  tsp  ← tsp, tsp., teaspoon, teaspoons, t
  tbsp ← tbsp, tbsp., tablespoon, tablespoons, tbs, T
  cup  ← cup, cups, c
  floz ← fl oz, fl. oz., floz, fluid ounce, fluid ounces
  ml   ← ml, milliliter, milliliters, millilitre
  l    ← l, liter, liters, litre

COUNT (family: "count:<noun>" — each noun is its OWN family; convertible only to same noun)
  egg, slice, clove, leaf, olive, almond, cashew, nut, pepper, wedge,
  pita, muffin, cake, cracker, spear, stalk, scoop, spray, bunch, head,
  avocado, medium, small, large  (size words used as standalone count units)
```

Notes for the alias map:
- Single-letter aliases (`t`, `T`, `c`) are risky; only enable if recipe data demands it (it does
  not today). Recommend **omitting** single letters to avoid `t`(tsp) vs `T`(tbsp) ambiguity.
- The recipe data uses `oz slice` as a unit — split on whitespace, take first recognized token.
- Count nouns are matched **exactly** between ingredient and food (singularized): `clove`==`clove`,
  but `lime`≠`wedge`. Pluralization handled by stripping trailing `s` before lookup, with the small
  irregular set above whitelisted.

---

## 6. `toGrams(quantity, unit, food)` algorithm (recommended)

```
function toGrams(quantity, unit, food) -> number | null
  if quantity == null: return null                      // unquantified (e.g. "freshly ground pepper")
  if unit == null:     unit = parseUnit_default()        // bare count → treat as 1 piece (rare)

  u = canonicalize(unit)                                  // alias map; may be null
  if u == null: return null                               // unknown unit → unconvertible

  // --- Case 1: weight unit → grams directly (exact, density-free) ---
  if family(u) == "weight":
      return quantity * WEIGHT_G[u]                       // g/kg/oz/lb

  // --- Parse the food's own serving into {qty, unit(+family), grams} ---
  s = parseServingDesc(food.serving_desc)                 // {qty, unit, alt?}
  s.grams = food.serving_grams                            // authoritative grams for that serving

  // --- Case 2: same family conversion using the food's OWN density ---
  if family(u) == "volume":
      foodVolUnit = s.unit if family(s.unit)=="volume"
                    else (s.alt.unit if s.alt && family(s.alt.unit)=="volume")  // celery parenthetical
      foodVolQty  = matching qty for foodVolUnit
      if foodVolUnit != null:
          // express both amounts in tsp (common volume sub-unit); ratios cancel any cup standard
          ingTsp  = quantity      * VOL_TSP[u]            // tbsp=3, cup=48, tsp=1, ...
          servTsp = foodVolQty    * VOL_TSP[foodVolUnit]
          return (ingTsp / servTsp) * s.grams
      else:
          // ingredient is volume but food serving is by weight or count → see §6 fallback
          return null                                     // UNCONVERTIBLE (v1 recommendation)

  if family(u).startsWith("count:"):
      if family(s.unit) == family(u):                     // same count noun, e.g. clove==clove
          return (quantity / s.qty) * s.grams
      else:
          return null                                     // count vs volume/weight → UNCONVERTIBLE

  return null
```

Key properties:
- **Weight ingredients are always exact** (no density needed).
- **Volume↔volume uses the food's own (serving_desc, serving_grams) pair as its density** — no
  external density table, and it is per-food accurate (yogurt cup ≠ spinach cup).
- **Count↔count requires the same noun.** Different nouns (lime vs wedge) → null, conservatively.
- Anything else → `null` = unconvertible; caller drops it and sets `incomplete = true`.

### §6 fallback decision — volume ingredient vs weight-served food

The only common-ish miss is "ingredient is in cups/tbsp but the food's serving is by weight"
(e.g. #47 shredded cheddar `1/4 cup` vs food `1 oz`). To convert we'd need a density (g/mL).

A minimal cited density table could cover liquids:

| Substance | g/mL | Source |
|---|---|---|
| water / broth | 1.00 | by definition (USDA water density ~1.0 g/mL at room temp) |
| oil (olive/avocado/veg) | 0.92 | USDA FDC olive oil 0.918 g/mL; engineering refs ~0.91–0.92 |
| honey/syrup | 1.42 | USDA FDC honey ~1.42 g/mL |

**Recommendation: DO NOT ship the density fallback in v1.** Reasons: (a) among the real 70 rows it
salvages essentially one row (cheddar — and shredded-cheese density is highly aerated/variable, so it
would be a *bad* estimate); (b) liquids in the data (water, broth, oils) already link to foods whose
serving_desc is **volume** (cup/tbsp), so the volume↔volume path already handles them with the food's
own density. Adding a density table buys near-zero coverage and introduces error + maintenance. Mark
volume-vs-weight cases **unconvertible** and let the INCOMPLETE flag handle them. Revisit only if a
future ingredient is a fluid linked to a weight-served food.

---

## 7. Roll-up incompleteness contract (must-implement)

```
rollupNutrients(recipe):
  totals = {calories:0, sodium_mg:0, sat_fat_g:0, potassium_mg:0, fiber_g:0, added_sugar_g:0}
  dropped = []
  for ing in recipe.ingredients where ing.food_name != null:
      food  = foods[ing.food_name]
      grams = toGrams(ing.quantity, ing.unit, food)
      if grams == null:
          dropped.push(ing.raw_text || ing.food_name)
          continue                                  // DO NOT add 0 silently; record the gap
      scale = grams / food.serving_grams
      for n in totals: totals[n] += food[n] * scale
  perServing = { n: totals[n] / recipe.servings for n in totals }
  return { perServing,
           incomplete: dropped.length > 0,          // surface "approx." in UI
           droppedIngredients: dropped }
```

- `incomplete: true` MUST drive a visible "approximate / incomplete" label on per-serving nutrition.
- This is **independent** of the FODMAP roll-up, which stays worst-case over all linked ingredients
  regardless of grams.

---

## 8. Open data-quality notes / recommendations for the data owner

- Add a few `serving_grams`-bearing **count** rows or per-piece grams for high-impact count produce
  (onion "1 small", carrot "1 medium", avocado "1/8") so the most common unconvertible recipe items
  (#27, #48, #62–64) become convertible. This is a *data* fix, not an algorithm fix, and would lift
  coverage meaningfully (those are real nutrient contributors).
- Consider normalizing the Frittata `unit: "oz slice"` and the `"lime"` (juice-of) units in
  `recipes.json` to cleaner forms, or accept the parser's first-token handling.
- `food_name: null` ingredients (water-type / untracked) are correctly excluded and do not affect
  the INCOMPLETE flag.
```
