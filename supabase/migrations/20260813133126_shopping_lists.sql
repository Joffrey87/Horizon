-- ============================================================
-- Migration 016 — Listes de courses (page « Listes » sous Vérifications)
-- Listes simples (ex. Travaux) et liste récurrente à 3 rayons. Chaque
-- article se coche quand il est acheté (sans être rayé).
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

create table if not exists public.shopping_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  recurrent   boolean not null default false,   -- liste récurrente à 3 rayons
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.shopping_lists enable row level security;
create policy "own rows select" on public.shopping_lists for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.shopping_lists for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.shopping_lists for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.shopping_lists for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  list_id     uuid not null references public.shopping_lists(id) on delete cascade,
  label       text not null,
  section     text,                             -- 'alimentaire'|'bio'|'non_alimentaire' (liste récurrente) ; null sinon
  checked     boolean not null default false,   -- acheté (coché, sans rayer)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists shopping_items_list_idx on public.shopping_items(list_id);

alter table public.shopping_items enable row level security;
create policy "own rows select" on public.shopping_items for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.shopping_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.shopping_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.shopping_items for delete to authenticated using (user_id = (select auth.uid()));
