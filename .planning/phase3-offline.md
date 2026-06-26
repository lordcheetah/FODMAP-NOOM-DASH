# Phase 3 — Offline-First (cache reads, queue + sync writes, sync UI)

Status: PLAN (planner). Coder executes; reviewer + tester gate.
Companion research: `.planning/phase3-offline-research.md` (concurrent — recommended approach
assumed below; if it lands differently, coder adapts).

## Goal

Make the app usable with no network:

- Reads (food log, daily targets, workout log, food search results already fetched) render from a
  persisted cache after reload while offline.
- Writes (log meals/workouts, edit targets, create foods) succeed offline: applied optimistically,
  **paused** by TanStack Query, persisted, and **resumed** on reconnect/reload.
- A small, unobtrusive UI indicator shows offline state and a "N changes pending sync" count that
  clears once flushed.

## Approach (assumed from research)

TanStack Query **persistence + paused mutations**:

- IndexedDB persistence via **Dexie** (already a dep, `^4.0.8`) behind a custom async-storage
  persister + `PersistQueryClientProvider`.
- `QueryClient` default `networkMode: 'offlineFirst'` so queries serve cache and mutations pause
  instead of failing when offline.
- `queryClient.setMutationDefaults(mutationKey, { mutationFn, onMutate, onError, onSettled })` for
  **every** write, registered at startup so paused mutations can be **re-hydrated and resumed after
  a full reload** (the #1 trap: a paused mutation deserialized from disk has its `mutationFn`
  STRIPPED — it can only resume if a default keyed by the same `mutationKey` is registered before
  resume).
- Optimistic `onMutate` updates the date/user-keyed cache; `onError` rolls back; `onSettled`
  invalidates.
- `resumePausedMutations()` on rehydrate `onSuccess` and on `onlineManager` reconnect.

## Health-data-safety constraints (must hold)

- Offline must NEVER turn an `unknown` FODMAP value into "safe." Optimistic rows carry the real
  food/recipe FODMAP levels (or `unknown`); the existing `lowFodmapSafe`/`recipeRollup` logic in
  `src/lib/diet/` runs unchanged on optimistic data. Do not synthesize FODMAP levels for a
  create-food-while-offline; `useCreateFood` already defaults to `'unknown'` — keep that.
- A new custom food created offline defaults FODMAP to `'unknown'`; that must survive the queue/resume
  round-trip (no defaulting to safe anywhere in the optimistic path).

---

## Packages to add

- `@tanstack/react-query-persist-client` (PersistQueryClientProvider, persistQueryClient).
- `@tanstack/query-persist-client-core` is pulled transitively; pin the same major (`^5`) as
  `@tanstack/react-query` already in `package.json`.
- No new IndexedDB lib — reuse `dexie`.

Acceptance: `npm install` clean; versions match the v5 line; `npm run typecheck` green.

---

## Task list (ordered)

### Wave A — Persistence infrastructure

#### A1. Dexie-backed async-storage persister adapter
- **Goal:** an `AsyncStorage`-shaped adapter (`getItem`/`setItem`/`removeItem`) over a Dexie table,
  consumable by `createAsyncStoragePersister` (from `@tanstack/query-async-storage-persister`).
- **New file:** `src/lib/offline/dexiePersister.ts`.
- **Reuse:** `dexie` (existing dep). Mirror the lightweight singleton pattern used in
  `src/lib/supabase.ts` (module-level instance, guard for unsupported env).
- **Shape:**
  - A Dexie DB `tanstackQueryCache` with one table `kv` keyed by `key` storing `{ key, value }`
    (value is the serialized dehydrated cache string).
  - `dexieStorage: AsyncStorage` = `{ getItem(key), setItem(key, value), removeItem(key) }`,
    each returning a Promise; `getItem` returns `string | null`.
  - Export a factory `createDexiePersister()` that wraps `dexieStorage` with
    `createAsyncStoragePersister({ storage: dexieStorage, key: 'fnd-rq-cache', throttleTime: 1000 })`.
  - SSR/no-IndexedDB guard: if `indexedDB` is undefined, fall back to a no-op storage so tests/Node
    don't crash.
