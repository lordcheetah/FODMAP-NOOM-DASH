-- Add the workout-only category groupings that the Phase 2 workout data uses.
--
-- `workouts.category` shares the `exercise_category` enum (see 0003), which only
-- had cardio/strength/dynamic/stretch/yoga/back (+ martial-arts from 0006). The
-- seeded workouts also use 'circuit' and 'hiit' (HIIT/circuit routines incl. the
-- 7-minute workout), so those rows — and the schedule days pointing at them —
-- were silently skipped at seed time. Adding the values unblocks them.
--
-- Caveat (Postgres): ALTER TYPE ... ADD VALUE adds the value but it can't be
-- USED in the same transaction it's added. This migration only adds values
-- (nothing here uses them); seeding runs as a separate process afterward.
-- IF NOT EXISTS makes re-running safe.

alter type exercise_category add value if not exists 'circuit';
alter type exercise_category add value if not exists 'hiit';
