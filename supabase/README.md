# Supabase setup

This app uses Supabase for auth + cloud sync so your phone and laptop share data.
Everything is protected by Row-Level Security (RLS), so the public "anon" key is safe
to ship in the client.

## One-time setup

1. Create a free project at <https://supabase.com> → **New project**.
2. Apply the schema. Either:
   - **Dashboard:** open **SQL Editor**, paste the contents of
     `migrations/0001_init.sql`, and run it; **or**
   - **CLI:**
     ```bash
     npm i -g supabase
     supabase link --project-ref YOUR-PROJECT-REF
     supabase db push
     ```
3. In the dashboard, **Project Settings → API**, copy the **Project URL** and the
   **anon public** key into a local `.env.local` (see `../.env.example`).
4. Create your single user: **Authentication → Users → Add user** (or sign up in-app
   once the auth screen lands in Phase 1).

## Schema overview

- **Reference tables** (readable by any signed-in user; seed rows have `user_id = NULL`):
  `foods`, `recipes`, `recipe_ingredients`, `swaps`.
- **Private tables** (owner-only via RLS): `food_log`, `daily_targets`.
- Enums encode the diet vocabulary: `fodmap_level` (incl. `unknown`), `noom_color`,
  `noom_category`, `dash_group`, `meal_type`.

## Seeding the food/recipe data

The cited dataset and digitized recipes live in `data/*.json`. Load them into your
Supabase project with the seed script (idempotent — safe to re-run):

1. Create a local, git-ignored `.env` at the repo root with these **server-only** vars
   (note: NOT `VITE_`-prefixed, so they never reach the client bundle):
   ```
   SUPABASE_URL=https://your-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
   ```
   The `service_role` secret is under **Project Settings → API**. It bypasses RLS (required
   to write global seed rows with `user_id = NULL`), so keep it local and never commit it.
2. Apply migrations first (`0001_init.sql`, then `0002_seed_constraints.sql`).
3. Run `npm run seed`. It upserts foods/recipes/recipe_ingredients/swaps and prints any
   ingredient names that didn't match a food row.

## Photo→meal (Edge Function)

`supabase/functions/analyze-meal` is a Deno Edge Function that powers photo→meal
recognition. The browser sends a downscaled JPEG; the function verifies the
caller's Supabase JWT, calls **Claude vision** server-side, and returns a list of
identified foods with portion/calorie estimates. It **never** returns FODMAP,
allergen, or "safe"/"healthy" claims — the response schema has no such field, so
an AI-identified item stays "Not verified" until the user matches it to a cited
DB food or sets the levels manually.

### Set the secret (server-only — never the client)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

The Anthropic key lives **only** as a Supabase Functions secret. It is **never**
`VITE_`-prefixed, never in the client bundle, never committed, and never in the
Vite-consumed `.env.local`. The function rejects unauthenticated callers (401
before any Claude call) so it cannot be abused as a free Claude proxy.

### Deploy

```bash
supabase functions deploy analyze-meal
```

### Local testing

```bash
supabase functions serve analyze-meal   # loads supabase/functions/.env (git-ignored)
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` are auto-injected in the hosted runtime but
may need to be provided (via `--env-file` or `supabase/functions/.env`) for local
`serve`. Provide `ANTHROPIC_API_KEY` there too for local runs.

### How the client calls it

The client derives the URL from the already-configured Supabase URL:
`${VITE_SUPABASE_URL}/functions/v1/analyze-meal`, sending the signed-in user's
access token as `Authorization: Bearer <jwt>`. No new client env var is needed.

The captured photo is sent to the function (which forwards it to Anthropic) for
analysis and is **not stored** by the app — surfaced in the UI notice.

## Conventions

- Never write real keys into the repo. `.env.local` is git-ignored.
- New tables MUST enable RLS and scope personal data to `auth.uid()`.
- `fructose_level` / `fructans_level` default to `unknown` — the app shows unknown as
  "not verified," never "safe."
