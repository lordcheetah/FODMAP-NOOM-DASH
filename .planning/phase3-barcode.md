# Phase 3 — Barcode Scanning (implementation plan)

> Planner output. The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> Mirrors the Phase 1/2 conventions (`.planning/phase1-meals.md`, `.planning/phase2-exercise.md`):
> hand-authored DB row types, foods-style RLS, typed null-guarded user-scoped TanStack Query hooks,
> **pure tested logic in `src/lib/`**, thin mobile-first components, and the project's non-negotiable
> health-data-safety posture: **a scanned product's FODMAP verdict is `unknown` → it must read
> "Not verified," NEVER "Safe."**
>
> **Researcher dependency:** `.planning/phase3-barcode-research.md` (Open Food Facts v2 field mapping,
> scanner library choice, FODMAP-unknown handling) is being produced concurrently. Only Task 1
> (final library pick) and the exact OFF field paths in Task 3 block on it. The migration, hooks,
> component scaffolding, and the pure-mapper test matrix can be specified now and adjusted to the
> researcher's confirmed field paths.

## What's already built (ground truth)

- **DB** (`supabase/migrations/0001_init.sql`): `foods` already has `user_id uuid` nullable
  (`NULL` = global seed; non-null = user-custom), every nutrient column we need
  (`serving_desc` NOT NULL, `serving_grams`, `calories`, `sodium_mg`, `sat_fat_g`, `potassium_mg`,
  `fiber_g`, `added_sugar_g`), `brand`, `source`, and **`fructose_level`/`fructans_level` default
  `'unknown'`**. RLS: `foods_read` = `select to authenticated using (true)`; `foods_insert` =
  `with check (user_id = auth.uid())`; `foods_update`/`foods_delete` gated on `user_id = auth.uid()`.
  **A user-custom food insert is already permitted by RLS — no policy change needed (Task 2 confirms).**
  Indexes: `foods_name_idx` (gin tsvector on name), `foods_user_idx` on `(user_id)`.
- **Seed constraints** (`0002_seed_constraints.sql`): partial unique indexes `where user_id is null`
  (the per-user-custom rows are intentionally unconstrained). Our new barcode unique index must be the
  same partial-index style but keyed on `(user_id, barcode) where barcode is not null` (Task 1.5).
- **DB types** (`src/lib/db/types.ts`): hand-authored `FoodRow` (numeric → `number`, nullable →
  `T | null`, `fructose_level`/`fructans_level` are non-null `FodmapLevel`). We add one field.
- **DB hooks** (`src/lib/db/foods.ts`): only `useFoodSearch(term)` today (ilike name, ≥2 chars,
  `supabase === null` → disabled empty query). `queryKeys.ts` is the central key factory;
  `src/lib/db/index.ts` is the barrel. Mutation conventions (`foodLog.ts`): guard `supabase === null`
  + `useAuth().user.id`, throw when unconfigured/signed-out, `invalidateQueries` on success.
- **Diet logic** (`src/lib/diet/`): `noomColor(calories, grams)` returns `NoomColor | null`
  (null when grams ≤ 0 / non-finite — never a misleading color); `lowFodmapSafe(fructose, fructans)`
  returns `'not-verified'` whenever either axis is `unknown`. `FodmapBadge` renders `not-verified`
  as a **neutral** badge labeled "Not verified" (never green). Reuse all of these as-is.
- **Add-food UI** (`src/pages/Meals.tsx` → `src/components/meals/FoodSearch.tsx` →
  `src/components/meals/AddToLogDialog.tsx`): search renders `FoodItemRow`s with a `+` button that
  sets an `AddTarget { name, food_id?, recipe_id? }`; `AddToLogDialog` picks meal + servings and
  calls `useAddLogEntry`. The scanner plugs into this exact flow — scan resolves to a `food_id`, then
  reuses `AddToLogDialog` unchanged.
- **UI primitives** (`src/components/ui/`): `Button`, `Dialog` (supports `variant="sheet"`, `title`,
  `description`), `Input`, `Label`. Icons via `lucide-react`. `cn()` from `@/lib/utils`.
- **PWA** (`vite.config.ts`): vite-plugin-pwa, `registerType:'autoUpdate'`, `devOptions.enabled:false`
  (no SW in dev). Workbox precaches app assets only — **no runtime caching of OFF is configured**
  (OFF requires network; see Risks).
- **Tests**: Vitest (jsdom) colocated `*.test.ts`, `npm test`. Playwright `e2e/` (chromium + Pixel 5,
  builds+previews prod at `:4173`). Skip-when-no-creds pattern: `e2e/meals.spec.ts`
  (`test.skip(!hasCreds, ...)`, env `E2E_TEST_*`) — mirror it.

