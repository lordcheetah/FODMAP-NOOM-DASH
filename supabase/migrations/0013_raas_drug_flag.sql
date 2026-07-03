-- Whether the user takes a RAAS-acting blood-pressure drug (ACE inhibitor, ARB,
-- or potassium-sparing diuretic). These retain potassium, so DASH's high-
-- potassium load can raise blood potassium — the app surfaces a caution when set
-- and defers the target to the prescriber. Informational only, not medical advice.
-- Idempotent — safe to re-run.
alter table body_profile add column if not exists on_raas_drug boolean not null default false;
