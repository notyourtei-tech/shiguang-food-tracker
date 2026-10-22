-- 食光多人版：所有业务表都受 RLS 保护；浏览器只能访问自己的记录。
create extension if not exists pgcrypto;

create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null check (category in ('蔬菜','水果','肉蛋','乳制品','主食','调味品','零食','饮品','其他')),
  initial_amount numeric(12,3) not null check (initial_amount > 0),
  remaining_amount numeric(12,3) not null check (remaining_amount >= 0 and remaining_amount <= initial_amount),
  unit text not null check (char_length(trim(unit)) between 1 and 12),
  purchased_on date not null default current_date,
  expires_on date,
  storage text not null default '冷藏',
  note text not null default '' check (char_length(note) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_items_owner_active_idx on public.food_items (user_id, deleted_at, expires_on);

create table if not exists public.food_events (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id),
  user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('created','consumed','adjusted','restored')),
  amount numeric(12,3) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists food_events_owner_created_idx on public.food_events (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists food_items_set_updated_at on public.food_items;
create trigger food_items_set_updated_at before update on public.food_items
for each row execute function public.set_updated_at();

alter table public.food_items enable row level security;
alter table public.food_events enable row level security;

create policy "food items are private" on public.food_items
  for select using ((select auth.uid()) = user_id);
create policy "owners insert food items" on public.food_items
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update food items" on public.food_items
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Soft deletion retains the record and audit trail; no client DELETE policy is granted.

create policy "food events are private" on public.food_events
  for select using ((select auth.uid()) = user_id);
create policy "owners append food events" on public.food_events
  for insert with check ((select auth.uid()) = user_id);

