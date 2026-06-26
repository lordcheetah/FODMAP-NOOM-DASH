# Phase 3 — Offline-first research note

Status: research / decision. Author: researcher agent. Date: 2026-06-26.

Goal: log meals/workouts and edit targets **while offline**, serve reads from a persisted cache,
queue writes, and sync on reconnect — without reinventing replay/ordering.

Stack in repo (verified in `package.json`): React 18.3, Vite 5.4, `vite-plugin-pwa` 0.20.5,
`@tanstack/react-query` ^5.59, `@supabase/supabase-js` ^2.45 (`persistSession:true`,
`autoRefreshToken:true` in `src/lib/supabase.ts`), `dexie` ^4.0.8 (already a dependency, currently
unused).

---

## Decision

**Adopt approach (A): TanStack Query offline persistence + paused mutations, with a tiny Dexie-backed
async storage persister.** Reject (B) the hand-rolled Dexie outbox.

Rationale:

- (A) reuses the library's built-in mutation **pausing** (`networkMode: 'offlineFirst'` pauses
  mutations when `onlineManager` reports offline), **dehydration/persistence** of the query +
  mutation cache, and **ordered replay** (`resumePausedMutations()` runs paused mutations in the
  order they were created). (B) would force us to re-implement all of that — outbox ordering,
  optimistic cache patching, retry/backoff, dedupe — which is exactly the class of bug-prone code
  CLAUDE.md warns against in a health app where a dropped or reordered write corrupts the day's log.
- CLAUDE.md asks for "Dexie (IndexedDB) for offline read cache + write outbox." (A) **satisfies that
  literally**: the persisted query cache is the offline read cache, and the persisted *paused
  mutations* are the write outbox — both stored in a Dexie table because we back the persister with
  Dexie (not localStorage). So we honor the stack note without hand-rolling outbox logic.
