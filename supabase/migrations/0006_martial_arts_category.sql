-- Phase 3: add 'martial-arts' to the exercise_category enum.
--
-- This MUST stay a single-statement migration in its own file. `ALTER TYPE …
-- ADD VALUE` cannot run inside a transaction block on older Postgres, and some
-- migration runners wrap each file in a transaction — keeping this file to just
-- the one statement (no other DDL) lets it run autocommit. The newly added value
-- also cannot be USED in the same transaction that adds it, so seeding rows with
-- category='martial-arts' happens later via scripts/seed.ts (a separate process,
-- well after this migration commits).
--
-- IF NOT EXISTS makes re-running safe: a no-op if the value is already present.
-- No table/column/RLS change is needed — discipline lives in the existing
-- exercises.subcategory text column, injury notes in the existing cautions text[],
-- and workouts.category already accepts the widened enum.

alter type exercise_category add value if not exists 'martial-arts';
