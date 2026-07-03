-- Saturated fat as a first-class DASH target: a daily CEILING (stay under),
-- like the sodium budget. DASH limits saturated fat to ~6% of daily calories
-- (~13 g on a 2,000 kcal day, ~17 g at 2,600). Nullable (user sets it); the
-- targets form suggests 13 g when unset.
-- Idempotent — safe to re-run.
alter table daily_targets add column if not exists sat_fat_limit_g numeric;