**Gaps Phase 3 (barcode) fills:** no scanner dependency; `foods` has no `barcode` column; no OFF
client/mapper; no scanner component or scan entry-point; no `useFoodByBarcode`/`useCreateFood` hooks;
no product-review / manual-add form; no tests for the mapper or the manual-add path.

---

## Decisions made up front (confirm before coding — see Risks)

- **D1 — Scanner library: prefer the native `BarcodeDetector` API with a lazy `@zxing/browser`
  fallback.** Native `BarcodeDetector` ships in Chrome/Android (the owner's primary device) at **zero
  bundle cost**; `@zxing/browser` is the fallback for browsers lacking it (notably iOS Safari, where
  support is partial/absent). One new runtime dependency: `@zxing/browser` (it pulls `@zxing/library`).
  **Lazy-load the fallback** via dynamic `import()` inside the scanner component so it is code-split
  out of the main bundle and only fetched when native detection is unavailable. *If the researcher
  finds native `BarcodeDetector` too unreliable on the target devices, fall back to always using
  `@zxing/browser` — still one dependency, just not lazy.* The researcher's pick overrides this D1.
- **D2 — `barcode` lives on the existing `foods` table (one nullable `text` column), not a new
  table.** A scanned product becomes a normal user-custom food row (`user_id = auth.uid()`,
  `barcode` set) so it flows through the existing search, log, roll-up, and summary code with zero new
  plumbing. Dedup/caching is a **partial unique index on `(user_id, barcode) where barcode is not
  null`** — re-scanning a product the user already saved finds the existing row instead of duplicating.
- **D3 — OFF mapping is a PURE function (`mapOpenFoodFactsToFood`) separated from the network fetch
  (`fetchProductByBarcode`).** The mapper is unit-tested exhaustively (no network); the fetch is a
  thin typed wrapper. This mirrors the diet-lib "pure logic, thin shell" rule.
- **D4 — Scanned products are saved with `fructose_level = 'unknown'` and `fructans_level =
  'unknown'`, ALWAYS.** OFF carries no fructose/fructans grading for this app's scope. The mapper
  hard-codes `'unknown'` (it cannot accept an override). FODMAP can only become non-unknown via the
  **explicit manual selectors** the user sets in the review form (Task 5) — never inferred from OFF.
  The review form shows a prominent "FODMAP not verified — set manually if you know it" notice, and
  the NOOM color is **computed** from calories + serving grams via `noomColor` (never read from OFF).
- **D5 — NOOM basis = per-100g when present (most reliable on OFF), else per-serving.** The mapper
  derives a `(calories, serving_grams)` pair so `noomColor` has a valid density basis. Per-100g →
  `calories = energy-kcal_100g`, `serving_grams = 100`, `serving_desc = "100 g"`. If only per-serving
  data exists, use `energy-kcal_serving` + `serving_quantity` (grams) when both present. If grams are
  unknown, leave `serving_grams = null` so `noomColor` returns `null` (unknown dot) rather than a
  fabricated density. The exact OFF field paths are confirmed by the researcher; the mapper's
  branching contract is fixed here.
- **D6 — Camera requires a secure context.** `getUserMedia`/`BarcodeDetector` only run on **HTTPS or
  `localhost`**. Dev testing on the laptop works at `http://localhost:5173`. Testing on the Android
  phone requires either the **deployed HTTPS URL** (Netlify/Vercel) or `vite --host` over HTTPS
  (a dev TLS cert / tunnel). Documented in Task 1 acceptance + Risks.

---

## Task 1 — Add the scanner dependency + document secure-context testing

**Goal:** add the chosen scanner library as one runtime dependency, code-split so it does not bloat
the initial bundle, and document exactly how the owner exercises the camera in dev vs prod.
**Files:** `package.json` (add `@zxing/browser`), `package-lock.json`; a short "Barcode scanning —
testing the camera" note in `data/README.md` or a `docs/` note (wherever the project keeps run notes;
match existing convention). No app code in this task beyond the dependency.
**Reuse:** existing PWA/build pipeline; no Vite config change required for code-splitting (dynamic
`import()` in Task 4 is enough). Confirm `@zxing/browser` is ESM and Vite-friendly (it is).
**Bundle impact note (record in the PR):** `@zxing/browser` + `@zxing/library` is the heaviest new
asset (~roughly low-hundreds of KB minified). Mitigation: it is lazy-loaded only on browsers without
native `BarcodeDetector`, and only when the scanner is opened — never on first paint. The native path
adds 0 KB. Verify with `npm run build` that the zxing chunk is a separate code-split chunk, not in
the entry/vendor chunk.
**Secure-context doc (must be written):**
- Camera needs HTTPS **or** `localhost`. `http://<lan-ip>:5173` from the phone will be blocked.
- Laptop dev: `npm run dev` → open `http://localhost:5173`, grant camera permission.
- Phone testing options: (a) deploy to the Netlify/Vercel HTTPS preview and scan there (recommended,
  also exercises the SW/PWA), or (b) run `vite --host` behind an HTTPS tunnel / local TLS cert.
