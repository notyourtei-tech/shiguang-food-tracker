-- 009_companion_daily_doses.sql
-- Additive multi-dose daily tracking columns for meal_companions.
-- Does not modify or delete any existing user data.

alter table public.meal_companions
  add column if not exists daily_target integer not null default 1,
  add column if not exists taken_today_count integer not null default 0,
  add column if not exists taken_today_date date;

alter table public.meal_companions
  add constraint meal_companions_daily_target_check
  check (daily_target >= 1 and daily_target <= 12);

alter table public.meal_companions
  add constraint meal_companions_taken_today_count_check
  check (taken_today_count >= 0 and taken_today_count <= 99);
