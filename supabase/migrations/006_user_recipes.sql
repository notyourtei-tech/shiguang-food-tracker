-- Additive-only migration: user-authored custom recipes, isolated per user via RLS.
-- Existing tables (food_items, food_events, kitchen_profiles, user_preferences) are untouched.

create table if not exists public.user_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  cuisine text not null default 'custom'
    check (cuisine in ('custom', 'china', 'korea', 'japan', 'western')),
  ingredients text[] not null
    check (cardinality(ingredients) between 1 and 20),
  seasonings text[] not null default '{}'::text[]
    check (
      seasonings <@ array[
        'oil', 'salt', 'soy', 'miso', 'sugar', 'vinegar',
        'oyster', 'pepper', 'chiliSauce', 'sesamePaste', 'tomatoSauce', 'cheese'
      ]::text[]
    ),
  equipment text[] not null default '{}'::text[]
    check (cardinality(equipment) <= 20),
  copy text not null default '' check (char_length(copy) <= 240),
  steps text[] not null default '{}'::text[] check (cardinality(steps) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_recipes_owner_created_idx
  on public.user_recipes (user_id, created_at desc);

drop trigger if exists user_recipes_set_updated_at on public.user_recipes;
create trigger user_recipes_set_updated_at before update on public.user_recipes
for each row execute function public.set_updated_at();

alter table public.user_recipes enable row level security;

grant select, insert, update, delete on public.user_recipes to authenticated;

drop policy if exists "user recipes are private" on public.user_recipes;
create policy "user recipes are private" on public.user_recipes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owners insert user recipes" on public.user_recipes;
create policy "owners insert user recipes" on public.user_recipes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "owners update user recipes" on public.user_recipes;
create policy "owners update user recipes" on public.user_recipes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "owners delete user recipes" on public.user_recipes;
create policy "owners delete user recipes" on public.user_recipes
  for delete to authenticated using ((select auth.uid()) = user_id);