- **Acceptance (unit, A1-test):** round-trip — `setItem('k','v')` then `getItem('k')` → `'v'`;
  `removeItem('k')` then `getItem('k')` → `null`; `getItem(missing)` → `null`. Use `fake-indexeddb`
  (add as devDep) OR mock the Dexie table. See Task F1.

#### A2. QueryClient defaults + PersistQueryClientProvider wiring
- **Goal:** central QueryClient configured for offline-first and persisted, with paused mutations
  persisted and queries persisted; resume on rehydrate.
- **Files:** `src/main.tsx` (rewire provider); optional new `src/lib/offline/queryClient.ts` to
  build/export the configured client + persister so it's importable by tests without rendering.
- **Decisions to encode:**
  - `new QueryClient({ defaultOptions: { queries: { networkMode: 'offlineFirst', gcTime: 1000*60*60*24*7 (7d), staleTime: 1000*60*5 (5m), retry: 1 }, mutations: { networkMode: 'offlineFirst', retry: 1 } } })`.
    `gcTime` must be ≥ persist `maxAge` or persisted queries get GC'd on load.
  - Persister from A1.
  - Replace `QueryClientProvider` with `PersistQueryClientProvider`:
    ```
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000*60*60*24*7, buster: CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused,
          shouldDehydrateQuery: (q) => q.state.status === 'success' } }}
      onSuccess={() => { queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries()) }}
    >
    ```
  - `CACHE_BUSTER`: a string constant (e.g. `'v1-2026-06'`) bumped on any schema/queryKey/row-shape
    change so stale caches are dropped. Document it in a comment as a manual bump knob.
  - `dehydrateOptions.shouldDehydrateMutation` MUST persist paused mutations (default only persists
    successful queries, NOT mutations) — without this, queued writes vanish on reload.
- **Ordering trap:** mutation defaults (Wave B) must be registered on `queryClient` BEFORE
  `resumePausedMutations()` runs. Since registration happens at module load in
  `mutationDefaults.ts` and `onSuccess` fires after rehydration (a microtask later), import the
  registration module in `queryClient.ts`/`main.tsx` at top level so it runs first. State this
  explicitly in code comments.
- **Reuse:** keep `AuthProvider`/`BrowserRouter` nesting from current `src/main.tsx`.
- **Acceptance:** app boots (`npm run dev`); `npm run typecheck` green; manual: add a log entry,
  hard-reload while offline (DevTools), entry still rendered from cache.

### Wave B — Mutation defaults + optimistic updates

#### B1. Mutation key factory
- **Goal:** stable, serializable `mutationKey`s mirroring `queryKeys` so defaults survive reload.
- **File:** extend `src/lib/db/queryKeys.ts` (add `mutationKeys` export) OR new
  `src/lib/db/mutationKeys.ts`. Prefer same file for discoverability.
- **Keys (no per-call variable in the key — defaults are keyed by operation, not by row):**
  - `addFoodLog: ['food_log','add']`
  - `updateFoodLog: ['food_log','update']`
  - `deleteFoodLog: ['food_log','delete']`
  - `upsertDailyTargets: ['daily_targets','upsert']`
  - `createFood: ['foods','create']`
  - `addWorkoutLog: ['workout_log','add']`
  - `updateWorkoutLog: ['workout_log','update']`
  - `deleteWorkoutLog: ['workout_log','delete']`
- **Acceptance:** referenced by both `mutationDefaults.ts` and the hooks; typecheck green.

#### B2. Mutation defaults registry (mutationFn bodies move here)
- **Goal:** one module that calls `queryClient.setMutationDefaults(key, {...})` for each write. The
  supabase-calling `mutationFn` bodies move OUT of the hooks INTO here so they are re-registerable
  by key on every startup (required for resume-after-reload).
- **New file:** `src/lib/db/mutationDefaults.ts`. Exports `registerMutationDefaults(queryClient)`,
  called once from `queryClient.ts`/`main.tsx`.
