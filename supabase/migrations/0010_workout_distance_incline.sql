-- Optional cardio detail per session: distance (km, canonical) and treadmill/
-- road incline (% grade). Pace is derived from distance + duration, not stored.
-- Idempotent — safe to re-run.
alter table workout_log add column if not exists distance_km numeric;
alter table workout_log add column if not exists incline_pct numeric;
