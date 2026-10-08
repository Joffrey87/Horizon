-- ============================================================
-- Finances : intitulés locaux.
-- `fin_labels` : règle « l'intitulé (nettoyé) contient `pattern` → afficher
-- `label` ». Le nettoyage (minuscules, sans accents, sans « CB*1234 ») est fait
-- côté app (normaliserLibelle dans src/lib/finances.ts) ; le motif le plus long
-- l'emporte. `fin_transactions.label_local` : intitulé propre à une opération,
-- prioritaire sur les règles. L'import Finary ne touche à aucun des deux.
-- ============================================================
create table if not exists public.fin_labels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pattern     text not null,
  label       text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);
alter table public.fin_labels enable row level security;
create policy "own rows select" on public.fin_labels for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_labels for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_labels for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_labels for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_labels to authenticated, service_role;

alter table public.fin_transactions add column if not exists label_local text;