- **Cross-cutting constraints:**
  - `mutationFn` cannot use React hooks (it runs outside render and on resume). It must read
    `userId` from the **persisted Supabase session**, not `useAuth()`. Use
    `supabase.auth.getUser()` (or `getSession()`), awaited inside `mutationFn`. This is the change
    that makes writes work on resume when no component is mounted. The cached session (persisted by
    supabase-js `persistSession: true`) supplies `user.id` offline. See Risk R6.
  - Keep the `supabase === null` guard (offline/demo shell with no backend): `mutationFn` throws
    `'Supabase is not configured.'` exactly as today.
  - Each `onSettled` invalidates the same keys the current hooks invalidate on success.
- **Per-mutation spec:**

  **addFoodLog** (`['food_log','add']`, input `AddLogEntryInput`)
  - `mutationFn`: existing insert from `useAddLogEntry`, but resolve `userId` via session.
  - `onMutate(input)`:
    - `await qc.cancelQueries({ queryKey: queryKeys.foodLog(userId, input.date) })`
    - snapshot `previous = qc.getQueryData(foodLog(userId, date))`
    - build an optimistic `FoodLogEntry`: `id = 'optimistic-' + crypto.randomUUID()`,
      `created_at = new Date().toISOString()`, `user_id`, `logged_on`, `meal`, `servings`,
      `food_id`/`recipe_id`/`note`. **Embed `food`/`recipe`** by reading the already-cached food
      from search/recipe caches if available (`qc.getQueryData` over food/recipe keys) so the row
      renders with correct FODMAP/NOOM/nutrients; if not resolvable, embed `food:null,recipe:null`
      and the UI shows it as pending/approximate (NEVER as "safe").
    - `setQueryData(foodLog(userId,date), (old=[]) => [...old, optimisticEntry])`
    - return `{ previous, date, userId, tempId }`
  - `onError(_e,_input,ctx)`: `setQueryData(foodLog(ctx.userId,ctx.date), ctx.previous)`
  - `onSettled(_d,_e,input)`: `invalidateQueries(foodLog(userId, input.date))`
  - **Temp-id reconciliation:** the real row arrives via the `onSettled` invalidation refetch
    (when online). The optimistic temp row is replaced wholesale by the refetch. No manual id
    swap needed as long as invalidate refetches. While offline the temp row stays (acceptable).

  **updateFoodLog** (`['food_log','update']`, input `UpdateLogEntryInput`)
  - `onMutate`: cancel + snapshot; `setQueryData(foodLog,date, old => old.map(r => r.id===input.id
    ? { ...r, ...patchedFields } : r))` (only meal/servings/note).
  - `onError` rollback; `onSettled` invalidate.

  **deleteFoodLog** (`['food_log','delete']`, input `{id,date}`)
  - `onMutate`: cancel + snapshot; `setQueryData(foodLog,date, old => old.filter(r => r.id!==input.id))`.
  - `onError` rollback; `onSettled` invalidate.

  **upsertDailyTargets** (`['daily_targets','upsert']`, input `DailyTargetsInput`)
  - `onMutate`: cancel + snapshot `dailyTargets(userId)`; `setQueryData(dailyTargets(userId),
    old => ({ ...(old ?? { user_id: userId }), ...input, updated_at: new Date().toISOString() }))`.
  - `onError` rollback; `onSettled` invalidate.

  **createFood** (`['foods','create']`, input `CreateFoodInput`)
  - `onMutate`: optional — optimistic insert is lower-value (search results are server-driven).
    Minimal: cancel relevant queries only. Keep `fructose_level`/`fructans_level` defaulting to
    `'unknown'` in the `mutationFn` (health-safety). Do NOT optimistically write a food into search
    caches as "safe."
  - `onSettled`: invalidate `foodByBarcode(userId,row.barcode)` + `['foodSearch']`.

  **addWorkoutLog** (`['workout_log','add']`, input `AddWorkoutLogInput`)
  - `mutationFn`: existing two-step insert (session then children), userId via session.
  - `onMutate`: cancel + snapshot `workoutLog(userId,date)` AND `workoutLogHistory(userId)`;
    optimistic `WorkoutLogEntry` with `id='optimistic-'+uuid`, embedded
    `workout_log_exercises` built from `input.exercises` (also temp ids). Append to date key and
    prepend to history key.
  - `onError` rollback BOTH; `onSettled` invalidate BOTH.

  **deleteWorkoutLog** (`['workout_log','delete']`, input `{id,date}`)
  - `onMutate`: cancel + snapshot date + history; filter out by id in both.
  - `onError` rollback; `onSettled` invalidate both.

  (Note: `updateWorkoutLog` exists in `workoutLog.ts` though not named in the request — register it
  too for consistency: same pattern as updateFoodLog over `workoutLog`+`workoutLogHistory`.)

