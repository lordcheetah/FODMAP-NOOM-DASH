-- How many DASH servings ONE serving of this food counts as (e.g. a large bowl
-- of cereal ≈ 2 grains, a big salad ≈ 2–3 vegetables). Null/absent = 1, so
-- existing rows are unchanged. DASH serving sizes vary too much within a group to
-- derive reliably from grams, so this is an explicit per-food multiplier.
-- Idempotent — safe to re-run.
alter table foods add column if not exists dash_servings numeric;
