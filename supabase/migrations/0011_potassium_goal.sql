-- Potassium as a first-class DASH target: a daily FLOOR (want to reach it),
-- unlike the sodium ceiling. Potassium counteracts sodium's effect on blood
-- pressure, so it's tracked with its own goal. DASH aims for ~4700 mg/day.
-- Nullable (user sets it); the targets form suggests 4700 when unset.
-- Idempotent — safe to re-run.
alter table daily_targets add column if not exists potassium_goal_mg integer;