- **Create-then-delete-while-offline ordering:** mutations resume in **the order they were
  queued** (TanStack resumes paused mutations FIFO). If a row was created then deleted offline, the
  delete's target is the **temp id**, but the server create returns a **real id**. To avoid the
  delete firing against a non-existent temp id on the server:
  - **Chosen handling:** the optimistic cache already shows the net result (row gone), and on resume
    the create runs first (succeeds, real id), then the delete runs with the temp id → server
    delete is a no-op/404 which we must **swallow** (treat "row not found" as success in the delete
    `mutationFn`, or in `onError` detect the offline-temp-id case). Simplest robust rule: in the
    delete `mutationFn`, if `id` starts with `'optimistic-'`, **skip the network delete entirely**
    and resolve — because a create that was itself paused/cancelled means the row never reached the
    server. Document this; full id-rewiring (delete-by-real-id) is out of scope for v1 and noted as
    a known limitation (R3).
- **Acceptance:** unit tests in F2 (onMutate cache reducers); typecheck green.

#### B3. Refactor hooks to thin wrappers
- **Goal:** hooks keep their current names, call signatures, and return shape; internally they call
  `useMutation({ mutationKey: mutationKeys.X })` with **no inline `mutationFn`/`onMutate`** (those
  come from the registered defaults). Components do not change.
- **Files:** `src/lib/db/foodLog.ts`, `dailyTargets.ts`, `foods.ts`, `workoutLog.ts`.
- **Pattern per hook:**
  ```ts
  export function useAddLogEntry() {
    return useMutation<FoodLogRow, Error, AddLogEntryInput>({
      mutationKey: mutationKeys.addFoodLog,
    })
  }
  ```
  - Keep the input/return TYPES exported from these files (callers import them).
  - Keep `useFoodLog`/`useDailyTargets`/etc. query hooks unchanged.
  - Remove the now-duplicated inline `onSuccess` invalidation (it lives in the default's
    `onSettled`).
  - The `supabase === null` guard moved into the default's `mutationFn`; hooks no longer need it.
- **Reuse:** `mutationKeys` (B1); types stay in place.
- **Acceptance:** existing component call sites compile unchanged; `npm run typecheck` +
  `npm run lint` green; existing meals/exercise e2e (when creds present) still pass online.

### Wave C — Resume + online state

#### C1. Online status + resume glue
- **Goal:** resume paused mutations and refresh on reconnect; expose online state to UI.
- **Files:** new `src/lib/offline/useOnlineStatus.ts`; resume call added in A2's `onSuccess` and a
  reconnect effect.
- **Shape:**
  - `useOnlineStatus(): boolean` — subscribe to TanStack `onlineManager.subscribe` (it already
    tracks `navigator.onLine` + online/offline events); return `onlineManager.isOnline()`.
  - Reconnect resume: a top-level effect (in `App` or a small `<OfflineSync/>` mounted in `App`)
    that on `onlineManager` transition offline→online calls
    `queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())`.
    (PersistQueryClientProvider handles the reload-time resume; this handles the
    stayed-open-then-reconnected case.)
- **Acceptance:** unit test the hook with a mocked `onlineManager` (toggle → value flips). Manual:
  offline add → toggle online → network insert fires (Network tab) → temp row replaced.