- The scanner UI must degrade gracefully on insecure origins (Task 4 "unsupported" state) rather than
  throwing.
**Acceptance:** `npm install` clean; `npm run build` succeeds and the zxing code lands in its own
chunk (or is absent from the entry chunk); the testing note documents the HTTPS/localhost requirement
and both phone-testing paths. `npm run typecheck`/`lint` clean.

---

## Task 1.5 — Migration `0005_food_barcode.sql` (barcode column + indexes)

**Goal:** let scanned products be cached and de-duplicated per user without a new table, keeping the
existing foods-style RLS untouched.
**Files:** `supabase/migrations/0005_food_barcode.sql`.
**SQL (mirror the `0001`/`0002` style):**
```sql
-- Phase 3: barcode column on foods for scanned-product caching + per-user dedup.
alter table foods add column if not exists barcode text;

-- Lookup index for "find my food by barcode".
create index if not exists foods_barcode_idx on foods (barcode);

-- Per-user dedup: a user keeps at most one custom food per barcode.
-- Partial (where barcode is not null) so the many rows without a barcode (seed +
-- manually-typed customs) are unconstrained — mirrors the 0002 partial-index style.
create unique index if not exists foods_user_barcode_key_idx
  on foods (user_id, barcode)
  where barcode is not null;
```
**Reuse:** the partial-unique-index convention from `0002_seed_constraints.sql`; the existing
`FoodRow` type extends by one field (Task 6). **No RLS change** — `foods_insert`/`update`/`delete`
already scope to `user_id = auth.uid()`; this task's acceptance explicitly confirms that an authed
user inserting a food with their own `user_id` + a barcode is allowed and that a global seed row is
unaffected (its `barcode` stays null).
**Edge note:** the unique index keys on `(user_id, barcode)`; for global seed rows `user_id` is null,
so even if a seed row ever carried a barcode, nulls don't collide. Scanned rows always have a
non-null `user_id` (the owner) so dedup is exact per user.
**Acceptance:** migration applies cleanly via Supabase CLI on a DB already at `0001`–`0004`; a
`select barcode from foods limit 1` works; inserting two foods with the same `(user_id, barcode)`
violates `foods_user_barcode_key_idx` (proves dedup); inserting the same barcode under a different
`user_id` is allowed (proves per-user scope); reviewer confirms no RLS regression.

---

## Task 2 — Confirm RLS covers user food inserts (verification + types)

**Goal:** explicitly verify (no schema change beyond Task 1.5) that the existing RLS lets the signed-in
user insert/update/delete their own barcode-tagged food, read it back, and that they can never write a
row with someone else's `user_id`.
**Files:** none (analysis/verification task); findings recorded in the PR description / reviewer note.
If a test/staging Supabase project exists, add a manual check script note; otherwise reviewer reasons
about the policy text in `0001_init.sql`.
**Reuse:** `foods_insert` (`with check (user_id = auth.uid())`), `foods_read` (`using (true)`),
`foods_update`/`foods_delete`.
**Acceptance:** documented confirmation that (a) an authed insert with `user_id = auth.uid()` +
barcode succeeds, (b) an insert with a forged `user_id` is rejected by `foods_insert`'s `with check`,
(c) the user reads their own custom food and the global seed via `foods_read`. No code/migration here;
this gates the hook work in Task 6.

---

## Task 3 — Open Food Facts client: typed fetch + PURE mapper

