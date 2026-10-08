-- ============================================================
-- Partage d'onglets avec un autre compte (ex. Honorine).
--
-- Le propriétaire choisit les onglets partagés ; la BASE applique le partage
-- (policies RLS), pas seulement l'écran. Lien sûr :
--   1. le membre s'inscrit lui-même avec l'e-mail prévu ;
--   2. à la connexion, `rejoindre_partage()` relie son compte (e-mail CONFIRMÉ) ;
--   3. le propriétaire valide (`actif`) — rien n'est lisible avant.
--
-- Temps (lecture seule) : évènements seulement (si `temps_taches_masquees`),
-- jamais les projets de `temps_projets_masques` ni leurs tâches ; pas de
-- bloc-notes (layouts), ni de propositions Céleste, ni de vérifications.
-- Finances : budget, bilan, patrimoine. Lecture des lignes, catégories,
-- budgets, comptes, historique, intitulés et opérations des comptes du budget.
-- Si `finances_classer` : ranger les opérations (catégorie, titulaire,
-- intitulé local — garde par déclencheur) et gérer les intitulés locaux.
-- ============================================================

create table if not exists public.partages (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  member_email          text not null,
  member_id             uuid references auth.users(id) on delete set null,
  actif                 boolean not null default false,
  onglets               text[] not null default '{}',
  finances_classer      boolean not null default true,
  temps_projets_masques uuid[] not null default '{}',
  temps_taches_masquees boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (owner_id, member_email)
);
alter table public.partages enable row level security;
create policy "proprietaire" on public.partages for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "membre lecture" on public.partages for select to authenticated
  using (member_id = (select auth.uid()));
grant select, insert, update, delete on public.partages to authenticated, service_role;

-- Le compte connecté (confirmé) rejoint les partages prévus pour son e-mail.
create or replace function public.rejoindre_partage()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.partages p set member_id = u.id
    from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null
     and lower(p.member_email) = lower(u.email) and p.member_id is null
     and p.owner_id <> u.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rejoindre_partage() from public;
grant execute on function public.rejoindre_partage() to authenticated;

-- Partage actif de `p_owner` vers l'utilisateur connecté pour cet onglet ?
create or replace function public.partage_ouvert(p_owner uuid, p_onglet text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partages p
                  where p.owner_id = p_owner and p.member_id = (select auth.uid())
                    and p.actif and p_onglet = any (p.onglets));
$$;
-- Le même, et le membre peut ranger les opérations.
create or replace function public.partage_classer(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partages p
                  where p.owner_id = p_owner and p.member_id = (select auth.uid())
                    and p.actif and 'finances' = any (p.onglets) and p.finances_classer);
$$;
-- Une tâche de Temps est-elle visible du membre ?
create or replace function public.partage_tache_visible(p_owner uuid, p_project uuid, p_is_task boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partages p
                  where p.owner_id = p_owner and p.member_id = (select auth.uid())
                    and p.actif and 'temps' = any (p.onglets)
                    and (p_project is null or not (p_project = any (p.temps_projets_masques)))
                    and (not p.temps_taches_masquees or not coalesce(p_is_task, true)));
$$;
revoke all on function public.partage_ouvert(uuid, text) from public;
revoke all on function public.partage_classer(uuid) from public;
revoke all on function public.partage_tache_visible(uuid, uuid, boolean) from public;
grant execute on function public.partage_ouvert(uuid, text) to authenticated;
grant execute on function public.partage_classer(uuid) to authenticated;
grant execute on function public.partage_tache_visible(uuid, uuid, boolean) to authenticated;

-- ---------- Temps (lecture) ----------
create policy "partage temps" on public.tasks for select to authenticated
  using (public.partage_tache_visible(user_id, project_id, is_task));
create policy "partage temps" on public.projects for select to authenticated
  using (public.partage_ouvert(user_id, 'temps')
         and not exists (select 1 from public.partages p
                          where p.owner_id = projects.user_id and p.member_id = (select auth.uid())
                            and projects.id = any (p.temps_projets_masques)));
create policy "partage temps" on public.domains for select to authenticated
  using (public.partage_ouvert(user_id, 'temps') or public.partage_ouvert(user_id, 'finances'));
create policy "partage temps" on public.birthdays for select to authenticated
  using (public.partage_ouvert(user_id, 'temps'));

-- ---------- Finances (lecture) ----------
do $$
declare t text;
begin
  foreach t in array array['fin_lines', 'fin_categories', 'fin_budgets', 'fin_accounts', 'fin_networth', 'fin_labels'] loop
    execute format('create policy "partage finances" on public.%I for select to authenticated using (public.partage_ouvert(user_id, %L))', t, 'finances');
  end loop;
end $$;
create policy "partage finances" on public.fin_transactions for select to authenticated
  using (public.partage_ouvert(user_id, 'finances')
         and exists (select 1 from public.fin_accounts a where a.id = account_id and a.in_budget));

-- ---------- Finances (ranger) ----------
create policy "partage classer" on public.fin_transactions for update to authenticated
  using (public.partage_classer(user_id)) with check (public.partage_classer(user_id));
create policy "partage classer ajout" on public.fin_labels for insert to authenticated
  with check (public.partage_classer(user_id));
create policy "partage classer modif" on public.fin_labels for update to authenticated
  using (public.partage_classer(user_id)) with check (public.partage_classer(user_id));
create policy "partage classer suppr" on public.fin_labels for delete to authenticated
  using (public.partage_classer(user_id));

-- Un membre ne change d'une opération que sa catégorie, son titulaire et son intitulé local.
create or replace function public.fin_transactions_garde_partage()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> old.user_id then
    if (new.user_id, new.account_id, new.date, new.amount, new.label, new.internal, new.excluded,
        new.note, new.source, new.external_id)
       is distinct from
       (old.user_id, old.account_id, old.date, old.amount, old.label, old.internal, old.excluded,
        old.note, old.source, old.external_id) then
      raise exception 'En partage, seuls la catégorie, le titulaire et l''intitulé d''une opération sont modifiables';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_transactions_garde_partage on public.fin_transactions;
create trigger fin_transactions_garde_partage before update on public.fin_transactions
  for each row execute function public.fin_transactions_garde_partage();

-- Prénom affiché du membre (ex. « Honorine »).
alter table public.partages add column if not exists member_name text;
