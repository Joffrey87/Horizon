-- Prix ou fourchette de prix d'un article de liste.
alter table public.shopping_items add column if not exists price_min numeric, add column if not exists price_max numeric;
