# Phase 3 Research — Barcode Scanning (OFF lookup + scanner library)

> Research note for the FODMAP-NOOM-DASH PWA. Written 2026-06-25 (researcher agent).
> Verify versions before coding — the JS scanner ecosystem moves fast and some figures
> below are mid-2026 snapshots (flagged inline with ⚠).

## TL;DR recommendation

- **Scanner:** Primary = native **`BarcodeDetector` API** (fast, zero-bundle, great on the owner's
  Android Chrome). Fallback = **`zxing-wasm`** (actively maintained, WASM ZXing-C++, TS types) for
  desktop Safari / Firefox / older browsers that lack `BarcodeDetector`. The
  `barcode-detector` npm polyfill (built on `zxing-wasm`) lets you code against ONE
  `BarcodeDetector` interface and only loads WASM where the native API is missing.
  Avoid `html5-qrcode` (unmaintained, ~1 MB bundle).
- **Lookup:** Open Food Facts v2 product endpoint, anonymous GET, request only the `fields=` we map.
  Browser can call it directly (simple CORS GET works for anonymous reads).
- **Health safety (non-negotiable):** OFF has **no fructose/fructans data**. Every scanned product is
  inserted with `fructose_level='unknown'`, `fructans_level='unknown'` → UI shows **"Not verified"**,
  never "Safe." Ingredient-text keyword scan may add a *non-authoritative* "possible trigger" hint
  but must NEVER set a level to `low`.

---

## 1. Open Food Facts API

### Endpoint

```
GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=...
```

Example (Nutella, EAN 3017624010701), requesting only what we map:

```
https://world.openfoodfacts.org/api/v2/product/3017624010701?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,nutrition_data_per,ingredients_text,ingredients_tags
```

- **Production host:** `world.openfoodfacts.org`. The docs use `world.openfoodfacts.net` in examples —
  that is the **staging** server (use for testing/load only; not production data freshness).
- **Response shape:** `{ "code": "...", "status": 1, "product": { ... } }`.
  `status: 0` (or HTTP 404) = product not found → surface "Product not in Open Food Facts, add it manually."
