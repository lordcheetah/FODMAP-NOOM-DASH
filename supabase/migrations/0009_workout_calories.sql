-- Store an (optional) estimated calories-burned figure per workout session.
-- Estimated client-side via MET × bodyweight × duration; editable by the user.
-- Idempotent — safe to re-run.
alter table workout_log add column if not exists calories_burned numeric;
