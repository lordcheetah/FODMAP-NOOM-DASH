-- Exclude a food from the FODMAP meal-window load stacking — for supplements
-- (e.g. psyllium fiber tablets), spices, or tiny amounts that shouldn't push a
-- meal's fructose/fructans total up just because many are logged. It still
-- counts toward calories/fiber/DASH; only the FODMAP stacking ignores it.
-- Idempotent — safe to re-run.
alter table foods add column if not exists fodmap_exempt boolean not null default false;
