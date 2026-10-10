-- ============================================================
-- Finances : échéanciers de prêts (tableaux d'amortissement).
-- Une ligne par échéance : la part de capital amorti compte comme « épargné »
-- (Budget, Bilan). On n'y met que les prêts dont le capital remboursé doit compter.
-- Les montants sont posés directement en base (jamais dans le dépôt public).
-- ============================================================
create table if not exists public.fin_echeances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid not null references public.fin_accounts(id) on delete cascade,
  date        date not null,
  capital     numeric(12,2) not null default 0,
  interets    numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (account_id, date)
);
alter table public.fin_echeances enable row level security;
create policy "own rows select" on public.fin_echeances for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_echeances for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_echeances for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_echeances for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_echeances to authenticated, service_role;
create index if not exists fin_echeances_user_date on public.fin_echeances (user_id, date);

-- Partage : lecture avec l'onglet Finances (l'« épargné » du budget en dépend).
create policy "partage finances" on public.fin_echeances for select to authenticated
  using (public.partage_ouvert(user_id, 'finances'));
