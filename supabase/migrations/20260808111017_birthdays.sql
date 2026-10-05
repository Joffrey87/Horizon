-- ============================================================
-- Migration 009 — Anniversaires (récurrence annuelle jour+mois)
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe) le 2026-08-09.
-- ============================================================

create table if not exists public.birthdays (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  day        int not null check (day between 1 and 31),
  month      int not null check (month between 1 and 12),
  created_at timestamptz not null default now()
);

alter table public.birthdays enable row level security;
create policy "own rows select" on public.birthdays for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.birthdays for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.birthdays for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.birthdays for delete to authenticated using (user_id = (select auth.uid()));
