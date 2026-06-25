-- FODMAP-NOOM-DASH exercise schema (Phase 2)
--
-- Reference tables (exercises, workouts, schedules) mirror the foods/recipes
-- posture: readable by any authenticated user, hold seed data (user_id IS NULL)
-- plus user-added custom rows, writable only for user_id = auth.uid().
-- Ordered children (workout_exercises, schedule_days) inherit access from their
-- parent (like recipe_ingredients). Personal tables (workout_log,
-- workout_log_exercises) are private per user via RLS.

-- ---------------------------------------------------------------------------
-- Enums (string literals match src/lib/exercise/types.ts)
-- ---------------------------------------------------------------------------
create type exercise_category     as enum ('cardio', 'strength', 'dynamic', 'stretch', 'yoga', 'back');
create type workout_format        as enum ('timed', 'rounds', 'amrap', 'emom', 'reps', 'freestyle');
create type exercise_default_type as enum ('reps', 'duration', 'hold');

-- ---------------------------------------------------------------------------
-- exercises (reference + user-custom)
-- ---------------------------------------------------------------------------
create table exercises (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users (id) on delete cascade, -- NULL = global seed
  slug                  text not null,
  name                  text not null,
  category              exercise_category not null,
  subcategory           text,
  muscle_groups         text[] not null default '{}',
  equipment             text[] not null default '{}',
  difficulty            text,                          -- 'easy' | 'medium' | 'hard'
  instructions          text[] not null default '{}',
  modifications         text[] not null default '{}',  -- shown verbatim, never dropped
  cautions              text[] not null default '{}',  -- shown verbatim, never dropped
  default_type          exercise_default_type not null,
  default_reps          integer,
  default_duration_sec  integer,
  default_hold_sec      integer,
  source                text,                          -- citation
  created_at            timestamptz not null default now()
);
create index exercises_name_idx on exercises using gin (to_tsvector('english', name));
create index exercises_user_idx on exercises (user_id);

-- ---------------------------------------------------------------------------
-- workouts (reference + user-custom) + ordered child workout_exercises
-- ---------------------------------------------------------------------------
create table workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete cascade, -- NULL = seed
  slug              text not null,
  name              text not null,
  category          exercise_category not null,
  description       text,
  duration_min      integer,             -- also the AMRAP/EMOM time-box source
  format            workout_format not null,
  rounds            integer,
  default_work_sec  integer,
  default_rest_sec  integer,
  source            text,
  created_at        timestamptz not null default now()
);
create index workouts_user_idx on workouts (user_id);

create table workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references workouts (id) on delete cascade,
  exercise_id  uuid not null references exercises (id) on delete restrict,
  position     integer not null,    -- seed field is `order`; renamed (reserved word)
  work_sec     integer,
  rest_sec     integer,
  reps         integer,
  hold_sec     integer,
  note         text
);
create index workout_exercises_workout_idx on workout_exercises (workout_id);
create unique index workout_exercises_order_idx on workout_exercises (workout_id, position);

-- ---------------------------------------------------------------------------
-- schedules (reference + user-custom) + ordered child schedule_days
-- ---------------------------------------------------------------------------
create table schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade, -- NULL = seed
  name        text not null,
  source      text,
  created_at  timestamptz not null default now()
);
create index schedules_user_idx on schedules (user_id);

create table schedule_days (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references schedules (id) on delete cascade,
  week         integer not null,
  day          integer not null,
  label        text,
  workout_id   uuid references workouts (id) on delete set null,  -- NULL = rest day
  unique (schedule_id, week, day)
);
create index schedule_days_schedule_idx on schedule_days (schedule_id);

-- ---------------------------------------------------------------------------
-- workout_log (private per user) + per-exercise results child
-- ---------------------------------------------------------------------------
create table workout_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  performed_on      date not null default current_date,
  workout_id        uuid references workouts (id) on delete set null, -- NULL = ad-hoc/freestyle
  name              text,                -- snapshot so history survives ref-data edits
  duration_sec      integer,
  rounds_completed  integer,             -- AMRAP / rounds
  notes             text,
  completed         boolean not null default true,
  created_at        timestamptz not null default now()
);
create index workout_log_user_date_idx on workout_log (user_id, performed_on);

create table workout_log_exercises (
  id              uuid primary key default gen_random_uuid(),
  workout_log_id  uuid not null references workout_log (id) on delete cascade,
  exercise_id     uuid references exercises (id) on delete set null,
  name            text,                  -- snapshot
  position        integer,
  sets            integer,
  reps            integer,
  duration_sec    integer,
  hold_sec        integer,
  score           numeric(8, 2),
  notes           text
);
create index workout_log_exercises_log_idx on workout_log_exercises (workout_log_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table exercises             enable row level security;
alter table workouts              enable row level security;
alter table workout_exercises     enable row level security;
alter table schedules             enable row level security;
alter table schedule_days         enable row level security;
alter table workout_log           enable row level security;
alter table workout_log_exercises enable row level security;

-- Reference data: any authenticated user can read; users manage only their own custom rows.
create policy exercises_read   on exercises for select to authenticated using (true);
create policy exercises_insert on exercises for insert to authenticated with check (user_id = auth.uid());
create policy exercises_update on exercises for update to authenticated using (user_id = auth.uid());
create policy exercises_delete on exercises for delete to authenticated using (user_id = auth.uid());

create policy workouts_read   on workouts for select to authenticated using (true);
create policy workouts_insert on workouts for insert to authenticated with check (user_id = auth.uid());
create policy workouts_update on workouts for update to authenticated using (user_id = auth.uid());
create policy workouts_delete on workouts for delete to authenticated using (user_id = auth.uid());

-- workout_exercises inherit access from their workout.
create policy workout_exercises_read on workout_exercises for select to authenticated using (true);
create policy workout_exercises_write on workout_exercises for all to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));

create policy schedules_read   on schedules for select to authenticated using (true);
create policy schedules_insert on schedules for insert to authenticated with check (user_id = auth.uid());
create policy schedules_update on schedules for update to authenticated using (user_id = auth.uid());
create policy schedules_delete on schedules for delete to authenticated using (user_id = auth.uid());

-- schedule_days inherit access from their schedule.
create policy schedule_days_read on schedule_days for select to authenticated using (true);
create policy schedule_days_write on schedule_days for all to authenticated
  using (exists (select 1 from schedules s where s.id = schedule_id and s.user_id = auth.uid()))
  with check (exists (select 1 from schedules s where s.id = schedule_id and s.user_id = auth.uid()));

-- Personal data: strictly owner-only.
create policy workout_log_all on workout_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workout_log_exercises inherit owner-only access from their session.
create policy workout_log_exercises_all on workout_log_exercises for all to authenticated
  using (exists (select 1 from workout_log wl where wl.id = workout_log_id and wl.user_id = auth.uid()))
  with check (exists (select 1 from workout_log wl where wl.id = workout_log_id and wl.user_id = auth.uid()));
