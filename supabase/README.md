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

## Conventions

- Never write real keys into the repo. `.env.local` is git-ignored.
- New tables MUST enable RLS and scope personal data to `auth.uid()`.
- `fructose_level` / `fructans_level` default to `unknown` — the app shows unknown as
  "not verified," never "safe."
