# Phase 3 — Photo → Meal Recognition (implementation plan)

> Planner output. The `coder` agent executes these tasks in order; `reviewer` + `tester` gate them.
> Mirrors the established Phase 1/2/3 conventions (`.planning/phase1-meals.md`,
> `.planning/phase3-barcode.md`): hand-authored DB types, foods-style RLS, typed null-guarded
> user-scoped TanStack Query hooks, **pure tested logic in `src/lib/`**, thin mobile-first
> components, and the project's non-negotiable health-data-safety posture:
> **an AI-identified food is `unknown`/`unknown` FODMAP → it reads "Not verified," NEVER "Safe."**
>
> **The barcode flow (`ScanFlow.tsx` → `ProductReviewForm.tsx` → `AddToLogDialog.tsx`) is the
> direct analog.** This feature reuses almost all of it; the only new machinery is (a) a
> server-side Claude vision Edge Function, (b) a client analyze wrapper with image downscaling,
> and (c) a multi-item review list (vs. the barcode flow's single product).

## Authoritative API facts (from the claude-api skill — DO NOT contradict; coder follows these)

- **Model:** `claude-opus-4-8` (vision-capable). Exact ID, no date suffix.
- **Vision input:** an image content block `{type:"image", source:{type:"base64",
  media_type:"image/jpeg", data:<b64 no newlines>}}` placed **before** the text block in the
  user message.
- **Structured output:** set `output_config:{format:{type:"json_schema", schema:<SCHEMA>}}` on the
  request. Every schema object needs `additionalProperties:false` + `required`. Guarantees a
  parseable food list — **prefer it over free-text parsing.** Incompatible with citations and with
  assistant prefill (we use neither).
- **max_tokens:** ~2048 is plenty for a food list. Non-streaming is fine (short output).
- **Thinking:** OMIT it (decision below — phone latency).
- **Image size/cost:** an image is ~1.6k–4.8k input tokens. The **client must downscale to
  ~1568px long edge and re-encode JPEG q~0.8** before upload — controls cost, stays far under the
  32MB request limit.
- **API key:** server-only `ANTHROPIC_API_KEY` as a Supabase Edge Function secret. **NEVER** a
  `VITE_` var, never in the client bundle, never committed.
- **Transport:** the Deno Edge Function calls Claude via **raw `fetch`** to
  `https://api.anthropic.com/v1/messages` (headers `x-api-key`, `anthropic-version: 2023-06-01`,
  `content-type: application/json`). Dependency-free; recommended over the SDK for Deno.

## What's already built (ground truth — reuse, don't rebuild)

- **Client auth/session** (`src/lib/supabase.ts`, `src/lib/auth.tsx`): `supabase` is a nullable
  singleton; `isSupabaseConfigured` gates features; `supabase.auth.getSession()` yields
  `session.access_token` (the user JWT to send to the Edge Function). `useAuth()` exposes `user`.
- **Edge runtime:** none yet — `supabase/functions/` does not exist. `config.toml` is minimal
  (project_id, db, auth). Supabase CLI is the deploy path (README already documents `supabase`
  CLI usage and the **server-only, non-`VITE_`** secret convention for the seed script).
- **Foods DB + hooks** (`src/lib/db/foods.ts`): `useFoodSearch(term)` (ilike name, ≥2 chars,
  null-guarded), `useFoodByBarcode`, and **`useCreateFood()`** (inserts a user-custom food with
  `user_id = auth.uid()`, FODMAP defaulting to `'unknown'`, `source`/`barcode` optional). **No new
  hook is required for this feature** — photo items match an existing food (via search) or are
  saved through `useCreateFood`. `CreateFoodInput` already accepts `source` (use it to cite "Photo
  estimate (AI)") and `barcode` (left null for photo items).
- **Review form** (`src/components/meals/ProductReviewForm.tsx`): takes a `prefill: MappedFood |
  null` + `barcode` + `onSaved(food)`, defaults FODMAP to `'unknown'` (badge "Not verified"),
  computes the NOOM dot **live** from edited calories ÷ grams via `noomColor`, and saves through
  `useCreateFood`. **Reused as-is** for the "custom food" branch of each photo item. The
  `MappedFood` prefill type (`src/lib/openfoodfacts.ts`) is the natural prefill carrier — the
  analyze mapper produces the same shape (see Task 3).
- **Flow orchestration** (`src/components/meals/ScanFlow.tsx`): a `Step` state machine
  (scanning → looking-up → review → log) that wires the scanner → lookup → `ProductReviewForm`
  → `AddToLogDialog`. `PhotoMealFlow` mirrors this exactly, swapping "scan one barcode" for
  "analyze one photo → review a LIST of items."
- **Add-to-log** (`src/components/meals/AddToLogDialog.tsx`): `AddTarget { name, food_id?,
  recipe_id? }` + meal/servings picker → `useAddLogEntry`. **Reused unchanged**, called per item.
- **Search-to-match** (`src/components/meals/FoodSearch.tsx`): the `useFoodSearch` + `FoodItemRow`
  + `+`-to-`AddTarget` pattern is reused inside the per-item "match to a real food" picker.
- **Diet components** (`src/components/diet/`): `FodmapBadge` (renders not-verified as neutral,
  never green), `NoomDot` (null → unknown dot), `Disclaimer` (medical + "Not verified" copy).
  Diet logic `noomColor`, `lowFodmapSafe` in `src/lib/diet/`. Reuse all as-is.
- **Tests:** Vitest (jsdom), colocated `*.test.ts(x)`, `npm test`. Playwright `e2e/` with the
  skip-when-no-creds pattern (`test.skip(!hasCreds, ...)`, env `E2E_TEST_*`) — `e2e/meals.spec.ts`,
  `e2e/barcode.spec.ts`. Mirror them.

**Gaps this feature fills:** no `supabase/functions/` dir / no Edge Function; no Claude vision
call anywhere; no image downscale utility; no client analyze wrapper; no multi-item photo review
UI; no photo entry point; no tests for downscale math, response parsing, or the review→match→log
path.

---

## Decisions made up front (confirm before coding — see Risks)

- **D1 — Edge Function transport = raw `fetch`** to `https://api.anthropic.com/v1/messages`
  (per the API facts). No `npm:@anthropic-ai/sdk` dependency. Headers `x-api-key`,
  `anthropic-version: 2023-06-01`, `content-type: application/json`.
- **D2 — The Edge Function VERIFIES the caller's Supabase JWT before calling Claude.** It reads
  `Authorization: Bearer <jwt>` and validates via a Supabase client built from the auto-injected
  `SUPABASE_URL` + `SUPABASE_ANON_KEY`, calling `auth.getUser(jwt)`. A missing/invalid token →
  **401**, never reaching Claude. This stops the function being an open proxy that burns the API
  key. (Single-user app, but the key must still be protected.)
- **D3 — The Claude response schema/prompt carries NO FODMAP or safety field.** The model only
  **identifies foods + estimates portions/calories + a confidence**. It must never assert a food
  is "safe," "low FODMAP," or trigger-free. FODMAP only becomes known when the user (a) matches
  the item to a low/low DB food or (b) sets the levels manually in `ProductReviewForm`. This is the
  single most important safety rule, mirroring barcode D4.
- **D4 — Thinking is OMITTED** (phone latency UX). The task is simple identification; structured
  output already constrains the result. If accuracy proves poor in manual testing, revisit with
  low-effort adaptive thinking — but default off.
- **D5 — Client downscales the image to ~1568px long edge, JPEG q~0.8, before upload.** A pure
  `targetDimensions(width, height, maxEdge)` helper (no canvas) is **unit-tested**; the canvas
  draw/encode is a thin shell around it. This mirrors the diet-lib "pure logic, thin shell" rule.
- **D6 — Each analyzed item defaults to the "custom food" path with FODMAP `unknown`.** The user
  may optionally match it to a real DB food (gaining cited FODMAP/NOOM) before logging. Nothing the
  AI returns is ever treated as authoritative for FODMAP or even nutrition — estimates are editable
  starting points.
- **D7 — Feature requires network and a configured, signed-in account.** Like OFF lookups, the
  analyze call needs connectivity + the deployed Edge Function. The Photo button is gated by
  `isSupabaseConfigured && !!user` (same gate as the Scan button). Offline / unconfigured → the
  button is hidden or the flow degrades to a clear "needs a connection" message; the user can
  still add foods manually via the existing search.
- **D8 — Image stays in memory; it is NOT persisted.** The base64 is sent to the Edge Function and
  discarded. No image upload to Supabase Storage, no DB column for the photo (out of scope; revisit
  if a meal-photo history is wanted later).

---

## Task 1 — Supabase Edge Function `analyze-meal` (Deno, server-side Claude vision)

**Goal:** a deployed function that authenticates the caller, calls Claude vision with a structured
schema, and returns a typed `{ items: [...] }` list with **no FODMAP/safety data**.
**Files:**
- `supabase/functions/analyze-meal/index.ts` (new; creates `supabase/functions/`).
- `supabase/functions/_shared/cors.ts` (small shared CORS helper; conventional Supabase layout).
- Optionally `supabase/functions/analyze-meal/deno.json` if import-mapping is needed (raw `fetch`
  means likely none).

**Request contract (POST JSON):**
```ts
// Body
{ image_base64: string;   // no data: prefix, no newlines
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' }  // client sends image/jpeg (D5)
```
**Response contract (200):**
```ts
{ items: AnalyzedItem[] }
// AnalyzedItem (this is ALSO the per-item shape in the Claude json_schema):
{ name: string;
  quantity_desc: string;            // e.g. "1 cup", "2 slices"
  estimated_grams: number | null;
  estimated_calories: number | null;
  confidence: 'low' | 'medium' | 'high' }
```
**Claude `json_schema` (CRITICAL — no FODMAP/safety field anywhere):**
```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "quantity_desc", "estimated_grams",
                     "estimated_calories", "confidence"],
        "properties": {
          "name":               { "type": "string" },
          "quantity_desc":      { "type": "string" },
          "estimated_grams":    { "type": ["number", "null"] },
          "estimated_calories": { "type": ["number", "null"] },
          "confidence":         { "type": "string", "enum": ["low", "medium", "high"] }
        }
      }
    }
  }
}
```
**Prompt (system/user text) requirements:**
- Identify each distinct food/drink visible; estimate portion (`quantity_desc`), grams, calories,
  and a confidence. Use `null` for grams/calories you cannot estimate (never guess wildly; never 0
  to mean unknown).
- If no food is visible, return `{ "items": [] }`.
- **MUST NOT** include or imply any allergen/FODMAP/"safe"/diet-suitability claim. Identify and
  estimate portions only. (The schema has no field for it; the prompt reinforces it.)

**Claude request body (assembled in the function):**
```ts
{ model: 'claude-opus-4-8',
  max_tokens: 2048,
  // no thinking (D4)
  output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type, data: image_base64 } }, // BEFORE text
    { type: 'text', text: PROMPT },
  ]}] }
```
**Auth (D2):** read `Authorization` header; if absent/not `Bearer ` → 401. Build a Supabase client
from `Deno.env.get('SUPABASE_URL')` + `Deno.env.get('SUPABASE_ANON_KEY')` (auto-injected in the
Functions runtime) and call `auth.getUser(token)`; on error/no user → 401. Only then read
`ANTHROPIC_API_KEY` and call Claude.
**Error handling (each returns clean JSON, never a stack trace):**
- 401 `{ error: 'unauthorized' }` — missing/invalid JWT.
- 400 `{ error: 'bad_request' }` — missing `image_base64`/`media_type`, or wrong media_type.
- 502 `{ error: 'analyze_failed' }` — Claude non-2xx or unparseable body (log the upstream status
  server-side; do not leak the key or raw upstream error to the client).
- 200 `{ items: [] }` — valid call, no food found (NOT an error).
**CORS (document + implement):** handle `OPTIONS` preflight (return 204 with the CORS headers);
on the POST set `Access-Control-Allow-Origin` (the app origin — env-driven `ALLOWED_ORIGIN`, or a
documented dev `*` only for local), `Access-Control-Allow-Headers: authorization, content-type`,
`Access-Control-Allow-Methods: POST, OPTIONS`. The `_shared/cors.ts` helper centralizes these.
**Env used:** `ANTHROPIC_API_KEY` (set as a secret — Task 2), `SUPABASE_URL`, `SUPABASE_ANON_KEY`
(auto-injected). Optionally `ALLOWED_ORIGIN`.
**Reuse:** the project's server-only-secret discipline (mirrors the seed script's non-`VITE_`
env). No app-code imports — this is Deno, isolated under `supabase/functions/`.
**Acceptance:**
- `supabase functions serve analyze-meal` runs locally; an unauthenticated POST → 401; a POST with
  a valid local user JWT + a small base64 JPEG returns `{ items: [...] }` matching the schema
  (verify with a hand-crafted test image of a known food).
- The response contains **no** FODMAP/safety/diet field (reviewer greps the schema + a live
  response).
- A malformed body → 400; a forced Claude failure (e.g. bad key in a scratch run) → 502 with a
  generic message and **no key leakage**.
- `OPTIONS` preflight returns the CORS headers; a browser call from the app origin is not blocked.

---

## Task 2 — Deploy/config docs + secret management

**Goal:** document exactly how the owner deploys the function, sets the secret server-side, and the
absolute rule that the key never touches the client.
**Files:** `supabase/README.md` (add an "Edge Functions" section); optionally note in
`.env.example` that `ANTHROPIC_API_KEY` is **server-only / Functions secret**, NOT a client var.
**Content (must be written):**
- Set the secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` (never committed, never
  `VITE_`-prefixed, never in `.env.local` consumed by Vite).
- Deploy: `supabase functions deploy analyze-meal`.
- Local testing: `supabase functions serve analyze-meal` (loads secrets from
  `supabase/functions/.env` or `--env-file`; that file is git-ignored). Note that
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` are auto-injected in the hosted runtime but may need to be
  provided for `serve`.
- The function URL the client calls: `${VITE_SUPABASE_URL}/functions/v1/analyze-meal` (the
  client derives it from the already-configured Supabase URL — no new client env var).
- State plainly: **the Anthropic key lives ONLY as a Supabase Functions secret; it is never in the
  client bundle, never committed, and the function rejects unauthenticated callers so it can't be
  abused as a free proxy.**
**Reuse:** the README's existing server-only-secret framing (seed script section).
**Acceptance:** a reader can deploy the function, set the secret, and run it locally from the docs
alone; reviewer confirms no `VITE_ANTHROPIC*` anywhere and `.env.example` does not list the key as
a client var.

---

## Task 3 — Client analyze wrapper + PURE downscale helper

**Goal:** a typed client module that downscales the captured/chosen image, POSTs it to the Edge
Function with the user's access token, and returns typed items — with the image math isolated and
unit-tested.
**Files:**
- `src/lib/analyzeMeal.ts` — `targetDimensions` (pure), `downscaleImageToJpegBase64` (canvas
  shell), `analyzeMeal(file)` (network), and the `AnalyzedItem` type. Optionally a thin
  `useAnalyzeMeal()` hook wrapping `analyzeMeal` if the UI prefers a mutation (recommended:
  a TanStack `useMutation` so loading/error states match the rest of the app).
- `src/lib/analyzeMeal.test.ts` — `targetDimensions` matrix + response-parse/typing tests.

**Signatures:**
```ts
export interface AnalyzedItem {
  name: string
  quantity_desc: string
  estimated_grams: number | null
  estimated_calories: number | null
  confidence: 'low' | 'medium' | 'high'
}

// PURE — no canvas, no DOM. Scales the long edge down to maxEdge, never UP.
export function targetDimensions(
  width: number, height: number, maxEdge = 1568,
): { width: number; height: number }

// Thin canvas shell around targetDimensions: draw → toDataURL('image/jpeg', 0.8) → strip prefix.
export async function downscaleImageToJpegBase64(file: File): Promise<{
  base64: string; media_type: 'image/jpeg'
}>

// Network: downscale, get the session token, POST to the Edge Function, return typed items.
// Returns [] when the function reports no food. THROWS a typed error on 401/network/502 so the
// UI can show a retry; null-guards `supabase`/session (unconfigured/offline → friendly throw).
export async function analyzeMeal(file: File): Promise<AnalyzedItem[]>
```
**`targetDimensions` contract (the tested logic):**
- If `max(width,height) <= maxEdge` → return the input unchanged (never upscale).
- Else scale both dims by `maxEdge / max(width,height)`, round to integers, preserve aspect ratio.
- Handle the square case and the portrait/landscape cases symmetrically; guard non-finite/≤0 input
  (return a safe default or the input — coder decides, test it).
**`analyzeMeal` contract:**
- Guard `supabase === null` → throw a friendly "needs a connection" error (the UI gates on this
  anyway, defense in depth).
- `const { data } = await supabase.auth.getSession()`; no `session?.access_token` → throw "sign in
  to use photo recognition."
- `downscaleImageToJpegBase64(file)` → POST `${supabaseUrl}/functions/v1/analyze-meal` with
  headers `Authorization: Bearer <access_token>`, `content-type: application/json` and body
  `{ image_base64, media_type }`.
- Parse the JSON; validate the `items` array shape defensively (drop/ignore malformed items rather
  than trust blindly — the array could be empty); return `AnalyzedItem[]`.
- Non-2xx → throw with a message mapped from the status (401 → "session expired," 502 → "couldn't
  analyze the photo, try again").
**Reuse:** `supabase` + `isSupabaseConfigured` from `src/lib/supabase.ts`; the
`import.meta.env.VITE_SUPABASE_URL` already used to build the client (for the function URL).
**Acceptance:** `targetDimensions` test matrix green (landscape, portrait, square, already-small →
unchanged, non-finite guard); `analyzeMeal` returns typed items from a mocked `fetch`, returns `[]`
on `{items:[]}`, throws mapped errors on 401/502/network, and throws when unconfigured/signed out
(mocked). Typecheck/lint clean.

---

## Task 4 — `PhotoMealFlow` UI (capture → analyze → multi-item review → match/custom → log)

**Goal:** mirror `ScanFlow`'s state machine but for a photo that yields a **list** of items the
user reviews one at a time: match each to a real DB food (cited FODMAP/NOOM) OR keep as a custom
food (FODMAP "Not verified"), then log it at the chosen meal/servings.
**Files:**
- `src/components/meals/PhotoMealFlow.tsx` (new; mirrors `ScanFlow.tsx`).
- A small per-item match picker — either reuse a trimmed `FoodSearch`-style search inside the flow,
  or a new lightweight `src/components/meals/FoodMatchPicker.tsx` (search via `useFoodSearch`,
  render `FoodItemRow`s, emit a chosen `food_id`). Recommended: a dedicated picker so `FoodSearch`
  stays page-scoped.
- Add a **Photo button** to `src/components/meals/FoodSearch.tsx` next to the Scan button
  (lucide `Camera`), gated by `canScan` (== `isSupabaseConfigured && !!user`; rename the gate to
  `canCapture` or add a sibling `canPhoto`).
**Image input:** a hidden `<input type="file" accept="image/*" capture="environment">` triggered by
the Photo button. On phone this opens the rear camera; on laptop it opens the file picker. (No
custom camera/`getUserMedia` needed — the file input handles both, which also keeps it testable.)
**State machine (`Step`):**
```ts
type Step =
  | { kind: 'idle' }                                   // pick/capture an image
  | { kind: 'analyzing' }                              // analyzeMeal in flight (loading)
  | { kind: 'error'; message: string }                // analyze failed → retry / cancel
  | { kind: 'review'; items: AnalyzedItem[]; index: number }  // walking the list
  | { kind: 'match'; item: AnalyzedItem }             // searching DB to match this item
  | { kind: 'custom'; item: AnalyzedItem }            // ProductReviewForm prefilled from the item
  | { kind: 'log'; target: AddTarget; defaultServings?: number }  // AddToLogDialog
```
**Flow:**
1. Photo button → file input change → `setStep({kind:'analyzing'})` → `analyzeMeal(file)`.
   - throws → `{kind:'error', message}` with a Retry (re-pick) + Cancel.
   - `[]` (no food) → a friendly "No food recognized — search or add manually" state (offer the
     normal search), then close.
   - items → `{kind:'review', items, index:0}`.
2. **Review list:** for the current item show `name`, `quantity_desc`, estimated grams/calories,
   and a **confidence chip** (low/medium/high — low styled as a caution). Two actions per item:
   - **"Match to a food"** → `{kind:'match', item}` → `FoodMatchPicker` (uses `useFoodSearch`,
     prefilled with the item name as the initial query) → on choose → `{kind:'log', target:
     {name, food_id}}` (the matched food carries its real cited FODMAP/NOOM).
   - **"Add as custom"** → `{kind:'custom', item}` → `ProductReviewForm` with a prefill mapped from
     the item (see mapper below), `barcode={null}` → on `onSaved(food)` → `{kind:'log', target:
     {name, food_id}}`.
   - Optional **"Skip"** to advance without logging.
   - After logging/skipping an item, advance `index`; when past the last item, close the flow.
3. `AddToLogDialog` (unchanged) finishes each log entry; on close advance to the next item.
**Item → `MappedFood` prefill (for the custom branch — keep this mapping tiny and local or in
`analyzeMeal.ts`):** map `{ name, serving_desc: quantity_desc, serving_grams: estimated_grams,
calories: estimated_calories, source: 'Photo estimate (AI) — verify', fructose_level:'unknown',
fructans_level:'unknown', brand:null, sodium_mg:null, sat_fat_g:null, potassium_mg:null,
fiber_g:null, added_sugar_g:null, barcode:'' }`. (Reuses the `MappedFood` shape so
`ProductReviewForm` consumes it unchanged. FODMAP is literal `'unknown'`; `ProductReviewForm`
already forces the selectors to unknown on open regardless.)
**Always-visible safety copy:** an "AI estimate — verify before trusting" notice on the review list
+ the existing `ProductReviewForm` "FODMAP not verified" banner + the `Disclaimer`. Low-confidence
items get an extra inline caution.
**Reuse:** `ScanFlow`'s `Step`/orchestration shape; `ProductReviewForm` (custom branch);
`AddToLogDialog` + `AddTarget` (unchanged); `useFoodSearch` + `FoodItemRow` (match picker);
`useCreateFood` (via `ProductReviewForm`); `NoomDot`/`FodmapBadge`/`Disclaimer`; `Dialog`/`Button`
from `ui/`; lucide `Camera`. The `canScan` gate in `FoodSearch`.
**Acceptance:**
- The Photo button appears only when configured + signed in; tapping it opens the OS
  camera/file picker.
- A (mocked in tests; real on device) analyze response renders a multi-item review list with
  name + portion + confidence and the "AI estimate — verify" notice.
- Matching an item to a DB food logs it with that food's real FODMAP/NOOM; adding as custom opens
  the prefilled `ProductReviewForm` showing a **computed** NOOM dot and a **"Not verified"** FODMAP
  badge by default, saves a user food (FODMAP unknown unless the user set it), then logs it.
- No-food and analyze-error states render friendly messages with escapes; closing mid-flow leaves
  no dangling dialogs.
- **At no step does an AI-identified item display "Safe"** unless the user matched it to a low/low
  DB food or set the levels manually.

---

## Task 5 — Health-safety verification (cross-cutting, reviewer-enforced)

**Goal:** make the safety invariant explicit and checkable across the whole feature.
**Files:** none new — this is an audit + the acceptance language the reviewer enforces; capture the
checklist in the PR description.
**Invariants to verify in the diff:**
1. The Edge Function `json_schema` has **no** FODMAP/allergen/safety/diet-suitability field, and the
   prompt forbids such claims. The function response carries portion/calorie estimates only.
2. `AnalyzedItem` (client) has no FODMAP field; the item→prefill mapping hard-codes
   `fructose_level:'unknown'`, `fructans_level:'unknown'`.
3. The only paths to a non-unknown FODMAP verdict are (a) matching to an existing DB food whose
   levels are cited, or (b) the user explicitly setting both selectors in `ProductReviewForm`.
4. The NOOM dot in the custom branch is **computed** via `noomColor`, never derived from the AI's
   calorie/gram numbers as an authoritative label (they're editable inputs to the computation).
5. The "AI estimate — verify" notice + `Disclaimer` are visible throughout the flow.
**Reuse:** the identical invariant set proven for the barcode flow (D4 there); `lowFodmapSafe` /
`FodmapBadge` neutral-on-unknown behavior.
**Acceptance:** reviewer signs off that no code path lets an AI-identified item render "Safe"
without explicit user action, and that the Edge response/schema is FODMAP-free.

---

## Task 6 — Tests

**Goal:** lock the pure downscale math + response parsing, and the review→match/custom→log UI path,
and document why the live camera/AI happy path is not asserted in CI.
**Files:**
- `src/lib/analyzeMeal.test.ts`:
  - `targetDimensions`: landscape (4000×3000 → 1568×1176), portrait (3000×4000 → 1176×1568),
    square (2000×2000 → 1568×1568), already-small (800×600 → unchanged), non-finite/≤0 guard.
  - `analyzeMeal` (mock `fetch` + `supabase.auth.getSession`): valid `{items:[...]}` → typed array;
    `{items:[]}` → `[]`; malformed item dropped; 401 → mapped throw; 502 → mapped throw;
    `supabase===null`/no session → friendly throw.
- `src/components/meals/PhotoMealFlow.test.tsx` (jsdom, optional but recommended): mock
  `analyzeMeal` to return two items; assert the review list renders both with confidence; the
  custom branch opens `ProductReviewForm` with the prefilled name/portion and a **"Not verified"**
  badge by default; choosing both FODMAP levels flips the badge only after explicit action.
- Edge Function contract test (if feasible in the toolchain): a Deno test (or a node test that
  imports the schema constant) asserting the `json_schema` has no FODMAP-ish key and that a mocked
  Claude `fetch` 401-path and no-food path are handled. If a Deno test runner isn't wired into CI,
  at minimum unit-test the request-body builder / schema constant by exporting it.
- `e2e/photo-meal.spec.ts`: mirror `e2e/barcode.spec.ts` skip pattern (`test.skip(!hasCreds)`,
  `E2E_TEST_*`). **The OS camera + real Claude call are NOT driven in headless CI.** E2E-able path:
  intercept the `analyze-meal` function request (Playwright `page.route`) and return a fixed
  `{items:[...]}`, set the file input to a fixture image, then drive review → custom → save → log →
  assert it persists across reload and the badge reads "Not verified." Document that the true
  device path (real camera + real Claude) is verified **manually**.
**Reuse:** Vitest jsdom + colocated tests; the meals/barcode e2e skip + `page.route` mocking
conventions; the "not-verified, never safe" assertion style.
**Acceptance:** `npm test` green incl. the full `targetDimensions` matrix and `analyzeMeal` parse
cases; `npm run e2e` green with creds for the mocked-analyze → custom → log → reload path and
skipped (not failed) without creds; existing `app.spec.ts`/`meals.spec.ts`/`barcode.spec.ts` stay
green.

---

## Suggested execution order & waves

- **Wave A (parallelizable):**
  - **Task 1** (Edge Function) — independent; needs only the API facts. Deployable + testable with
    `functions serve` on its own.
  - **Task 3** (client wrapper + pure downscale) — independent of the UI; its `targetDimensions`
    + parse tests land with it. Can stub the function URL until Task 1 is deployed.
- **Wave B:** **Task 2** (deploy/secret docs) — alongside/just after Task 1 (documents how to run
  what Task 1 built).
- **Wave C:** **Task 4** (`PhotoMealFlow` UI + Photo entry point) — after Tasks 3 (wrapper) and 1
  (function to call). Reuses `ProductReviewForm`/`AddToLogDialog`/`useFoodSearch` already in repo.
- **Wave D:** **Task 5** (safety audit) — continuous, finalized when Task 4 lands.
- **Wave E:** **Task 6** e2e (mocked-analyze path) — after Task 4; unit tests already landed in A.

---

## Risks & things for the human to confirm

- **API key exposure (highest priority).** The key must live ONLY as a Supabase Functions secret
  (Task 2). Reviewer must confirm no `VITE_ANTHROPIC*`, nothing in the bundle, nothing committed.
  **Confirm** the owner sets it via `supabase secrets set` before the client ships.
- **Open-proxy abuse / Edge auth (D2).** Without JWT verification the function is a free Claude
  proxy on the owner's dime. The function rejects unauthenticated callers (401 before any Claude
  call). **Confirm** the JWT check is acceptable as the sole gate (single-user app; could add a
  rate limit later — flagged, not built now).
- **CORS.** The browser calls the function cross-origin; the function must answer the `OPTIONS`
  preflight and set allow-origin to the app origin (env-driven). A `*` origin is acceptable only
  for local dev. **Confirm** the production app origin so `ALLOWED_ORIGIN` can be set, or accept the
  Supabase default (Supabase's own gateway often handles CORS for invoked functions — verify in the
  target setup; the function still sets headers defensively).
- **Image size / cost.** Each call sends one image (~1.6k–4.8k input tokens) + a short prompt and
  caps output at 2048 tokens. The client downscale (D5) keeps cost/payload bounded and far under
  the 32MB limit. **Confirm** the per-call cost is acceptable for personal use (a handful of calls
  per day is negligible).
- **Model latency on phone.** A non-streaming Opus vision call on a multi-item plate can take
  several seconds. Mitigation: a clear "Analyzing photo…" loading state, thinking omitted (D4), and
  the user can cancel. **Confirm** non-streaming is acceptable; if latency feels bad in manual
  testing, consider streaming (more code) or it's fine for a short list.
- **AI hallucinating / mis-identifying foods.** The model may invent or misname items or
  mis-estimate portions. Mitigations: mandatory per-item user review, a confidence flag (low styled
  as caution), all estimates editable, and — critically — **no FODMAP/safety claim ever comes from
  the model** (D3). **Confirm** the mandatory-review UX (no "log all" shortcut that bypasses review)
  is acceptable.
- **Offline / unconfigured (D7).** The feature requires network + a deployed function + sign-in.
  The Photo button is hidden when not configured/signed in; an analyze attempt while offline shows
  a friendly error and the user can still add foods manually. **Confirm** that graceful degradation
  (vs. queuing photos offline) is the desired v1 behavior — recommend deferring offline photo
  queueing to the broader Phase 3 offline work.
- **Image privacy / retention (D8).** The photo is sent to Anthropic for analysis and not stored by
  the app. **Confirm** the owner is comfortable sending meal photos to the Anthropic API; note it
  in the disclaimer if desired. No meal-photo history is built (out of scope).
- **Structured-output support assumption.** The plan relies on `output_config` json_schema on
  `claude-opus-4-8` (per the API facts). If a deployment ever targets a model lacking it, the
  function would need a free-text-parse fallback — out of scope; flagged.

---

## Final verification (definition of done — Phase 3 Photo→Meal)

1. `npm run typecheck` + `npm run lint` clean.
2. `npm test` green, incl. the full `targetDimensions` matrix and `analyzeMeal` parse/error cases
   (valid items, empty, malformed-dropped, 401/502/network throws, unconfigured/signed-out throw).
3. `supabase functions deploy analyze-meal` works; the deployed function: rejects unauthenticated
   callers (401), returns `{items:[...]}` matching the schema for a real food photo, returns
   `{items:[]}` for a no-food image, returns clean 400/502 on bad input / upstream failure, and
   handles the CORS preflight. **No FODMAP/safety field in the schema or response** (reviewer-grep).
4. The Anthropic key exists ONLY as a Functions secret — not in the bundle, not committed, not
   `VITE_`-prefixed (reviewer-verified); deploy/secret docs in `supabase/README.md`.
5. End-to-end UI: Photo button (configured+signed-in only) → OS camera/file picker → "Analyzing…"
   → multi-item review list with confidence + the "AI estimate — verify" notice → per item, match
   to a DB food (real FODMAP/NOOM) **or** add as a custom food (prefilled `ProductReviewForm`,
   **computed** NOOM dot, **"Not verified"** badge by default) → logged via `AddToLogDialog`.
6. **No AI-identified item ever displays "Safe"** without the user matching it to a low/low DB food
   or explicitly setting both FODMAP levels (reviewer-verified; asserted in the mocked e2e/unit).
7. `npm run e2e` green with creds for the mocked-analyze → custom → log → reload path; skipped (not
   failed) without creds; existing specs stay green. Real camera + real Claude path verified
   manually per the Task 2 testing notes.
