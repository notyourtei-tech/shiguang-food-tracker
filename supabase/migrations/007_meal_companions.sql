-- Additive-only migration: independent supplements & medications tracker ("meal companions").
-- Deliberately decoupled from food_items so medicines/supplements never mix into food inventory or recipe matching.

create table if not exists public.meal_companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null default 'supplement'
    check (kind in ('supplement', 'medicine')),
  timing text not null default 'after_meal'
    check (timing in ('before_meal', 'with_meal', 'after_meal', 'empty_stomach', 'bedtime', 'as_needed')),
  dose_per_take numeric(12,3) not null default 1
    check (dose_per_take > 0 and dose_per_take <= 9999),
  initial_amount numeric(12,3) not null
    check (initial_amount > 0 and initial_amount <= 999999999),
  remaining_amount numeric(12,3) not null
    check (remaining_amount >= 0 and remaining_amount <= initial_amount),
  unit text not null default '粒' check (char_length(trim(unit)) between 1 and 12),
  expires_on date,
  note text not null default '' check (char_length(note) <= 300),
  last_taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_companions_owner_timing_idx
  on public.meal_companions (user_id, timing, expires_on);

drop trigger if exists meal_companions_set_updated_at on public.meal_companions;
create trigger meal_companions_set_updated_at before update on public.meal_companions
for each row execute function public.set_updated_at();

alter table public.meal_companions enable row level security;

grant select, insert, update, delete on public.meal_companions to authenticated;

drop policy if exists "meal companions are private" on public.meal_companions;
create policy "meal companions are private" on public.meal_companions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owners insert meal companions" on public.meal_companions;
create policy "owners insert meal companions" on public.meal_companions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "owners update meal companions" on public.meal_companions;
create policy "owners update meal companions" on public.meal_companions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "owners delete meal companions" on public.meal_companions;
create policy "owners delete meal companions" on public.meal_companions
  for delete to authenticated using ((select auth.uid()) = user_id);
