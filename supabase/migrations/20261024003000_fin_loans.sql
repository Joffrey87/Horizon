-- ============================================================
-- Finances : fiches de prêt.
-- Une fiche par compte de type 'pret' (1:1) : conditions du contrat (taux, durée,
-- mensualité, assurance…) avec l'origine de chaque champ (manual / finary / estimated / pdf).
-- Les échéances gagnent : assurance, frais, capital restant dû, rang et source.
-- Les chiffres sont posés directement en base (jamais dans le dépôt public).
-- ============================================================
create table if not exists public.fin_loans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null references public.fin_accounts(id) on delete cascade,
  lender              text,
  contract_ref        text,
  loan_type           text,
  start_date          date,           -- 1re échéance (ou déblocage)
  duration_months     integer,
  borrowed_capital    numeric(12,2),
  rate_nominal        numeric(7,4),   -- en %, ex. 1.3
  rate_taeg           numeric(7,4),
  monthly_payment     numeric(12,2),  -- hors assurance
  insurance_monthly   numeric(12,2),  -- assurance incluse dans l'échéance
  insurance_extra     numeric(12,2),  -- assurance prélevée à part (ex. Cardif)
  fees                numeric(12,2),
  debit_match         text,           -- motif du libellé des prélèvements réels (regex insensible à la casse)
  debit_account_ids   uuid[] not null default '{}',  -- comptes où les prélèvements apparaissent
  notes               text,
  origins             jsonb not null default '{}'::jsonb,  -- { champ: 'manual'|'finary'|'estimated'|'pdf' }
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (account_id)
);
alter table public.fin_loans enable row level security;
create policy "own rows select" on public.fin_loans for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_loans for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_loans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_loans for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_loans to authenticated, service_role;
create index if not exists fin_loans_user on public.fin_loans (user_id);
create policy "partage finances" on public.fin_loans for select to authenticated
  using (public.partage_ouvert(user_id, 'finances'));

-- Échéances : colonnes du tableau d'amortissement complet.
alter table public.fin_echeances
  add column if not exists assurance  numeric(12,2) not null default 0,
  add column if not exists frais      numeric(12,2) not null default 0,
  add column if not exists restant_du numeric(12,2),
  add column if not exists rang       integer,
  add column if not exists source     text not null default 'finary';