**Goal:** a typed `src/lib/openfoodfacts.ts` exposing a thin network fetch and a **pure, unit-testable**
mapper from an OFF product to a partial `FoodRow`-shaped object, with FODMAP forced to `'unknown'`
and the NOOM basis derived per D5.
**Files:** `src/lib/openfoodfacts.ts`, `src/lib/openfoodfacts.test.ts` (mapper tests; see Task 7).
Optionally split types into `src/lib/openfoodfacts.types.ts` if the OFF response interface is large.
**Shape & signatures (coder implements; researcher confirms exact OFF field paths):**
```ts
// Minimal typed view of the OFF v2 product payload we consume (fields all optional).
export interface OffProduct {
  code?: string
  product_name?: string
  brands?: string
  serving_size?: string          // human text, e.g. "30 g"
  serving_quantity?: number      // grams, when OFF parsed it
  nutriments?: {
    'energy-kcal_100g'?: number
    'energy-kcal_serving'?: number
    'energy_100g'?: number       // kJ fallback (×0.239006 → kcal)
    'energy_serving'?: number
    sodium_100g?: number         // grams
    sodium_serving?: number
    salt_100g?: number           // grams (×400 → sodium mg; salt_g/2.5*1000)
    salt_serving?: number
    fiber_100g?: number
    fiber_serving?: number
    'saturated-fat_100g'?: number
    'saturated-fat_serving'?: number
    potassium_100g?: number      // mg or g? — researcher confirms unit; normalize to mg
    potassium_serving?: number
    sugars_100g?: number
    sugars_serving?: number
    'added-sugars_100g'?: number
    'added-sugars_serving'?: number
  }
}

export interface OffFetchResult {
  status: 'found' | 'not-found' | 'error'
  product: OffProduct | null
}

// Thin network wrapper — NOT unit-tested against the live API; mockable in component tests.
export async function fetchProductByBarcode(barcode: string): Promise<OffFetchResult>

// PURE mapper — no network, no Date, no randomness. Fully unit-tested.
// Returns a partial FoodRow for the create-food form to prefill. FODMAP is ALWAYS unknown.
export type MappedFood = Pick<
  FoodRow,
  | 'name' | 'brand' | 'serving_desc' | 'serving_grams' | 'calories'
  | 'sodium_mg' | 'sat_fat_g' | 'potassium_mg' | 'fiber_g' | 'added_sugar_g'
  | 'source'
> & { barcode: string; fructose_level: 'unknown'; fructans_level: 'unknown' }

export function mapOpenFoodFactsToFood(product: OffProduct, barcode: string): MappedFood
```
**`fetchProductByBarcode` contract:**
- GET OFF v2 product endpoint by barcode (free, no key, browser-callable). Researcher confirms the
  exact URL + recommended `fields=` projection (request only the fields the mapper reads, to cut
  payload). Send a descriptive `User-Agent`-style identifier per OFF policy **if** sent from a context
  that allows it (browsers ignore a custom `User-Agent` on `fetch`; the researcher confirms whether
  OFF requires it and whether a server/Edge proxy is warranted — see Risks/CORS).
- Map HTTP/`status` → `OffFetchResult`: product missing / `status:0` → `'not-found'`; network/parse
  failure → `'error'` (never throw to the component; the component shows manual-entry on `not-found`
  and a retry message on `error`).
**`mapOpenFoodFactsToFood` contract (the tested logic):**
- `name`: `product_name` (trimmed) or a fallback like `"Unknown product"` (never empty —
  `serving_desc`/`name` are NOT NULL in DB; coder must supply a non-empty name + serving_desc).
- `brand`: `brands` first value or `null`.
- **NOOM basis (D5):** prefer per-100g → `calories = energy-kcal_100g`, `serving_grams = 100`,
  `serving_desc = "100 g"`. Else per-serving → `calories = energy-kcal_serving`,
  `serving_grams = serving_quantity ?? null`, `serving_desc = serving_size ?? "1 serving"`.
- **kJ → kcal:** if no `energy-kcal_*` but `energy_*` (kJ) exists, convert `× 0.239006`.
- **salt → sodium:** if `sodium_*` present use it (g → mg `× 1000`); else if `salt_*` present derive
  sodium mg = `salt_g / 2.5 * 1000` (i.e. `salt_g × 400`). Confirm OFF sodium unit (grams) with researcher.
- `fiber_g`, `sat_fat_g`, `potassium_mg` (normalize to mg), `added_sugar_g` (prefer `added-sugars_*`,
  else leave null — do NOT substitute total `sugars`): all from the same per-100g/per-serving basis
  chosen above; **missing field → `null`** (never 0, never invented).
- `source`: a citation string like `"Open Food Facts <barcode>"` (+ retrieval note if desired).
- `fructose_level` / `fructans_level`: **hard-coded `'unknown'`** — the signature literal-types them
  so a coder physically cannot pass anything else.
**Reuse:** `FoodRow` from `src/lib/db/types.ts` for the `Pick`; the project's no-fabricated-data and
unknown-handling rules. Keep the mapper free of React/Supabase imports so the test is trivial.
**Acceptance:** typecheck passes; the mapper is a pure function (no imports beyond types); full test
matrix in Task 7 green; `fetchProductByBarcode` never throws (returns `'error'`/`'not-found'`).

