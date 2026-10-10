-- ============================================================
-- Finances : regroupements d'intitulés (détail compacté du Budget).
-- `fin_groups` : règle « la clé automatique `pattern` → le groupe `name` ».
-- La clé automatique est calculée côté app (cleGroupe dans src/lib/finances.ts :
-- mandat de prélèvement, enseigne connue ou intitulé sans numéros) ; la
-- correspondance est EXACTE. Plusieurs clés portant le même nom forment un seul
-- groupe. Le groupe ne sert qu'à compacter le détail : l'intitulé affiché de
-- l'opération ne change pas. L'import Finary n'y touche pas.
-- ============================================================
create table if not exists public.fin_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pattern     text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);
alter table public.fin_groups enable row level security;
create policy "own rows select" on public.fin_groups for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_groups for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_groups for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_groups for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_groups to authenticated, service_role;

-- Partage : lecture avec l'onglet Finances ; regrouper fait partie de « ranger les opérations ».
create policy "partage finances" on public.fin_groups for select to authenticated
  using (public.partage_ouvert(user_id, 'finances'));
create policy "partage classer ajout" on public.fin_groups for insert to authenticated
  with check (public.partage_classer(user_id));
create policy "partage classer modif" on public.fin_groups for update to authenticated
  using (public.partage_classer(user_id)) with check (public.partage_classer(user_id));
create policy "partage classer suppr" on public.fin_groups for delete to authenticated
  using (public.partage_classer(user_id));