- The `.json` suffix form (`/api/v2/product/{barcode}.json`) also works; `fields=` is the payload-size lever — request it always.
- Source: [OFF API tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/),
  [OFF API intro](https://openfoodfacts.github.io/openfoodfacts-server/api/).

### Rate limits, attribution, CORS

- **Rate limit:** 15 req/min/IP for product reads (`GET /api/v*/product`); 10 req/s for search.
  Exceeding returns HTTP **429/503**. Barcode scanning is one request per scan, so we are well under —
  but cache results in Dexie/TanStack Query to avoid re-fetching the same barcode.
  Source: [OFF API intro — rate limits](https://openfoodfacts.github.io/openfoodfacts-server/api/).
- **User-Agent:** OFF asks for a custom UA `AppName/Version (contact email)`.
  ⚠ **Browsers forbid setting the `User-Agent` request header via `fetch`** — it is a forbidden
  header name and is silently dropped. So a pure browser call cannot comply. Options:
  1. Append an identifying query param `?app_name=FODMAP-NOOM-DASH&app_version=1.0` (OFF accepts these), or
  2. Proxy the call through a **Supabase Edge Function** that sets a proper UA server-side. The proxy
     also lets us add light caching and keeps OFF's contact/attribution clean. **Recommended:** start
     with a direct browser GET + `app_name`/`app_version` params for simplicity; move to the Edge
     proxy if OFF rate-limits or asks for stricter UA compliance.
  Source: [MDN — Forbidden header names](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name).
- **CORS:** Anonymous **GET** reads are simple CORS requests and work from the browser — no preflight.
  The known CORS breakage (GitHub #13555) is specifically the **OPTIONS preflight on *authenticated*
  requests**, which we never make (we only do anonymous reads). So direct browser fetch is fine for our use.
  Source: [OFF server issue #13555](https://github.com/openfoodfacts/openfoodfacts-server/issues/13555).
- **Attribution / license:** OFF data is **Open Database License (ODbL)**. We must attribute Open Food
  Facts and keep derived shared data under ODbL. Show "Data from Open Food Facts" on scanned-product
  detail screens.
- **Data quality:** crowd-sourced. Missing fields are common (no serving size, no fiber, no potassium,
  partial nutriments). Treat **every** numeric field as possibly absent → map to `null`, never 0.

### Per-100g vs per-serving in `nutriments`

OFF stores most nutrients **twice**, suffixed by basis:

| Suffix          | Meaning                          | Example keys |
|-----------------|----------------------------------|--------------|
| `_100g`         | per 100 g (or 100 ml) — almost always present | `energy-kcal_100g`, `sodium_100g`, `salt_100g`, `fiber_100g`, `saturated-fat_100g`, `potassium_100g`, `sugars_100g` |
| `_serving`      | per labelled serving — often missing | `energy-kcal_serving`, `sodium_serving`, `fiber_serving`, … |
| (no suffix)     | the "as sold" value in OFF's canonical unit | `energy-kcal`, `salt`, `sodium` |

- `product.nutrition_data_per` is `"100g"` or `"serving"` and tells you which basis the contributor entered.
- **Energy:** prefer `energy-kcal_100g` (kcal). There is also `energy_100g` / `energy-kj_100g` which is
  **kilojoules** — do NOT use kJ as calories. If only kJ exists, convert: `kcal = kJ / 4.184`.
- **Salt vs sodium:** OFF gives BOTH `salt_100g` and `sodium_100g`, in **grams**.
  - Prefer `sodium_100g` when present: `sodium_mg = sodium_100g * 1000`.
  - If only `salt_100g`: `sodium_mg ≈ salt_g * 393` (sodium is ~39.3% of salt by mass; OFF's own
    factor is salt = sodium × 2.5, i.e. sodium = salt / 2.5 = salt × 400 mg/g; **0.393 g/g ≈ ×393 mg/g**
    is the chemically exact factor, ×400 is OFF's rounding — use ×393 mg/g for our `sodium_mg`).
  Source: [OFF nutriments field reference](https://openfoodfacts.github.io/openfoodfacts-server/api/),
  [OFF dataset / nutriments fields](https://world.openfoodfacts.org/data/data-fields.txt).

### Deriving `serving_grams` + per-serving calories for `noomColor`

`noomColor(calories, grams)` needs a calorie value and the grams it corresponds to. Strategy, in order:

1. **If `serving_quantity` is present** (numeric grams of one serving, e.g. `15`):
   `serving_grams = serving_quantity`, and
   `calories = energy-kcal_serving` if present, else `energy-kcal_100g * serving_quantity / 100`.
2. **Else if `serving_size` is a parseable string** ("15 g", "240 ml", "2 cookies (30g)"):
   extract the gram number → use as `serving_grams`, compute calories from `_100g` as above.
   (`serving_quantity` is OFF's already-parsed grams of `serving_size`; prefer it over re-parsing.)
3. **Else (only per-100g known):** store **`serving_grams = 100`** and
   `calories = energy-kcal_100g`. Set `serving_desc = "100 g"`. This keeps cal/g (and therefore the
   NOOM color) mathematically correct, since `noomColor` is density-based — 100 g is a valid basis.
   Flag to the user that the serving is a default 100 g they may want to edit.

Note: `noom_category` in our schema is nullable and `noomColor` is computed from calories/grams, so a
scanned food can carry a correct color even when category is left null.

---

## 2. HEALTH-SAFETY mapping (critical)

**OFF carries zero FODMAP / fructose / fructans data.** Therefore:

- **Hard rule:** `mapOpenFoodFactsToFood` ALWAYS sets `fructose_level='unknown'` and
  `fructans_level='unknown'`. By the project's `lowFodmapSafe` rule (both must be `low`), a scanned
  product is never `low_fodmap_safe`; the UI must render **"Not verified — FODMAP levels unknown,"**
  never "Safe." (CLAUDE.md: "Anything `unknown` is shown as 'not verified,' never 'safe.'")

### Surfacing it to the user on add

- On the scanned-product confirm screen, show a prominent amber banner:
  *"FODMAP not verified. Open Food Facts has no fructose/fructans data. This product is treated as
  unverified until you set its levels."*
- Provide an explicit, optional **"Set FODMAP levels"** control letting the user choose
  `low/moderate/high/unknown` for fructose and fructans **with a required source note** (mirrors the
  curated dataset's `source` column). Default stays `unknown`; the user must take a deliberate action
  to change it. Store the user's edit as a user-scoped `foods` row (`user_id = current user`), not on
  the global seed.

### Ingredient-text keyword hint (non-authoritative)

OFF gives `ingredients_text` and structured `ingredients_tags`. We MAY scan these for obvious
high-fructan / high-fructose triggers and show a **"possible trigger"** hint — but it must NEVER
upgrade a level to `low`/safe, only ever warn.

- Suggested keyword list (substring/tag match, case-insensitive):
  `wheat`, `onion`, `garlic`, `inulin`, `chicory root`, `fructo-oligosaccharide` / `FOS`,
  `high fructose corn syrup` / `HFCS`, `agave`, `honey`, `apple` (juice/concentrate), `pear`,
  `rye`, `barley`. (Fructans: wheat/rye/barley/onion/garlic/inulin/chicory/FOS; excess fructose:
  HFCS/agave/honey/apple/pear.)
- Behaviour: if a keyword matches, render *"Possible FODMAP trigger detected in ingredients
  (contains: onion, wheat). This is a non-authoritative hint, not a verified level."* Keep
  `fructose_level`/`fructans_level` at `unknown`. Absence of keywords means **nothing** — it must
  NOT imply "safe" (an ingredient list can be incomplete, and many high-FODMAP foods have no flagged word).
- Implement as a pure helper in `src/lib/diet/` (e.g. `scanIngredientsForTriggers(text): string[]`) so
  it is unit-testable and the warning logic lives with the other diet rules.

---

## 3. Barcode scanner library comparison

| Option | Browser support (mid-2026 ⚠) | Bundle | Maintenance | TS types | Notes |
|---|---|---|---|---|---|
| **Native `BarcodeDetector`** | Chrome Android ✅ (v149+), Chrome/Edge desktop ◐ partial (works on most), **Safari (desktop+iOS) ❌ disabled by default**, Firefox ❌ | 0 KB | Browser-shipped | via `@types/dom-webcodecs`/lib.dom | Fastest, no download. Must feature-detect. |
| **`zxing-wasm`** (Sec-ant) | All modern browsers (WASM) | ~ a few hundred KB WASM, lazy-loaded | ✅ active (updated 2026) | ✅ native TS | ZXing-C++ via WASM; you wire `getUserMedia` + video frames yourself, or use `react-zxing`. |
| **`barcode-detector`** (polyfill) | Everywhere (uses native when present, `zxing-wasm` otherwise) | 0 KB native path / WASM fallback | ✅ active | ✅ | Lets you target ONE `BarcodeDetector` API; ideal glue for the primary+fallback plan. |
| **`@zxing/browser`** | All modern browsers | medium | ◐ underlying `@zxing/library` in maintenance mode only | ✅ | Handles camera for you, but JS port no longer gets new formats/fixes. |
| **`html5-qrcode`** | All modern | ⚠ ~1 MB (unminified UMD ~1.05 MB) | ❌ unmaintained; known black-camera bug on some Android Chrome | partial | Not recommended. |

Sources: [caniuse BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector),
[MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector),
[zxing-wasm (npm)](https://www.npmjs.com/package/zxing-wasm),
[zxing-wasm (GitHub)](https://github.com/Sec-ant/zxing-wasm),
[barcode-detector polyfill](https://www.npmjs.com/package/barcode-detector),
[@zxing/browser](https://www.npmjs.com/package/@zxing/browser),
[html5-qrcode bundle issue #836](https://github.com/mebjas/html5-qrcode/issues/836).

### Camera / secure-context requirements (apply to ALL options)

- `getUserMedia` (camera) requires a **secure context: HTTPS or `localhost`**. Our Netlify/Vercel
  hosting is HTTPS and `npm run dev`/`preview` on localhost qualify — fine.
  Source: [MDN getUserMedia security](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- Must request camera permission (`navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`)
  and handle denial gracefully with a manual-barcode-entry fallback.
- `BarcodeDetector` itself also benefits from a secure context; always feature-detect with
  `'BarcodeDetector' in window` AND `await BarcodeDetector.getSupportedFormats()` before use.

### Recommendation

Use the **`barcode-detector` polyfill** as the single integration point:
```ts
import 'barcode-detector/side-effects' // installs polyfill only where native is missing
const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
```
We feed it frames from a `getUserMedia` video element (or `react-zxing`-style loop). This gives the
zero-bundle native path on the owner's Android Chrome and a maintained WASM fallback everywhere else,
behind one API — the lowest-risk, lowest-maintenance choice. Restrict `formats` to retail barcodes
(EAN/UPC) for speed and fewer false positives.

---

## 4. `mapOpenFoodFactsToFood(product)` field mapping

Target: our `FoodRow` (`src/lib/db/types.ts`). Insert as a **user-scoped** row
(`user_id = current user`, since OFF products aren't global seed).

| OFF field (`product.…`) | Our column | Transform |
|---|---|---|
| `product_name` (fallback `generic_name`, then `brands` + barcode) | `name` | trimmed string; if blank, prompt user to name it |
| `brands` | `brand` | first brand before comma, or null |
| `serving_size` | `serving_desc` | string as-is; else `"100 g"` if defaulting to 100 g |
| `serving_quantity` → else parse `serving_size` → else `100` | `serving_grams` | numeric grams (see §1 strategy); null only if truly indeterminate |
| `nutriments.energy-kcal_serving` → else `energy-kcal_100g × serving_grams/100` → else `energy_*` kJ ÷ 4.184 | `calories` | kcal for the chosen serving basis; null if no energy field |
| `nutriments.sodium_100g × 1000` → else `salt_100g × 393` (per serving: scale by `serving_grams/100`) | `sodium_mg` | mg; prefer sodium over salt; null if neither |
| `nutriments.saturated-fat_100g` (× `serving_grams/100`) | `sat_fat_g` | grams per serving; null if absent |
| `nutriments.potassium_100g × 1000` (× `serving_grams/100`) | `potassium_mg` | OFF potassium is in **g** → ×1000 for mg; null if absent |
| `nutriments.fiber_100g` (× `serving_grams/100`) | `fiber_g` | grams per serving; null if absent |
| `nutriments.added-sugars_100g` if present, else leave null (do NOT use total `sugars_100g` as added sugar) | `added_sugar_g` | grams per serving; null if no *added*-sugar field |
| — (none) | `fructose_level` | **always `'unknown'`** |
| — (none) | `fructans_level` | **always `'unknown'`** |
| — | `noom_category` | null (color computed from calories/grams) |
| — | `dash_group` | null (or user-set later) |
| `"Open Food Facts: <barcode>"` | `source` | citation string, e.g. `"Open Food Facts (ODbL), barcode 3017624010701, fetched 2026-06-25"` |

**Unit reminders baked into the mapper:**
- OFF `sodium`, `salt`, `potassium`, `saturated-fat`, `fiber`, `sugars` `_100g` values are all in
  **grams**. Sodium & potassium → ×1000 for our **mg** columns; fat/fiber/sugar stay grams.
- All per-serving columns = `_100g value × serving_grams / 100` unless a `_serving` field exists.
- Any missing nutrient → `null` (never 0; 0 would falsely read as "contains none").

**Open implementation questions for the planner/coder:**
- Direct browser fetch vs Supabase Edge proxy for the OFF call (UA compliance + caching) — start direct, proxy if needed.
- Where to persist scanned products (immediate insert vs confirm-then-insert) — recommend confirm screen first.
- Reuse `scanIngredientsForTriggers` in `src/lib/diet/` and add Vitest cases (incl. "no keyword ≠ safe").
