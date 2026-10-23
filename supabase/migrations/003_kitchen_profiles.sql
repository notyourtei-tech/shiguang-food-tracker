-- Store each user's cooking environment so suggestions remain consistent across devices.
create table if not exists public.kitchen_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipment text[] not null default '{}'::text[] check (
    equipment <@ array['wok', 'frying_pan', 'saucepan', 'microwave', 'oven', 'air_fryer', 'rice_cooker']::text[]
  ),
  updated_at timestamptz not null default now()
);

drop trigger if exists kitchen_profiles_set_updated_at on public.kitchen_profiles;
create trigger kitchen_profiles_set_updated_at before update on public.kitchen_profiles
for each row execute function public.set_updated_at();

alter table public.kitchen_profiles enable row level security;

grant select, insert, update on public.kitchen_profiles to authenticated;

create policy "kitchen profiles are private" on public.kitchen_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners insert kitchen profiles" on public.kitchen_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update kitchen profiles" on public.kitchen_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
