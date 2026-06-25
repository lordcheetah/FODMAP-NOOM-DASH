-- Exercise seed idempotency constraints (Phase 2 hardening)
--
-- The seed script (scripts/seed.ts) writes GLOBAL seed rows (user_id IS NULL)
-- by natural key. These partial unique indexes (WHERE user_id IS NULL) guard the
-- global rows against duplicates while leaving per-user custom rows unconstrained
-- (a user may add an exercise/workout/schedule with the same slug/name).
--
-- workout_exercises already has a (workout_id, position) unique index created in
-- 0003 (children are not user-scoped — they inherit from their parent), so no
-- additional partial index is needed here.

-- exercises: unique global exercise by lower(slug).
create unique index if not exists exercises_seed_key_idx
  on exercises (lower(slug))
  where user_id is null;

-- workouts: unique global workout by lower(slug).
create unique index if not exists workouts_seed_key_idx
  on workouts (lower(slug))
  where user_id is null;

-- schedules: unique global schedule by lower(name).
create unique index if not exists schedules_seed_key_idx
  on schedules (lower(name))
  where user_id is null;
