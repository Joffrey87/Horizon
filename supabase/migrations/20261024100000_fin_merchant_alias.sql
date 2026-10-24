-- Finances : commerçant renommé. `fin_merchant_alias` : la clé automatique `pattern`
-- (cleGroupe dans src/lib/finances.ts, correspondance EXACTE) → l'intitulé `label`
-- affiché pour toutes ses opérations, prochains imports compris. Mêmes droits que fin_groups.
create table if not exists public.fin_merchant_alias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pattern     text not null,
  label       text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);
alter table public.fin_merchant_alias enable row level security;
create policy "own rows select" on public.fin_merchant_alias for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_merchant_alias for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_merchant_alias for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_merchant_alias for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_merchant_alias to authenticated, service_role;

-- Partage : lecture avec l'onglet Finances ; regrouper fait partie de « ranger les opérations ».
create policy "partage finances" on public.fin_merchant_alias for select to authenticated
  using (public.partage_ouvert(user_id, 'finances'));
create policy "partage classer ajout" on public.fin_merchant_alias for insert to authenticated
  with check (public.partage_classer(user_id));
create policy "partage classer modif" on public.fin_merchant_alias for update to authenticated
  using (public.partage_classer(user_id)) with check (public.partage_classer(user_id));
create policy "partage classer suppr" on public.fin_merchant_alias for delete to authenticated
  using (public.partage_classer(user_id));
