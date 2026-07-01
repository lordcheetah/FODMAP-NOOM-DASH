-- Weight tracking + BMI (personal body metrics). Owner-only via RLS.
--
-- Canonical storage is METRIC (kg, cm); the UI converts for display and remembers
-- the user's preferred units. BMI is derived (weight_kg / (height_cm/100)^2) and
-- is NOT stored. `sex` is informational only — BMI and its adult categories are
-- sex-independent.

-- Singleton profile per user: height, sex, and display-unit preferences.
create table body_profile (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  height_cm    numeric(6, 2),
  sex          text,                                    -- 'male'|'female'|'other'|null
  weight_unit  text not null default 'lb',              -- 'lb' | 'kg'
  height_unit  text not null default 'ftin',            -- 'ftin' | 'cm'
  updated_at   timestamptz not null default now()
);

-- One row per weight entry (full history; multiple per day allowed).
create table weight_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  recorded_on  date not null default current_date,
  weight_kg    numeric(6, 2) not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index weight_log_user_date_idx on weight_log (user_id, recorded_on desc, created_at desc);

alter table body_profile enable row level security;
alter table weight_log   enable row level security;

create policy body_profile_all on body_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy weight_log_all on weight_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