### Wave D — UI indicator

#### D1. Offline + pending-sync banner
- **Goal:** unobtrusive indicator: offline state + "N changes pending sync"; clears when flushed.
- **Files:** new `src/components/OfflineBanner.tsx` (or co-locate in `App.tsx`); mount in
  `src/App.tsx` header area (below the existing `<header>`), shown for both the
  Supabase-configured and offline-shell paths.
- **Shape:**
  - `useOnlineStatus()` for the offline pill.
  - Pending count via the mutation cache: subscribe to `queryClient.getMutationCache()` and count
    mutations where `state.isPaused || state.status === 'pending'`. Extract this into a pure-ish
    selector `pendingMutationCount(mutationCache): number` in `src/lib/offline/pendingCount.ts` for
    testability (F3).
  - Render: when offline → "Offline — changes will sync when you reconnect." When online with
    pending > 0 → "Syncing N change(s)…". When online and 0 pending → render nothing.
  - Keep it small (a thin bar / pill), Tailwind, consistent with existing header styles.
- **Health note:** the banner must not imply data is verified/safe; it only conveys sync state.
- **Acceptance:** unit test `pendingMutationCount`. Manual: offline add shows count ≥1; on
  reconnect count returns to 0 and bar disappears.

### Wave E — Service worker / runtime caching (decision)

#### E1. Decide SW runtime caching for Supabase GETs
- **Context:** `vite.config.ts` VitePWA precaches the **app shell** only
  (`globPatterns: js/css/html/svg/png/ico/woff2`). It does NOT cache authenticated Supabase REST
  GETs. With TanStack persistence, the app shell + the IndexedDB query cache are enough to render
  offline after a prior online load — **so SW runtime caching of Supabase is NOT required for v1**.
- **Decision (recommended):** DO NOT add `runtimeCaching` for Supabase GETs in v1. Reasons:
  authenticated responses are user-private (cache-poisoning/staleness risk), the TanStack cache
  already covers reads, and Supabase tokens rotate. Leave a comment in `vite.config.ts` documenting
  this choice. Revisit only if first-ever offline load (cold cache) must work.
- **Required SW check:** ensure `registerType: 'autoUpdate'` + app-shell precache still serves
  `index.html`/assets offline so the PWA boots with no network. Confirm `navigateFallback` behavior
  for the SPA (add `navigateFallback: 'index.html'` to `workbox` if route-deep offline reloads 404).
- **Acceptance:** `npm run build && npm run preview`, install PWA, go offline, hard-reload on
  `/meals` → app shell loads (no white screen), cached day renders.

### Wave F — Tests

#### F1. Dexie persister unit test
- **File:** `src/lib/offline/dexiePersister.test.ts`.
- **Setup:** add devDep `fake-indexeddb` and import `fake-indexeddb/auto` at top (or in
  `src/test/setup.ts`) so Dexie has an IndexedDB in jsdom. Confirm with tester whether to scope it
  per-file to avoid global side effects.
- **Cases:** set→get round-trip; remove→get null; missing key→null; overwrite same key.
- **Acceptance:** `npm test` passes these.

#### F2. Optimistic reducer / onMutate tests
- **File:** `src/lib/db/mutationDefaults.test.ts`.
- **Approach:** construct a real `QueryClient`, register defaults, seed
  `qc.setQueryData(foodLog(userId,date), [...])`, then invoke the registered `onMutate` (export the
  per-mutation option objects, or a `buildFoodLogAddDefaults(qc)` factory, so tests can call
  `onMutate` directly without network). Mock `supabase` so `mutationFn` isn't hit.
- **Required cases (minimum):**
  - food_log **add**: cache gains an `optimistic-*` row with correct date/meal/servings; `onError`
    restores snapshot.
  - food_log **delete**: target row removed; `onError` restores.
  - daily_targets **upsert**: merged patch present with new `updated_at`; `onError` restores.
  - Health-safety: an added entry whose food has `fructose_level:'unknown'` does NOT become safe —
    assert the optimistic row carries `'unknown'` (or null food) and never a fabricated `'low'`.
