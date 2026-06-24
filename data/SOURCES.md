# Sources & Methodology — `data/foods.json`

This file documents how the curated foods dataset was built, what each field means, and which
public sources back the data. It exists so the diet/nutrition data in the app is auditable.

> **Medical disclaimer:** This dataset is an informational tool, not medical advice. FODMAP data is
> sourced from public references and may be incomplete. An `unknown` value is **never** "safe."

## Scope of "FODMAP" in this app

Per `CLAUDE.md`, "FODMAP" for this user means **fructose and fructans only**. Lactose, polyols
(sorbitol, mannitol), and GOS are **out of scope** and are *not* tracked in the level fields.

Each row carries two independent levels — `fructose_level` and `fructans_level` — each one of
`low | moderate | high | unknown`. A food is treated as low-FODMAP-safe by the app only when
**both** are `low`.

Where a food is a problem for a *different* FODMAP that is out of scope (e.g., mushrooms = mannitol,
beans = GOS, cow's milk = lactose), the level fields reflect fructose/fructans only, and the
`source` string notes the out-of-scope concern so a future polyol/GOS/lactose phase can revisit it.

## Sourcing rules (followed strictly)

1. **No Monash data.** Monash University FODMAP data is licensed/proprietary. Nothing here was
   copied or scraped from the Monash app or database. FODMAP classifications come from **public**
   dietitian/clinic food lists, peer-reviewed tables, and general nutrition knowledge.
2. **Nutrition from USDA FoodData Central (free).** Calories, serving grams, sodium, saturated fat,
   potassium, fiber, and sugar come from USDA FDC standard reference entries (or, for composite/
   commercial items, USDA branded/approximate entries — flagged "approximate" in the source).
3. **Conservative on conflict.** When public sources disagreed on a FODMAP level, the **higher
   (more conservative) level** was recorded and the conflict noted in `source`. A wrong "low/safe"
   is the worst possible error in a health app.
4. **`unknown` over guessing.** If a food's fructose/fructans level is not credibly known from
   public sources — typically composite/commercial products whose recipes vary (rotisserie chicken,
   deli/cured meats, commercial dressings, granola, sugar-free jam) — the level is set to `unknown`,
   which the app shows as "not verified," never "safe."

## Public sources used

FODMAP fructose/fructans classifications were cross-checked against these public references
(non-Monash). Specific rows cite the relevant one(s) inline in their `source` field:

- **Cleveland Clinic** — "Low FODMAP Diet" patient education (high/low food lists).
  https://my.clevelandclinic.org/health/treatments/22466-low-fodmap-diet
- **Healthline** — "FODMAP Diet 101" and "High FODMAP foods" (dietitian-reviewed).
  https://www.healthline.com/nutrition/fodmaps-101 ; https://www.healthline.com/nutrition/foods-high-in-fodmaps
- **Registered-dietitian food lists** — EA Stewart RD (low-FODMAP vegetables/fruits), Diet vs Disease
  (low-FODMAP vegetable/fruit PDFs), Dietetic Directions, cookedandloved.com, FODMAP Everyday,
  A Little Bit Yummy / Fun Without FODMAPs (bread guides). Used for serving-size thresholds.
- **Gastroenterology clinic handouts** — Rochester Gastro, GastroConSA, UF Health low-FODMAP PDFs.
- **Peer-reviewed (PubMed/PMC)** — fructan content of cooked cereal grains
  (PMC10820302), FODMAP profile of wholegrain pasta (PMC11853891), HFCS/fructose malabsorption
  (PMC10835987). Used for grain (barley, bulgur, wheat bread, pasta) fructan calls.
- **USDA FoodData Central** — all nutrition values. https://fdc.nal.usda.gov/

Searches were run June 2026 to verify the safety-critical and ambiguous foods (peppers, zucchini,
cucumber, green beans, eggplant; barley/bulgur/wheat bread/pasta; mushroom/cauliflower/broccoli/
asparagus/beets/sweet potato/corn; chickpeas/beans/lentils/tofu/peanuts/almonds; the berry and
fructose-offender fruit sets; honey/HFCS/agave/dried fruit).

## How the dataset was assembled

1. **Extracted every ingredient** from the NOOM "No Restrictions" meal plan PDF
   (`reference/No-Restrictions-Meal-Plan-6n892357j12d.pdf`) — the 8 lettered recipes (Spinach Tomato
   Frittata, Vegetarian Barley Soup, Salmon with Tabbouleh Salad, Marinated Shrimp, Smoky Paprika
   Kale Chips, Chicken & Avocado Pita Pockets, Lean Pork Lettuce Wraps, Curried Cauliflower Soup),
   the 7 sample days, the "Get Inspired" meals, the "Make Your Perfect Plate" category lists, and the
   "Save 100 Calories" swaps.
2. **Added NOOM-category staples** (protein / whole-grain / non-starchy-veg / starchy-veg / fruit /
   fat / freebie) and DASH groups so every category is represented.
3. **Added a deliberate low-FODMAP high-fiber set** (oats, steel-cut oats, chia, quinoa, raspberries,
   strawberries, oranges, kiwi, skin-on potato, parsnip, eggplant, collard greens, edamame, corn
   tortillas, air-popped popcorn, firm tofu, etc.) so the app can suggest closing a fiber gap without
   breaking fructose/fructans limits.
4. **Added known offenders** so "avoid" cases are visible: onion, garlic, garlic powder, scallion
   white, asparagus, cauliflower, beets, ripe banana, grapes, apple, pear, mango, watermelon, dried
   fruit, honey, HFCS, agave, plus onion/garlic-bearing composites (broth, salsa, marinara, pesto,
   hummus, guacamole).

## Field reference

| Field | Meaning |
|---|---|
| `name` | Food + form (e.g., "Spinach, cooked"). Some foods are split by state when FODMAP differs (banana ripe vs unripe; scallion green tops vs white). |
| `serving_desc` / `serving_grams` | Human serving and its grams. **Grams matter for FODMAP** — many vegetables are low only at the listed portion. |
| `calories` | kcal per serving. The app computes NOOM color from `calories / serving_grams`; no color is stored here. |
| `sodium_mg`, `sat_fat_g`, `potassium_mg`, `fiber_g`, `added_sugar_g` | DASH + fiber tracking nutrients per serving. `null` only if genuinely unknown. |
| `fructose_level`, `fructans_level` | Independent `low/moderate/high/unknown`, conservative on conflict, fructose/fructans **only**. |
| `noom_category` | `protein \| whole-grain \| non-starchy-veg \| starchy-veg \| fruit \| fat \| freebie`. |
| `dash_group` | `grains \| vegetables \| fruits \| dairy \| meat-poultry-fish \| nuts-seeds-legumes \| fats-oils \| sweets`. |
| `low_fodmap_high_fiber` | `true` only when **both** levels are `low` **and** `fiber_g >= ~2.5` for the serving. |
| `source` | Inline citation: USDA FDC item for nutrition + the FODMAP reference/rationale. |

## Important data-quality caveats

- **Serving size is load-bearing for FODMAP.** Several foods are low only at the stated portion and
  become moderate/high at larger servings (zucchini, sweet potato, butternut squash, corn, balsamic
  vinegar, almonds, almond butter, dried cranberries, orange juice, ripe banana). The level reflects
  the listed `serving_grams`. If the user logs a bigger portion, the app should treat the level as a
  floor, not a guarantee.
- **Meal-plan grains are flagged high.** The NOOM plan leans heavily on wheat bread, pita, tortillas,
  English muffins, barley, bulgur, and 1-cup pasta — all **high in fructans** at the plan's serving
  sizes (peer-reviewed grain studies + dietitian bread guides). Sourdough (long-ferment), corn
  tortillas, oats, quinoa, brown/white rice, and rice cakes are the low-fructan grain swaps included.
- **Onion/garlic hide in composites.** Broth/stock, salsa, marinara, pesto, hummus, and guacamole are
  marked moderate/high because standard versions contain onion and/or garlic. Garlic-infused **oil**
  is included as the low-FODMAP flavor workaround (fructans are not oil-soluble).
- **Out-of-scope FODMAPs not penalized.** Mushrooms (mannitol), cauliflower (mannitol + fructans —
  marked high mainly for fructans), beans/lentils/chickpeas (GOS), cow's milk and cottage cheese
  (lactose), avocado/sweet potato (sorbitol/mannitol at larger servings) keep fructose/fructans-only
  levels; their other-FODMAP issues are noted in `source` for a future phase.
- **6 rows are `unknown`** (rotisserie chicken, turkey bacon, deli turkey, balsamic vinaigrette,
  sugar-free jam, granola) — composite/commercial items whose ingredients vary and commonly include
  garlic/onion powder, HFCS, dried fruit, or polyols. They are deliberately **not** marked safe.
- **Nutrition precision.** USDA values are rounded to app-useful precision. Composite/branded items
  (deli meats, dressings, granola, broths, commercial breads) use representative/approximate values
  and say so; real-product values vary by brand and should be overridden via barcode/Open Food Facts
  data when available.

## Dataset summary

- **178 foods.**
- Fructose levels: 152 low, 9 moderate, 11 high, 6 unknown.
- Fructans levels: 131 low, 17 moderate, 24 high, 6 unknown.
- **17 foods** flagged `low_fodmap_high_fiber = true` (fiber-gap suggestions).
- **6 foods** have at least one `unknown` level (shown as "not verified," never safe).
- Nutrition: 129 rows cite a specific USDA FDC item; the rest are composites/spices/sweeteners with
  representative values plus a FODMAP rationale.