---

## Task 4 — `BarcodeScanner` component (camera + decode + graceful states)

**Goal:** a self-contained scanner that opens the camera, decodes a barcode to a string, handles every
failure mode with a clear message, and **fully releases the camera stream on close/unmount**.
**Files:** `src/components/meals/BarcodeScanner.tsx`. (Optionally a tiny
`src/components/meals/useBarcodeDetector.ts` hook to isolate the native-vs-zxing detection + stream
lifecycle, keeping the component declarative — mirrors the Phase 2 `useIntervalTimer` split.)
**Behavior:**
- Render inside the existing `Dialog` (`variant="sheet"`, `title="Scan barcode"`). Show the live
  `<video>` preview with an aiming guide overlay and a Cancel button.
- **Detection path (D1):** if `('BarcodeDetector' in window)`, use it (`new BarcodeDetector({ formats:
  ['ean_13','ean_8','upc_a','upc_e','code_128'] })`) against frames from the stream. Else **lazy
  `import('@zxing/browser')`** and use its `BrowserMultiFormatReader` to decode from the video device.
- **On decode:** stop the stream immediately and call `onDetected(barcode: string)`; debounce so a
  single scan fires once.
- **Graceful states (each a distinct, friendly message — never a raw exception):**
  - *Permission denied* (`NotAllowedError`): "Camera permission denied. Enable it in your browser
    settings, or add the food manually." + a "Add manually" button.
  - *No camera* (`NotFoundError`/no video input): "No camera found. Add the food manually."
  - *Unsupported / insecure context* (no `getUserMedia`, or `BarcodeDetector` absent AND zxing import
    fails, or non-secure origin): "Scanning isn't available here. Add the food manually." (Links the
    HTTPS note conceptually.)
  - *Not found after scanning a while*: passive hint "Couldn't read a code — try better lighting or
    add manually." (no hard failure).
- **Lifecycle:** acquire the stream in an effect; in cleanup **stop all tracks**
  (`stream.getTracks().forEach(t => t.stop())`) and reset the zxing reader; also stop on a successful
  detect and on Cancel. No stream leak when the dialog closes or the component unmounts.
- **Entry point:** add a "Scan" button (lucide `ScanBarcode`/`Barcode` icon) to
  `src/components/meals/FoodSearch.tsx` next to the search input (and/or surfaced from `Meals.tsx`),
  visible only when `isSupabaseConfigured` and signed in (it leads to saving a user food). Opening it
  mounts `BarcodeScanner`.
**Reuse:** `Dialog`, `Button`, `Label` from `src/components/ui/`; `cn()`; lucide icons; the
unconfigured/signed-out gating already in `FoodSearch`/`Meals`. The component owns only camera/decode
concerns and emits `onDetected` / `onCancel` / `onManual`; the flow lives in Task 5.
**Acceptance:** opening the scanner shows a live preview on a supported secure-context browser; a
successful scan emits the decoded string once and the camera light turns off (stream released);
permission-denied / no-camera / unsupported each render their specific message with a manual-add
escape; closing the dialog or unmounting releases the stream (verify no active camera indicator).
Camera can't run headless → this component's happy path is **not** asserted in CI e2e (see Task 7).

---

## Task 5 — Scan → resolve → review/add → log flow

**Goal:** wire a scanned barcode through: (a) reuse an existing food if one matches, else (b) fetch
OFF, prefill a review/create form (with the FODMAP-not-verified notice + optional manual selectors),
save it as a user food, then open the existing `AddToLogDialog`. Handle OFF "not found" → manual entry.
**Files:**
- `src/components/meals/ProductReviewForm.tsx` (a.k.a. AddCustomFood) — the prefilled create-food form.
- Flow orchestration in `src/components/meals/FoodSearch.tsx` (it already owns `AddTarget` +
  `AddToLogDialog`), or a small `src/components/meals/ScanFlow.tsx` if `FoodSearch` gets too large.
**Flow:**
1. `BarcodeScanner.onDetected(barcode)` →
2. **Lookup existing:** `useFoodByBarcode(barcode)` (Task 6). If a row is found (user's saved row, or a
   future global row carrying a barcode) → skip straight to `AddToLogDialog` with
   `target = { name, food_id }`. (Dedup: re-scanning a saved product never re-creates it.)
3. **Else fetch OFF:** call `fetchProductByBarcode(barcode)`:
   - `'found'` → `mapOpenFoodFactsToFood(product, barcode)` → open `ProductReviewForm` prefilled.
   - `'not-found'` → open `ProductReviewForm` **empty** (manual entry), barcode prefilled so saving
     still tags it for future dedup. Message: "Product not in Open Food Facts — enter it manually."
   - `'error'` → inline retry + "enter manually" option.