- **Acceptance:** `npm test` passes; reviewer confirms no "unknown→safe" path.

#### F3. Pending-count selector test
- **File:** `src/lib/offline/pendingCount.test.ts`.
- **Cases:** empty cache → 0; one paused + one pending → 2; settled/success → 0.
- **Acceptance:** `npm test` passes.

#### F4. e2e offline note (documented, gated/skipped)
- **File:** `e2e/offline.spec.ts`.
- **Content:** a Playwright flow using `context.setOffline(true)` —
  login → go offline → add a meal (banner shows pending) → reload (entry persists from cache) →
  go online (`context.setOffline(false)`) → pending clears → reload → entry persisted on server.
- **Gating:** mirror `e2e/meals.spec.ts` — `test.skip(!hasCreds, ...)` on
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Add a comment that headless offline + service worker is
  flaky; this spec is a documented manual/CI-optional path, kept green by skipping without creds.
- **Acceptance:** spec compiles; skips cleanly without creds; reviewer reads the documented flow.

---

## Dependencies / ordering (execution waves)

1. **Wave A** (A1 persister → A2 provider) — infra; nothing else works without it.
2. **Wave B** (B1 keys → B2 defaults+optimistic → B3 hook refactor) — depends on A2's `queryClient`.
3. **Wave C** (resume + online hook) — depends on A2 (resume hook) + B2 (something to resume).
4. **Wave D** (UI) — depends on C1 (online status) + B2 (mutation cache populated).
5. **Wave E** (SW decision) — independent; can run anytime, do early to confirm shell offline boot.
6. **Wave F** (tests) — F1 after A1; F2 after B2; F3 after D1's selector; F4 after C/D.

Recommended sequence for the coder: **A1 → A2 → B1 → B2 → B3 → C1 → D1 → E1 → F1–F4.**

---

## Risks / traps (call out in review)

- **R1 (the #1 trap): paused mutations don't resume after reload unless a `mutationFn` is
  registered by the SAME `mutationKey` BEFORE `resumePausedMutations()`.** Deserialized mutations
  have no `mutationFn`. Ensure `registerMutationDefaults(queryClient)` runs at module load before
  the rehydrate `onSuccess`. Reviewer must verify import ordering.
- **R2 — double-apply on resume + invalidate:** optimistic `onMutate` already updated the cache;
  on resume the `mutationFn` runs server-side and `onSettled` invalidates → refetch replaces the
  optimistic row. As long as we DON'T also manually merge the server row in `onSuccess`, no
  double-add. Avoid adding the row twice (optimistic + onSuccess append).
- **R3 — optimistic temp-id reconciliation:** temp ids (`optimistic-*`) are only replaced by the
  invalidation refetch (needs network). The create-then-delete-offline case: delete on a temp id
  must be skipped server-side (see B2). Document as a known v1 limitation; full id-rewiring later.
- **R4 — persisting stale/huge caches:** set `maxAge` (7d) and a `buster` constant; bump `buster`
  on any queryKey/row-shape/schema migration so old caches are dropped. `gcTime ≥ maxAge`.
  `shouldDehydrateQuery` to success-only keeps the persisted blob lean. Don't persist `foodSearch`
  forever — consider excluding large/ephemeral query keys from dehydration if blob grows.
- **R5 — auth-gated shell offline:** `App` returns `<Login/>` when `isSupabaseConfigured && !user`.
  Offline relies on the **cached Supabase session** (`persistSession:true`) so `useAuth` resolves a
  `user` from storage with no network. Verify `supabase.auth.getSession()` returns the cached
  session offline (it does — it reads localStorage). If the session is expired offline, the app
  shows Login (acceptable; documented). Do not weaken the auth gate.
- **R6 — userId in mutationFn:** mutationFns must NOT use `useAuth()` (no React context on resume).
  Read userId from `supabase.auth.getUser()`/cached session inside the `mutationFn`. If no session
  on resume, the mutation should fail and stay (or be cleared) rather than write under the wrong
  user. Reviewer: confirm no cross-user write risk (single-user app, but RLS + correct uid still
  required).
- **R7 — not caching authenticated Supabase GETs in the SW:** intentional (E1). Cold-start offline
  (never loaded online) won't have data — acceptable for v1; note it.
- **R8 — StrictMode double-invoke:** `setMutationDefaults` registration should be idempotent
  (calling twice with same key is fine). Keep registration outside React render (in
  `queryClient.ts` module scope), not in a component effect, to avoid double work.
- **R9 — Supabase realtime/token refresh offline:** token auto-refresh will fail offline; supabase-js
  retries on reconnect. Ensure failed refresh doesn't sign the user out locally (it shouldn't with
  `persistSession`). Watch for `onAuthStateChange('SIGNED_OUT')` firing spuriously offline.

