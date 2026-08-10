-- ============================================================
-- Migration 012 — Heures de contrôle (OLAFATCO)
-- Un "job" de saisie : Horizon propose les heures d'après les règles,
-- l'utilisateur valide, puis (étape 2) un agent les saisit sur OLAFATCO
-- et renvoie un rapport de vérification. L'état vit ici pour survivre à
-- la fermeture de la fenêtre Horizon.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

create table if not exists public.olafatco_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  status        text not null default 'a_valider',   -- 'a_valider' | 'valide' | 'en_cours' | 'termine' | 'erreur'
  lines         jsonb not null default '[]'::jsonb,   -- [{ date, shift_code, standard, instructeur, urmn, urme, entered, error }]
  validated_at  timestamptz,                          -- passage à « validé pour envoi »
  report        jsonb,                                -- rapport de vérif (rempli par l'agent, étape 2)
  report_at     timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.olafatco_jobs enable row level security;
create policy "own rows select" on public.olafatco_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.olafatco_jobs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.olafatco_jobs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.olafatco_jobs for delete to authenticated using (user_id = (select auth.uid()));
