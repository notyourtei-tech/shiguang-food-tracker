-- Keep joins and foreign-key checks fast as consumption history grows.
create index if not exists food_events_food_id_idx on public.food_events (food_id);