---

## Decisions to confirm (open questions)

- **D-A:** Build the QueryClient in a new `src/lib/offline/queryClient.ts` (importable by tests) vs.
  inline in `main.tsx`? Plan assumes the separate module. Confirm.
- **D-B:** `fake-indexeddb` as the test IndexedDB backend (vs. mocking Dexie)? Plan assumes
  `fake-indexeddb`. Tester to confirm it won't destabilize jsdom globally.
- **D-C:** Skip SW runtime caching of Supabase GETs in v1 (E1 recommendation)? Confirm.
- **D-D:** Create-then-delete-offline handling = "skip network delete for `optimistic-*` ids" v1
  rule, full id-rewiring deferred? Confirm acceptable.
- **D-E:** `CACHE_BUSTER` initial value + the policy "bump on any row-shape/queryKey change." OK to
  document as a manual knob?
- **D-F:** Exclude `foodSearch`/`recipeSearch` (ephemeral) from dehydration to keep the persisted
  blob small, or persist everything success-only? Plan leans toward persisting log/targets/workout
  reads and treating search as best-effort.

---

## Final verification checklist

- [ ] `npm run typecheck`, `npm run lint` green.
- [ ] `npm test` green incl. F1 (persister), F2 (optimistic reducers + unknown-not-safe), F3
      (pending count).
- [ ] Manual offline matrix (dev + `preview` PWA):
  - [ ] Offline: add meal → appears optimistically; banner shows "1 pending".
  - [ ] Offline reload → meal still shown from persisted cache; auth shell not blocked.
  - [ ] Reconnect → insert fires; temp row replaced by real row; pending → 0; banner clears.
  - [ ] Offline: edit daily targets → persists across reload → syncs on reconnect.
  - [ ] Offline: log workout → same lifecycle.
  - [ ] Create custom food offline → FODMAP stays `unknown` end-to-end (never "safe").
  - [ ] Create-then-delete a log entry offline → after reconnect server has no orphan row.
- [ ] Reviewer: no "unknown→safe"; no cross-user write; import ordering for resume verified.
- [ ] e2e `offline.spec.ts` compiles and skips without creds.

## Files touched (absolute)

- New: `src/lib/offline/dexiePersister.ts`, `src/lib/offline/queryClient.ts`,
  `src/lib/offline/useOnlineStatus.ts`, `src/lib/offline/pendingCount.ts`,
  `src/lib/db/mutationDefaults.ts`, `src/components/OfflineBanner.tsx`,
  `src/lib/offline/dexiePersister.test.ts`, `src/lib/db/mutationDefaults.test.ts`,
  `src/lib/offline/pendingCount.test.ts`, `e2e/offline.spec.ts`.
- Edit: `src/main.tsx`, `src/App.tsx`, `src/lib/db/queryKeys.ts` (mutationKeys),
  `src/lib/db/foodLog.ts`, `src/lib/db/dailyTargets.ts`, `src/lib/db/foods.ts`,
  `src/lib/db/workoutLog.ts`, `vite.config.ts` (comment + maybe `navigateFallback`),
  `package.json` (deps), possibly `src/test/setup.ts` (fake-indexeddb).