- The only real cost of (A) is the `setMutationDefaults` discipline (gotcha #1). That is a
  one-time, ~5-mutation wiring change, far cheaper than (B).

Trade-offs we accept: (A) replays the *original mutationFn* against Supabase on reconnect, so
ordering/conflict handling is whatever Postgres + our SQL does (last-write-wins, fine for a single
user — gotcha #7). (A) does not give us a queryable "pending writes" UI for free; if we want a
"3 changes pending" badge we read it from the mutation cache (`queryClient.getMutationCache()`),
not from a custom table.

---

## Packages to add (exact, v5-compatible)

TanStack ships the persist plugins on the **same release train** as `@tanstack/react-query`; the
plugin's `peerDependencies` is `"@tanstack/react-query": "^<that version>"` (published from
`workspace:^`). To avoid any peer mismatch, **pin all three TanStack packages to one identical
version**. The repo currently has `@tanstack/react-query@^5.59.0`; the safe move is to bump the core
and add the two plugins at the same exact version.

Add to `dependencies` (these are runtime, not dev):

```jsonc
"@tanstack/react-query-persist-client": "5.59.0",   // PersistQueryClientProvider + persistQueryClientRestore
"@tanstack/query-async-storage-persister": "5.59.0" // createAsyncStoragePersister (async storage adapter)
```

and align the existing core to the same exact version:

```jsonc
"@tanstack/react-query": "5.59.0"
```

Notes / caveats verified against the registry (mid-2026):
- Latest published is in the **5.101.x** line; the whole 5.x series is API-stable for the surface we
  use (`PersistQueryClientProvider`, `createAsyncStoragePersister`, `dehydrateOptions`,
  `resumePausedMutations`, `setMutationDefaults`, `networkMode`). It is fine to instead bump all
  three to the current 5.101.x together — just keep them **identical** so the `^` peer is satisfied.
  Do not mix (e.g. core 5.59 + plugin 5.101) — pin them together.
- `createAsyncStoragePersister` lives in `@tanstack/query-async-storage-persister` (NOT
  `query-sync-storage-persister` — we need async because Dexie/IndexedDB is async).
- `@tanstack/query-persist-client-core` comes in transitively as a dependency of the two above; do
  not add it directly.
- No new dep needed for `onlineManager` / `QueryClient` / `setMutationDefaults` — they're in
  `@tanstack/react-query` already.
- Dexie ^4 is already present; no version change.

Sources: persistQueryClient plugin docs, createAsyncStoragePersister docs, and the package
`peerDependencies: "@tanstack/react-query": "workspace:^"` (publishes as `^<version>`). See
"Sources" at the end.

---

## The Dexie-backed persister (storage = Dexie, satisfies the outbox requirement)

`createAsyncStoragePersister({ storage })` only needs `storage` to implement the **AsyncStorage**
interface: `getItem(key) => Promise<string|null>`, `setItem(key, value) => Promise<unknown>`,
`removeItem(key) => Promise<void>`. We implement that over a single Dexie key/value table. The
persister serializes the **entire dehydrated client** (queries + dehydrated mutations) to one JSON
string under one key; Dexie stores that blob. (We could later add real per-row Dexie tables, but the
single-blob KV table is all the persister needs and is the documented pattern.)

Code shape (not full impl):

```ts
// src/lib/offline/db.ts
import Dexie, { type Table } from 'dexie'
class OfflineDB extends Dexie {
  kv!: Table<{ key: string; value: string }, string>
  constructor() {
    super('fnd-offline')
    this.version(1).stores({ kv: 'key' }) // primary key = key
  }
}
export const offlineDb = new OfflineDB()

// src/lib/offline/persister.ts
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { offlineDb } from './db'

const dexieStorage = {
  getItem: async (key: string) => (await offlineDb.kv.get(key))?.value ?? null,
  setItem: async (key: string, value: string) => { await offlineDb.kv.put({ key, value }) },
  removeItem: async (key: string) => { await offlineDb.kv.delete(key) },
}

export const persister = createAsyncStoragePersister({
  storage: dexieStorage,
  key: 'fnd-query-cache',
  throttleTime: 1000, // coalesce rapid writes
})
```

---

## Gotcha #1 — `setMutationDefaults` keyed by a stable `mutationKey` (load-bearing)

A dehydrated paused mutation stores its **variables + mutationKey + state**, but **NOT its
`mutationFn`** (functions don't serialize). On reload, `resumePausedMutations()` looks up the
`mutationFn` by `mutationKey` in the client's mutation defaults. If the function was only passed
inline to `useMutation`, the resumed mutation has **no function to run** and silently fails to
replay. Therefore every offline-capable mutation MUST:

1. Register its real `mutationFn` (+ `onMutate`/`onError`/`onSettled`) once at startup via
   `queryClient.setMutationDefaults(mutationKey, { mutationFn, ... })`.
2. Reference it from the hook by **key only**: `useMutation({ mutationKey })` — no inline
   `mutationFn`. The hook inherits the default fn/handlers by key.

Add stable keys to `queryKeys.ts` (a `mutationKeys` factory alongside `queryKeys`), e.g.
`mutationKeys.addLogEntry = ['food_log','add']`. Keys must be **stable across reloads and not
include per-call variables** (variables travel with the mutation, not the key).

Startup registration sketch (called once, after the QueryClient is created, before render — see
"Startup wiring"):

```ts
export function registerMutationDefaults(qc: QueryClient) {
  qc.setMutationDefaults(mutationKeys.addLogEntry, {
    mutationFn: addLogEntry,            // the bare async fn (extracted out of the hook)
    onMutate: optimisticAddLogEntry(qc),// returns ctx for rollback
    onError: rollback(qc),
    onSettled: (_d, _e, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.foodLog(vars.userId, vars.date) }),
  })
  // ...one block per offline mutation
}
```

Refactor consequence: the current hooks define `mutationFn` inline and read `userId`/`supabase` from
React context/closure. For replay-after-reload these must become **pure, context-free functions**
that take everything they need in their `variables` (notably `userId` — see gotcha #4) and import
`supabase` from the module. The hooks shrink to `useMutation({ mutationKey })` plus a thin wrapper
that injects `userId`/`date` into `variables` before calling `mutate`.

## Gotcha #2 — Persisting paused mutations (dehydrate) + resuming them

By default the persister **does** include paused mutations: `defaultShouldDehydrateMutation` returns
true for paused mutations, and the persister's `dehydrateOptions` uses it. So for our case
(we only need *paused* mutations replayed) the default is correct and we can omit
`shouldDehydrateMutation`. Be explicit anyway for clarity:

```tsx
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7d; default is 24h — bump so a week-old offline cache still hydrates
    buster: APP_DATA_VERSION,        // bump to invalidate cache on schema/shape changes
    dehydrateOptions: {
      // default already keeps paused mutations; keep queries too (default true)
      shouldDehydrateMutation: (m) => m.state.isPaused, // == defaultShouldDehydrateMutation behavior
    },
  }}
  onSuccess={() => {
    // fires after the cache is restored from Dexie on startup
    queryClient.resumePausedMutations()
  }}
>
```

Important v5 fact: **`HydrationBoundary` no longer hydrates mutations in v5** — only the
`persistQueryClient` plugin restores mutations. That is exactly why we use
`PersistQueryClientProvider` rather than manual hydration. We do NOT need to persist `idle`/`pending`
mutations (that's the harder, non-default case in TanStack discussion #7044); our writes are paused
while offline, which is the supported path.

Also resume on reconnect (not just on startup). `onlineManager` flips to online when the browser
fires `online`; wire it so the SDK's default behavior triggers replay, and additionally call resume
defensively:

```ts
import { onlineManager } from '@tanstack/react-query'
window.addEventListener('online', () => queryClient.resumePausedMutations())
// (onlineManager already listens to navigator.onLine by default in the browser build)
```

## Gotcha #3 — Optimistic updates and how they interact with offline

Pattern per mutation (the **cache-update** variant, not the "useMutation variables" variant, because
our reads are list/object queries that must reflect the change immediately and **survive a reload**
in the persisted cache):

```ts
onMutate: async (vars) => {
  await qc.cancelQueries({ queryKey: K })
  const prev = qc.getQueryData(K)
  qc.setQueryData(K, (old) => applyOptimistic(old, vars)) // insert temp row / patch / remove
  return { prev }            // ctx for rollback
},
onError: (_e, _vars, ctx) => { if (ctx?.prev !== undefined) qc.setQueryData(K, ctx.prev) },
onSettled: (_d, _e, vars) => { qc.invalidateQueries({ queryKey: K }) },
```

Offline interaction (critical):
- `cancelQueries` + `setQueryData` run in `onMutate` **even while offline** (onMutate is not gated by
  networkMode). So the optimistic state appears instantly.
- The mutation then **pauses** (offline), and that paused mutation + the updated query cache are both
  **persisted to Dexie** by the throttled persister. So after a reload while still offline, the UI
  still shows the optimistic row AND the queued write is still pending. This is the whole point.
- `invalidateQueries` in `onSettled` is effectively a **no-op while offline** (a refetch can't run
  with no network and `offlineFirst` won't hit the network), so it will not wipe the optimistic
  state. The refetch fires when back online, after the real insert lands, reconciling temp -> real.
- Because the optimistic patch lives in the persisted query cache, **do not** rely only on
  `onError` rollback for correctness offline — there is no error offline (it's paused, not failed).

Per-cache guidance:
- `food_log` (key `['foodLog', userId, date]`): add/update/delete patch the date's array. Add =
  append a temp row; update = map+merge; delete = filter out by id.
- `workout_log` (key `['workoutLog', userId, date]`) + history (`['workoutLogHistory', userId]`):
  patch BOTH on add/delete so the date view and history stay consistent offline.
- `daily_targets` (key `['dailyTargets', userId]`): single object; optimistic = merge the patch into
  the cached row (or synthesize one if null). Upsert replays cleanly on reconnect.
- `foods` search (`['foodSearch', term]`) / barcode (`['foodByBarcode', userId, barcode]`):
  `useCreateFood` should optimistically write the new food into the `foodByBarcode` cache so a scan
  flow can immediately log it offline; search results are fuzzier — invalidate on reconnect rather
  than trying to patch every matching term.

## Gotcha #4 — Auth offline

Supabase is created with `persistSession: true`, so the session is in localStorage and
`supabase.auth.getSession()` resolves **offline** with the cached session, exposing `user.id`. The
app's `AuthProvider` (`src/lib/auth.tsx`) already calls `getSession()` on mount, so `useAuth().user`
is populated offline. Therefore optimistic writes have `userId` available.

Caveats:
- `autoRefreshToken: true`: while offline the access token may expire; refresh fails (no network).
  When the queued mutation **replays on reconnect**, the SDK refreshes the token first
  (`autoRefreshToken`), so the replayed Supabase call uses a fresh JWT and passes RLS. This is why
  we replay through the original `supabase.from(...)` call (which carries auth) rather than a raw
  fetch. Edge case: if the refresh token itself expired/was revoked while offline (rare for a
  single user), replay 401s — those mutations stay failed; surface a "re-sign-in to sync" prompt.
- **Pass `userId` in the mutation `variables`**, not only via closure. A paused mutation resumed
  after reload must not depend on React context being ready at resume time. Capture `userId` at
  `mutate()` time into variables; the registered default `mutationFn` reads it from `variables`.

## Gotcha #5 — IDs for offline-created rows (temp IDs + reconciliation)

Server generates `id` (and `created_at`). Offline inserts have no server id, so:
- In `onMutate`, mint a **temp id** (`crypto.randomUUID()` with a marker, e.g. `temp_<uuid>`), and
  insert the optimistic row with that id into the cache. Keep `created_at` as `new Date().toISOString()`
  so ordering by `created_at` looks right offline.
- The temp row is purely a UI placeholder. When connectivity returns and the paused insert replays,
  the real row is created server-side; `onSettled`'s `invalidateQueries` refetches the date and the
  **temp row is replaced by the authoritative server row** (different real id). No manual id-mapping
  table is required for inserts, because we never reference the temp id from another *server* call —
  see the edit/delete caveat below.
- Reconciliation correctness depends on the refetch happening after the insert. With `offlineFirst`
  + resume-on-reconnect, `resumePausedMutations()` runs the insert; its `onSettled` invalidate then
  refetches once online. Good.

Edge case — create-then-edit / create-then-delete **while still offline** (same temp id):
- Paused mutations resume **in creation order** (FIFO) on `resumePausedMutations()`. So insert runs
  before the later update/delete.
- BUT the later update/delete was queued referencing the **temp id**, while the server created a
  **real id**. A replayed `update().eq('id', 'temp_...')` / `delete().eq('id','temp_...')` would
  match **zero rows** server-side. Two acceptable handling options for v1 (recommend the first):
  1. **Collapse offline edits into the pending create.** While offline, if the target row's id is a
     `temp_` id, don't enqueue a separate update/delete mutation — instead mutate the still-pending
     create's variables (or for delete, **remove the queued create** from the mutation cache so the
     row is never sent). This keeps the outbox internally consistent and is simple because it's a
     single user editing their own just-added row. Implement as a small guard in the hook wrappers:
     "if id startsWith `temp_`, patch/cancel the pending create instead of enqueuing a new mutation."
  2. (Heavier, defer) maintain a temp->real id map populated in the create's `onSuccess`, and rewrite
     queued mutations' variables before they replay. More general but more code; not needed for v1.
- For the common case (create offline, edit/delete **after** the create already synced) the id is
  real and no special handling is needed.

## Gotcha #6 — PWA / runtime caching vs persisted query cache

Recommendation: **do not** add Workbox runtime caching for authenticated Supabase REST GETs.
- Reads are served from the **persisted query cache** (Dexie) — that's the offline read source. A
  service-worker cache of `/rest/v1/...` responses would (a) cache per-user data keyed by URL with
  bearer tokens, risking stale/auth-mismatched responses, and (b) duplicate what the query cache
  already does, creating two sources of truth.
- Keep the SW responsible only for the **app shell precache** (HTML/JS/CSS/icons) so the app *loads*
  offline; vite-plugin-pwa's default `generateSW`/`registerSW` precache already covers the built
  assets. Confirm `vite.config.ts` PWA config precaches the shell (it does by default via Workbox
  `globPatterns`); verify `navigateFallback` is set so deep links (e.g. `/log/2026-06-26`) resolve
  to `index.html` offline.
- Open Food Facts / USDA (Phase 3 barcode) are different: those are **public, cacheable** GETs and
  are a fine candidate for a Workbox `runtimeCaching` (StaleWhileRevalidate/CacheFirst) entry —
  separate from Supabase. Note it for the barcode work, out of scope here.

Action item to verify (not blocking this decision): open `vite.config.ts`, confirm the PWA plugin
has the shell precache + `navigateFallback: 'index.html'`, and that no `runtimeCaching` rule matches
the Supabase URL.

## Gotcha #7 — Conflict policy

Single user => **last-write-wins** is acceptable and is what plain Supabase upserts/updates already
do (the replayed statement overwrites). No vector clocks / merge logic for v1.
- Documented edge case: two devices both offline, both editing the same `daily_targets` row (or the
  same log entry), then both reconnect. The later replay wins; the earlier device's change is lost
  silently. Acceptable for v1 (one person, rarely two offline devices at once). If it ever matters,
  add an `updated_at` precondition (`.eq('updated_at', expected)` -> reject + refetch) later.
- food_log/workout_log **inserts** don't conflict (each gets its own row), so the only real LWW
  surface is edits to existing rows and the singleton `daily_targets`.

---

## Which existing mutations need `setMutationDefaults` + optimistic handlers

From `src/lib/db/`:

| Hook | File | mutationKey (add to `mutationKeys`) | Optimistic cache(s) to patch | Notes |
|---|---|---|---|---|
| `useAddLogEntry` | `foodLog.ts` | `['food_log','add']` | `foodLog(userId,date)` append temp row | needs temp id; embed `food`/`recipe` is null optimistically until refetch (render guard) |
| `useUpdateLogEntry` | `foodLog.ts` | `['food_log','update']` | `foodLog(userId,date)` map+merge | temp-id collapse guard (gotcha #5) |
| `useDeleteLogEntry` | `foodLog.ts` | `['food_log','delete']` | `foodLog(userId,date)` filter out | temp-id collapse guard |
| `useUpsertDailyTargets` | `dailyTargets.ts` | `['daily_targets','upsert']` | `dailyTargets(userId)` merge patch | singleton; LWW |
| `useCreateFood` | `foods.ts` | `['foods','create']` | `foodByBarcode(userId,barcode)` set; invalidate `foodSearch` on reconnect | enables offline scan->log |
| `useAddWorkoutLog` | `workoutLog.ts` | `['workout_log','add']` | `workoutLog(userId,date)` + `workoutLogHistory(userId)` | **two-statement** mutationFn (session insert then children) — keep both in one mutationFn so they replay atomically as one queued mutation; temp id for session |
| `useUpdateWorkoutLog` | `workoutLog.ts` | `['workout_log','update']` | `workoutLog(userId,date)` + history | temp-id collapse guard |
| `useDeleteWorkoutLog` | `workoutLog.ts` | `['workout_log','delete']` | `workoutLog(userId,date)` + history | children cascade server-side |

Queries that must be in the persisted cache so reads work offline (no code change beyond persistence
being on, but confirm they're not `gcTime: 0`): `foodLog`, `workoutLog`, `workoutLogHistory`,
`dailyTargets`, `foodByBarcode`. `foodSearch` is best-effort offline (only previously-run terms are
cached). Set a generous `gcTime` (e.g. 7 days, matching `maxAge`) on the QueryClient defaults so
entries survive long enough to be persisted/restored; `staleTime` can stay low.

Note `useWorkoutLogHistory` takes a `limit` arg but the query key
(`['workoutLogHistory', userId]`) does not include it — fine, just be aware the cached history
reflects whatever limit last ran.

---

## Startup wiring sketch (`src/main.tsx`)

```tsx
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { persister } from './lib/offline/persister'
import { registerMutationDefaults } from './lib/offline/registerMutations'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',           // serve cache offline; don't error
      gcTime: 1000 * 60 * 60 * 24 * 7,       // survive long enough to persist/restore
      staleTime: 1000 * 30,
      retry: 2,
    },
    mutations: {
      networkMode: 'offlineFirst',           // pause (not fail) while offline
    },
  },
})

registerMutationDefaults(queryClient)        // gotcha #1 — BEFORE render

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: 'v1',                         // bump on cache-shape changes
        dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused },
      }}
      onSuccess={() => { queryClient.resumePausedMutations() }}
    >
      <AuthProvider>
        <BrowserRouter><App /></BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)

// resume again whenever we regain connectivity
window.addEventListener('online', () => queryClient.resumePausedMutations())
```

Key wiring points:
1. `queryClient` is created **once at module scope** and exported (the registered mutation defaults
   and the persisted cache must reference the same instance the hooks use). Replaces the current
   in-render `const queryClient = new QueryClient()`.
2. `registerMutationDefaults(queryClient)` runs **before** `resumePausedMutations()` can fire (i.e.
   before render / before `onSuccess`) so resumed mutations find their `mutationFn` by key.
3. `networkMode: 'offlineFirst'` on **both** queries and mutations: queries read cache without
   erroring offline; mutations pause instead of failing offline.
4. The hooks in `src/lib/db/*` drop their inline `mutationFn`/handlers and pass only `mutationKey`,
   injecting `userId`/`date`/temp-id into `variables` at call time.

---

## Concrete refactor checklist (for the coder)

1. Add deps (3 pinned-equal TanStack versions above); `dexie` already present.
2. `src/lib/offline/db.ts` — Dexie KV table. `src/lib/offline/persister.ts` — async persister over it.
3. `queryKeys.ts` — add a `mutationKeys` factory (stable, variable-free keys).
4. Extract each offline mutation's body into a pure `mutationFn(variables)` (variables carry
   `userId`, `date`, payload; `supabase` imported from module). Build `optimistic*`/`rollback`/
   `invalidate` handlers per gotcha #3.
5. `src/lib/offline/registerMutations.ts` — `registerMutationDefaults(qc)` calling
   `qc.setMutationDefaults(key, {...})` for all 8 mutations.
6. Rewrite the 8 hooks to `useMutation({ mutationKey })` + a thin wrapper that assembles `variables`
   (incl. temp id + `userId`).
7. `src/main.tsx` — export a module-scope `queryClient`, wrap in `PersistQueryClientProvider`, call
   `registerMutationDefaults`, add `online` listener.
8. Add the temp-id collapse guard (gotcha #5) in the update/delete wrappers.
9. Verify `vite.config.ts` PWA precaches shell + `navigateFallback`, and does NOT runtime-cache
   Supabase REST (gotcha #6).
10. Set `gcTime` ≈ `maxAge` so the read caches survive to be persisted (gotcha "queries" note).

Test ideas (tester phase): DevTools offline -> add/edit/delete a log entry -> reload (still offline),
assert optimistic state + pending mutation persisted -> go online, assert single replay, temp row
replaced by server row, no duplicate. Repeat create-then-delete-offline to assert the collapse guard.

---

## Sources

- persistQueryClient plugin (PersistQueryClientProvider, persistOptions, dehydrateOptions,
  onSuccess -> resumePausedMutations, maxAge/buster):
  https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient
- createAsyncStoragePersister (AsyncStorage interface getItem/setItem/removeItem, storage/key/
  throttleTime options): https://tanstack.com/query/v5/docs/framework/react/plugins/createAsyncStoragePersister
- Mutations guide (persisting mutations, setMutationDefaults + mutationKey so paused mutations resume
  after reload, networkMode, resumePausedMutations):
  https://tanstack.com/query/v5/docs/framework/react/guides/mutations
- Migrating to v5 (HydrationBoundary no longer hydrates mutations; use persistQueryClient):
  https://tanstack.com/query/v5/docs/framework/react/guides/migrating-to-v5
- defaultShouldDehydrateMutation = paused-only default; continuing non-paused mutations is a custom
  case (maintainer TkDodo): https://github.com/TanStack/query/discussions/7044
- Package versions / lockstep peer dep (`peerDependencies: "@tanstack/react-query": "workspace:^"`,
  published as `^<version>`; latest line ~5.101.x):
  https://www.npmjs.com/package/@tanstack/react-query-persist-client ,
  https://www.npmjs.com/package/@tanstack/query-async-storage-persister
- Supabase auth persistSession / autoRefreshToken (cached session offline via getSession; refresh on
  reconnect): https://supabase.com/docs/reference/javascript/initializing
