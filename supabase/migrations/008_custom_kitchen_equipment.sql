-- Additive-only migration: allow users to store custom cooking utensils alongside standard equipment keys.
-- Existing rows and the 003 equipment check constraint remain intact.

alter table public.kitchen_profiles
  add column if not exists custom_equipment text[] not null default '{}'::text[]
  check (cardinality(custom_equipment) <= 30);

alter table if exists public.user_recipes
  drop constraint if exists user_recipes_equipment_check;
