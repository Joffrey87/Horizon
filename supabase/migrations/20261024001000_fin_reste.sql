-- ============================================================
-- Finances : tuile « RESTE » (solde actuel des comptes courants − dépenses à venir d'ici la fin du mois).
-- `fin_reste_ajustements` : corrections faites sur les récurrentes détectées automatiquement.
--   cle      : clé de regroupement de l'intitulé (cleGroupe, ex. « enseigne:netflix »)
--   ignore   : true -> cette dépense récurrente n'est plus comptée
--   montant  : montant retenu à la place du montant détecté (positif = dépense) ; null = montant détecté
-- Les dépenses prévues à la main (libellé, montant, date) sont dans `fin_planned` (page « À venir »).
-- ============================================================
create table if not exists public.fin_reste_ajustements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  cle         text not null,
  nom         text,
  ignore      boolean not null default false,
  montant     numeric(12,2),
  created_at  timestamptz not null default now(),
  unique (user_id, cle)
);
alter table public.fin_reste_ajustements enable row level security;
create policy "own rows select" on public.fin_reste_ajustements for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_reste_ajustements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_reste_ajustements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_reste_ajustements for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_reste_ajustements to authenticated, service_role;
