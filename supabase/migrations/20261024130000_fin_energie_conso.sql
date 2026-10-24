-- Finances : relevés réels Engie (export CSV « Ma conso »), un relevé par période.
-- Rollback : drop table if exists public.fin_energie_conso;
create table if not exists public.fin_energie_conso (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  site          text not null check (site in ('reims','taissy')),
  energie       text not null check (energie in ('elec','gaz')),
  periode_debut date not null,
  periode_fin   date not null,
  kwh           numeric,
  kwh_hp        numeric,
  kwh_hc        numeric,
  m3            numeric,
  type_releve   text,
  source        text not null default 'engie_csv',
  created_at    timestamptz not null default now(),
  unique (user_id, site, energie, periode_debut)
);
alter table public.fin_energie_conso enable row level security;
create policy "own rows select" on public.fin_energie_conso for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.fin_energie_conso for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.fin_energie_conso for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.fin_energie_conso for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fin_energie_conso to authenticated, service_role;
create policy "partage finances" on public.fin_energie_conso for select to authenticated
  using (public.partage_ouvert(user_id, 'finances'));
