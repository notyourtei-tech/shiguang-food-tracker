-- Keep each signed-in person's presentation preference with their cloud data.
-- The client also retains a per-user local copy for offline and first-load continuity.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'ja' check (language in ('en', 'zh', 'ja', 'ko')),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

grant select, insert, update on public.user_preferences to authenticated;

create policy "user preferences are private" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners insert user preferences" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update user preferences" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
