-- Per-user UI state sets that should sync across devices: shopping-list checks
-- (key 'shopping:checked') and meal-plan defers (key 'mealplan:defers:<date>').
-- A simple keyed string-array store; owner-scoped by RLS. Idempotent-ish (guarded
-- by IF NOT EXISTS on the table; policies re-created only on a fresh table).
create table if not exists plan_state (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  values     text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table plan_state enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'plan_state' and policyname = 'plan_state_all') then
    create policy plan_state_all on plan_state for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
