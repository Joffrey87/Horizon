-- ============================================================
-- Migration 010 — Vérifications (alertes configurables par l'utilisateur)
-- Une "vérification" est une règle personnelle qui remonte quand il faut
-- s'en occuper : soit périodique (tous les N jours), soit conditionnelle
-- (ex. « trouver une messe si je travaille un dimanche / 1er vendredi / 1er samedi »).
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

create table if not exists public.checks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  kind          text not null default 'periodique',   -- 'periodique' | 'messe_travail'
  domain_id     uuid references public.domains(id) on delete set null,
  link          text,                                  -- URL utile (ex. messes.info)
  interval_days int,                                   -- cadence (kind = periodique)
  window_months int not null default 6,               -- fenêtre d'évaluation (mois)
  config        jsonb not null default '{}'::jsonb,    -- paramètres additionnels
  resolved      jsonb not null default '[]'::jsonb,    -- dates ISO déjà traitées (messe_travail)
  last_done_at  timestamptz,                           -- dernier « vérifié » (periodique)
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.checks enable row level security;
create policy "own rows select" on public.checks for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.checks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.checks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.checks for delete to authenticated using (user_id = (select auth.uid()));