4. **`ProductReviewForm`:** editable fields for name, brand, serving_desc, serving_grams, calories,
   fiber, sodium, sat fat, potassium, added sugar. It shows:
   - A **computed NOOM dot** via `noomColor(calories, serving_grams)` that updates live as the user
     edits (null grams → unknown dot — never a fabricated color).
   - A **prominent notice**: "FODMAP not verified — set fructose/fructans manually only if you know
     it." with **optional** `fructose_level` / `fructans_level` selectors **defaulting to `unknown`**.
     The `FodmapBadge` preview reflects `lowFodmapSafe(...)` → stays "Not verified" until the user
     explicitly sets both to a known level. **At no point can the OFF data set these.**
5. **Save:** `useCreateFood()` (Task 6) inserts `{ ...mapped/edited, user_id (auth), barcode,
   fructose_level, fructans_level }`. On the unique-index conflict (a concurrent dup) treat it as
   "already exists" → fetch by barcode and proceed to log. On success → open `AddToLogDialog` with the
   new `food_id`.
6. `AddToLogDialog` (unchanged) finishes the log entry.
**Reuse:** `AddToLogDialog` + `AddTarget` (unchanged), `useAddLogEntry` (unchanged), `noomColor`,
`lowFodmapSafe`, `FodmapBadge`, `NoomDot`, `Dialog`/`Input`/`Label`/`Button`, the
unconfigured/signed-out gating. Default-unknown FODMAP selectors mirror the safety rule in
`lowFodmapSafe`/`FodmapBadge`.
**Acceptance:** scanning a barcode already saved goes straight to the add dialog (no duplicate row);
scanning a new OFF product prefills the review form with mapped nutrients + a **computed** NOOM dot +
a **"Not verified"** FODMAP badge by default; saving creates a user food (`user_id` set, `barcode`
set, FODMAP unknown unless explicitly chosen) and then logs it; an OFF "not found" offers manual entry
that still tags the barcode; **at no step does an unedited scanned product display "Safe."**

---

## Task 6 — Data layer: `useFoodByBarcode`, `useCreateFood`

**Goal:** typed, null-guarded, user-scoped hooks for barcode lookup and user-food creation, plus the
`FoodRow.barcode` type field — reusing the existing add-to-log mutation untouched.
**Files:**
- `src/lib/db/types.ts` — add `barcode: string | null` to `FoodRow`.
- `src/lib/db/queryKeys.ts` — add `foodByBarcode: (userId, barcode) => ['foodByBarcode', userId,
  barcode] as const`.
- `src/lib/db/foods.ts` — add:
  - `useFoodByBarcode(barcode: string | null)` — query `foods` filtered to the user's row by barcode:
    `.eq('barcode', barcode)` (RLS already limits writable rows to the user; reads see global+own, so
    when matching also prefer the user's row — filter `user_id = auth uid OR user_id is null`, prefer
    own). Enabled only when `barcode` is set, `supabase !== null`, and signed in; otherwise disabled
    (returns no data, no throw). Single-row-ish result (`.limit(1)` / `.maybeSingle()`).
  - `useCreateFood()` — mutation inserting a user food: requires `useAuth().user.id`; throws when
    `supabase === null` or signed out (mirror `useAddLogEntry`); `.insert({ ...input, user_id })`,
    `fructose_level`/`fructans_level` default `'unknown'` if not provided; `.select('*').single()`;
    on success `invalidateQueries` the `foodByBarcode` key (and optionally `foodSearch`). Surface the
    unique-index conflict so Task 5 can treat it as "already exists."
- `src/lib/db/index.ts` — already a `export * from './foods'` barrel; no change unless new files added.
**Reuse:** the `supabase === null` disabled-query / throwing-mutation pattern + `useAuth()` scoping
from `foodLog.ts`; `queryKeys` factory; existing `useAddLogEntry` (do not modify — Task 5 calls it).
**Acceptance:** typecheck passes; `useFoodByBarcode` is disabled (no throw on render) when signed out
/ unconfigured / no barcode, and returns the user's matching row when present; `useCreateFood` inserts
with `user_id = auth.uid()` and unknown FODMAP defaults, invalidates the lookup key on success, and
its error surfaces the dup-conflict; reading back the created row shows `barcode` populated and FODMAP
`unknown`.

---

## Task 7 — Tests: unit (mapper) + component/e2e notes

