-- ============================================================
-- Entraînement : historique des séances de musculation (onglet /entrainement).
-- Une ligne par séance terminée ; les séries de travail sont dans `sets`
-- (jsonb : exerciceId, exerciceNom, numero, cote, cible, kg, reps, secondes).
-- La séance en cours reste sur l'appareil (localStorage) jusqu'à l'enregistrement.
-- ============================================================
create table if not exists public.training_sessions (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_type  text not null check (session_type in ('A', 'B')),
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  duration_sec  integer not null,
  notes         text,
  sets          jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.training_sessions enable row level security;
create policy "own rows select" on public.training_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.training_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.training_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.training_sessions for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.training_sessions to authenticated, service_role;
create index if not exists training_sessions_user_started on public.training_sessions (user_id, started_at desc);
