-- Additive-only migration: existing food rows stay intact and are marked
-- "unknown" until their owner chooses a freshness/condition value.
alter table public.food_items
  add column if not exists food_condition text not null default 'unknown'
    check (food_condition in ('unknown', 'fresh', 'frozen', 'thawed', 'opened', 'use_soon')),
  add column if not exists estimated_minutes integer
    check (estimated_minutes is null or estimated_minutes between 0 and 1440),
  add column if not exists ready_to_eat boolean not null default false;

-- A ready-to-eat item always sorts as zero minutes; unselected durations remain
-- NULL so they can be displayed and sorted after known times.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'food_items_ready_time_consistency'
      and conrelid = 'public.food_items'::regclass
  ) then
    alter table public.food_items add constraint food_items_ready_time_consistency
      check (not ready_to_eat or estimated_minutes = 0);
  end if;
end;
$$;

create index if not exists food_items_owner_ready_time_idx
  on public.food_items (user_id, deleted_at, ready_to_eat desc, estimated_minutes asc nulls last);
