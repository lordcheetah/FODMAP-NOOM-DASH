-- FODMAP-NOOM-DASH initial schema (Phase 0 foundation)
--
-- Scope reminder: "FODMAP" here = FRUCTOSE and FRUCTANS only.
-- Reference tables (foods, recipes, recipe_ingredients, swaps) are readable by any
-- authenticated user and hold seed data (user_id IS NULL) plus user-added custom rows.
-- Personal tables (food_log, daily_targets) are private per user via RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type fodmap_level as enum ('low', 'moderate', 'high', 'unknown');
create type noom_color   as enum ('green', 'yellow', 'orange');
create type noom_category as enum (
  'protein', 'whole-grain', 'non-starchy-veg', 'starchy-veg', 'fruit', 'fat', 'freebie'
);
create type dash_group as enum (
  'grains', 'vegetables', 'fruits', 'dairy', 'meat-poultry-fish',
  'nuts-seeds-legumes', 'fats-oils', 'sweets'
);
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- ---------------------------------------------------------------------------
-- foods (reference + user-custom)
-- ---------------------------------------------------------------------------
create table foods (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade, -- NULL = global seed
  name            text not null,
  brand           text,
  serving_desc    text not null,                 -- e.g. "1 cup", "100 g"
  serving_grams   numeric(8, 2),                 -- needed to compute NOOM color
  calories        numeric(8, 2),
  sodium_mg       numeric(8, 2),
  sat_fat_g       numeric(8, 2),
  potassium_mg    numeric(8, 2),
  fiber_g         numeric(8, 2),                 -- first-class tracked nutrient
  added_sugar_g   numeric(8, 2),
  fructose_level  fodmap_level not null default 'unknown',
  fructans_level  fodmap_level not null default 'unknown',
  noom_category   noom_category,
  dash_group      dash_group,
  source          text,                          -- citation for the diet/nutrition data
  created_at      timestamptz not null default now()
);
create index foods_name_idx on foods using gin (to_tsvector('english', name));
create index foods_user_idx on foods (user_id);

-- ---------------------------------------------------------------------------
-- recipes + ingredients
-- ---------------------------------------------------------------------------
create table recipes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete cascade, -- NULL = seed
  name             text not null,
  prep_min         integer,
  servings         integer,
  cal_per_serving  numeric(8, 2),
  meal_type        meal_type,
  instructions     text[] not null default '{}',
  source           text,
  created_at       timestamptz not null default now()
);

create table recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes (id) on delete cascade,
  food_id    uuid references foods (id) on delete set null,
  raw_text   text,            -- fallback when not matched to a food row
  quantity   numeric(8, 2),
  unit       text
);
create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------------
-- swaps ("Save 100 Calories" library)
-- ---------------------------------------------------------------------------
create table swaps (
  id              uuid primary key default gen_random_uuid(),
  from_food       text not null,
  to_food         text not null,
  calories_saved  integer,
  note            text
);

-- ---------------------------------------------------------------------------
-- food_log (private per user)
-- ---------------------------------------------------------------------------
create table food_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  logged_on     date not null default current_date,
  meal          meal_type not null,
  food_id       uuid references foods (id) on delete set null,
  recipe_id     uuid references recipes (id) on delete set null,
  servings      numeric(8, 2) not null default 1,
  note          text,
  created_at    timestamptz not null default now(),
  check (food_id is not null or recipe_id is not null)
);
create index food_log_user_date_idx on food_log (user_id, logged_on);

-- ---------------------------------------------------------------------------
-- daily_targets (private per user): budgets + goals (DASH + fiber)
-- ---------------------------------------------------------------------------
create table daily_targets (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  calorie_budget       integer,
  sodium_budget_mg     integer default 2300,   -- DASH baseline; 1500 for stricter
  fiber_goal_g         integer default 28,     -- daily fiber goal
  fiber_per_meal_g     integer default 8,      -- per-meal fiber target
  dash_serving_goals   jsonb default '{}',     -- { "vegetables": 5, "fruits": 5, ... }
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table foods              enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table swaps              enable row level security;
alter table food_log           enable row level security;
alter table daily_targets      enable row level security;

-- Reference data: any authenticated user can read; users manage only their own custom rows.
create policy foods_read   on foods for select to authenticated using (true);
create policy foods_insert on foods for insert to authenticated with check (user_id = auth.uid());
create policy foods_update on foods for update to authenticated using (user_id = auth.uid());
create policy foods_delete on foods for delete to authenticated using (user_id = auth.uid());

create policy recipes_read   on recipes for select to authenticated using (true);
create policy recipes_insert on recipes for insert to authenticated with check (user_id = auth.uid());
create policy recipes_update on recipes for update to authenticated using (user_id = auth.uid());
create policy recipes_delete on recipes for delete to authenticated using (user_id = auth.uid());

-- Ingredients inherit access from their recipe.
create policy recipe_ingredients_read on recipe_ingredients for select to authenticated using (true);
create policy recipe_ingredients_write on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()));

create policy swaps_read on swaps for select to authenticated using (true);

-- Personal data: strictly owner-only.
create policy food_log_all on food_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy daily_targets_all on daily_targets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
