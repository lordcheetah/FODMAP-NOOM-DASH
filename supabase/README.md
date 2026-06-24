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

## Conventions

- Never write real keys into the repo. `.env.local` is git-ignored.
- New tables MUST enable RLS and scope personal data to `auth.uid()`.
- `fructose_level` / `fructans_level` default to `unknown` — the app shows unknown as
  "not verified," never "safe."
