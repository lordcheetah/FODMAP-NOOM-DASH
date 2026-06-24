-- Seed idempotency constraints (Phase 1 hardening)
--
-- The seed script (scripts/seed.ts) writes GLOBAL seed rows (user_id IS NULL) by
-- natural key. These partial unique indexes (WHERE user_id IS NULL) let the seed
-- use native `upsert ... onConflict` for the global rows while leaving per-user
-- custom rows unconstrained (a user may add a food/recipe with the same name).
--
-- swaps has no user_id (reference-only), so its index is unconditional.

-- foods: unique global food by (lower(name), coalesce(lower(brand), '')).
create unique index if not exists foods_seed_key_idx
  on foods (lower(name), coalesce(lower(brand), ''))
  where user_id is null;

-- recipes: unique global recipe by lower(name).
create unique index if not exists recipes_seed_key_idx
  on recipes (lower(name))
  where user_id is null;

-- swaps: unique by (lower(from_food), lower(to_food)).
create unique index if not exists swaps_seed_key_idx
  on swaps (lower(from_food), lower(to_food));