**Goal:** lock the pure OFF→FoodRow mapping math and the manual-add path; document why the live camera
scan is not asserted in CI.
**Files:**
- `src/lib/openfoodfacts.test.ts` — the mapper matrix:
  - **per-100g only** → `serving_grams = 100`, `serving_desc = "100 g"`, `calories = energy-kcal_100g`,
    nutrients from `_100g`.
  - **per-serving present (no 100g)** → `serving_grams = serving_quantity`,
    `serving_desc = serving_size`, calories/nutrients from `_serving`.
  - **salt → sodium mg** conversion (e.g. `salt_100g = 1.0 g` → `sodium_mg = 400`).
  - **kJ → kcal** when only `energy_*` present (`× 0.239006`, rounded as the coder decides — assert
    within tolerance).
  - **missing fields → null** (fiber/sat-fat/potassium/added-sugar absent → `null`, never 0).
  - **serving grams unknown → `serving_grams = null`** so a downstream `noomColor` returns `null`.
  - **potassium normalized to mg** (assert the unit conversion the researcher confirms).
  - **added sugar**: present → mapped; absent → `null` (never substitute total `sugars`).
  - **FODMAP always `'unknown'`** on every case (and the type forbids anything else).
  - **empty/garbage product** → safe defaults (non-empty `name`/`serving_desc`, all nutrients null,
    FODMAP unknown).
  - Optional: a `noomColor(mapped.calories, mapped.serving_grams)` sanity assert showing a known
    density yields the expected color (ties the mapper to the existing computed-NOOM rule).
- `src/components/meals/ProductReviewForm.test.tsx` (optional, jsdom) — the FODMAP selectors default
  to `unknown` and the badge reads "Not verified"; choosing both → "Safe" only after explicit user
  action; the NOOM dot is computed from the edited calories/grams.
