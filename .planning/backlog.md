# Backlog (agreed, not yet scheduled)

## Unit → grams conversion layer (for recipe nutrient roll-up)
**Why:** Recipe ingredients store `quantity` + `unit` (e.g. "2 cups", "4 oz slice", "1 tbsp")
that don't convert to each food's `serving_grams`, so a logged recipe currently contributes
**calories only** to daily DASH / fiber / sodium totals. Individual foods are fully counted.
**What:** a conversion layer (volume/weight/count → grams, ideally per-food density for volumes)
so `recipeRollup` can produce true per-serving summed fiber/sodium/potassium/sat-fat, and
`toLoggedNutrients` can feed recipe entries into `dashProgress`/`fiberProgress`.
**Likely shape:** a `researcher` pass to build a units table (+ per-food volume→gram densities),
then a `coder` pass to add `toGrams(quantity, unit, food)` and wire it into the roll-up + log math.
Confirmed valuable by the owner (2026-06-24).