- `e2e/barcode.spec.ts` — mirror `e2e/meals.spec.ts` skip pattern (`test.skip(!hasCreds, ...)`,
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`). **The camera scan itself is NOT driven in headless CI**
  (no real camera; `BarcodeDetector`/`getUserMedia` unavailable). Two e2e-able paths:
  - **Manual-add path:** open the scan flow → choose "Add manually" → fill the review form → save →
    assert it logs and persists across reload (this exercises `useCreateFood` + `AddToLogDialog` end
    to end without a camera).
  - **Optional mocked-scan path:** stub `BarcodeDetector`/`getUserMedia` (or inject a test hook that
    feeds a fixed barcode) and mock `fetchProductByBarcode` to assert the review form prefills and the
    badge reads "Not verified." Gate behind an env flag; keep it skipped by default if flaky.
  - Document that the full happy-path scan is verified **manually on a device** (Task 1 testing note).
**Reuse:** Vitest jsdom + colocated tests; the meals e2e skip pattern + env conventions; the
"not-verified, never safe" assertion style from `e2e/meals.spec.ts` test 2.
**Acceptance:** `npm test` green incl. the full mapper matrix; `npm run e2e` green with creds for the
manual-add → log → reload path and skipped (not failed) without creds; `app.spec.ts`/`meals.spec.ts`
stay green; the manual device-test step for live scanning is documented.

---

## Suggested execution order & waves

- **Wave A (parallelizable, minimal data dependency):**
  - Task 1.5 (migration `0005`) — independent; unblocks the hooks + dedup.
  - Task 3 (OFF client + **pure mapper**) — needs the researcher's confirmed OFF field paths; the
    mapper test matrix (Task 7 unit half) lands with it. Independent of DB/UI.
  - Task 1 (dependency + secure-context doc) — after the researcher confirms the library pick (D1).
- **Wave B:** Task 6 (DB types + `useFoodByBarcode`/`useCreateFood`) — after Task 1.5 (needs the
  column + index) and the `FoodRow.barcode` type. Task 2 (RLS confirmation) gates it.
- **Wave C:** Task 4 (`BarcodeScanner` + scan entry-point) — after Task 1 (library). Independent of
  the DB once `onDetected` is the contract.
- **Wave D:** Task 5 (scan→resolve→review→log flow) — after Tasks 3 (mapper+fetch), 4 (scanner), and
  6 (hooks). The integrating task.
- **Wave E:** Task 7 e2e (manual-add path; optional mocked-scan) — after Task 5; unit mapper tests
  already landed in Wave A.

---

## Risks & things for the human to confirm

- **Camera secure-context in dev (D6).** Camera works on `localhost` (laptop) but **not** on a LAN IP
  from the phone over `http`. **Confirm** the owner will test phone scanning on the deployed HTTPS
  URL (recommended) or set up an HTTPS dev tunnel/cert. The UI degrades to "Scanning isn't available
  here — add manually" on insecure origins.
- **iOS Safari camera/BarcodeDetector quirks.** iOS Safari lacks `BarcodeDetector` (forces the zxing
  fallback) and is stricter about `getUserMedia` (must be a user gesture, HTTPS, `playsinline` on the
  video, and PWA-from-homescreen camera access has historically been flaky). **Confirm** whether iOS
  is a target now; if so, the zxing fallback + `playsinline` are mandatory and need device testing.
  If Android-only for v1, the native `BarcodeDetector` path is the priority and zxing is a nicety.
- **OFF CORS + User-Agent policy.** OFF v2 is browser-callable, but **confirm** (researcher) there is
  no CORS block from the app origin and whether OFF's policy effectively requires a `User-Agent`
  (browsers can't set it on `fetch`). If either is a problem, the fetch should route through a small
  **Supabase Edge Function proxy** (sets UA, sidesteps CORS, lets us add light caching). Flagged as a
  possible add-on; the pure mapper is unaffected either way.
- **OFF data gaps / quality.** Many products lack `serving_quantity`, potassium, added sugars, or only
  carry per-100g. The mapper must degrade to `null` (never 0/invented) and the review form lets the
  user fill gaps. **Confirm** the per-100g-first NOOM basis (D5) is acceptable (it gives the most
  reliable density; the displayed serving is "100 g" unless per-serving data exists).
- **Never "safe" for scanned products (D4).** The single most important safety rule: a scanned product
  is `unknown`/`unknown` → "Not verified," and the mapper's signature literal-types FODMAP to
  `'unknown'` so it's impossible to map OFF into a "safe" verdict. Manual selectors (default unknown)
  are the only route to a known level. Reviewer must assert this in the diff. **Confirm** the manual
  override is wanted in v1 (vs. always-unknown-until-a-later-FODMAP-data-phase).
- **PWA offline / OFF needs network.** OFF lookups require connectivity; the SW precaches app assets
  only (no OFF runtime cache today). Offline, scanning still decodes the barcode but the lookup
  fails → the flow falls back to manual entry (barcode still saved for dedup). **Confirm** that's the
  desired offline behavior, or whether a runtime cache / outbox for OFF (Phase 3 offline scope) is
  wanted now. Recommend deferring OFF runtime caching to the broader offline work.
- **Bundle size.** `@zxing/browser`+`@zxing/library` is the largest new asset. Mitigation: native
  `BarcodeDetector` (0 KB) is primary; zxing is dynamically imported only when needed and only on
  scanner open. **Confirm** acceptable; verify the separate chunk in `npm run build` output.
- **Dedup index vs. global barcoded foods.** The unique index is `(user_id, barcode)`. If a later
  phase adds **global** barcoded seed foods (`user_id` null), reads should prefer the user's row but
  still surface the global one; `useFoodByBarcode` must handle both. **Confirm** global barcoded foods
  are out of scope for now (assumed yes — scanned products are user-custom).

---

## Final verification (definition of done for Phase 3 — Barcode)

1. `npm run typecheck` + `npm run lint` clean.
2. `npm test` green, including the full `mapOpenFoodFactsToFood` matrix (per-100g, per-serving,
   salt→sodium, kJ→kcal, missing→null, grams-unknown→null serving_grams, potassium→mg, added-sugar
   present/absent, **FODMAP always unknown**, empty product).
3. Migration `0005_food_barcode.sql` applies cleanly after `0001`–`0004`; `(user_id, barcode)` dedup
   enforced; per-user scope verified; no RLS regression (Task 2 confirmation recorded).
4. Scanner opens a live camera preview on a supported secure-context browser, decodes once, and
   **releases the stream** on detect/close/unmount; permission-denied / no-camera / unsupported each
   render a specific message with a manual-add escape.
5. End-to-end flow works: scan-known → straight to add dialog (no dup); scan-new → review form
   prefilled with mapped nutrients + **computed** NOOM dot + **"Not verified"** FODMAP badge by
   default; save → user food (`user_id` + `barcode` set, FODMAP unknown unless explicitly chosen) →
   logged; OFF "not found" → manual entry that still tags the barcode.
6. **No scanned product ever displays "Safe"** without an explicit manual FODMAP override (reviewer-
   verified in the diff; asserted in the manual-add/mocked e2e).
7. `npm run e2e` green with creds for the manual-add → log → reload path; skipped (not failed) without
   creds; `app.spec.ts` + `meals.spec.ts` stay green. Live device scan verified manually per the
   Task 1 testing note.
