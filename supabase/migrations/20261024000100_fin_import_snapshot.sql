-- Instantané en lecture seule pour l'import (dédoublonnage + catégories), protégé par le même jeton 30 min que
-- fin_import_ops : comptes courants Boursorama, leurs opérations des 100 derniers jours, catégories (avec nb d'opérations)
-- et historique libellé -> catégorie. Aucune écriture.
create or replace function public.fin_import_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.fin_import_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  if v_user is null then
    raise exception 'Jeton d''import invalide ou expiré';
  end if;

  return jsonb_build_object(
    'taken_at', current_date,
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'institution',a.institution,'kind',a.kind,
                   'source',a.source,'external_id',a.external_id,'owner',a.owner,'in_budget',a.in_budget,'balance',a.balance,
                   'balance_source',a.balance_source,'balance_manual_at',a.balance_manual_at)), '[]')
                   from public.fin_accounts a where a.user_id = v_user and a.institution ilike 'bourso%' and a.kind = 'courant'),
    'transactions', (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'account_id',t.account_id,'date',t.date,'amount',t.amount,
                   'label',t.label,'category',c.name,'category_manual',t.category_manual,'internal',t.internal,'excluded',t.excluded,
                   'label_local',t.label_local,'external_id',t.external_id,'source',t.source,'pending',t.pending)), '[]')
                   from public.fin_transactions t left join public.fin_categories c on c.id = t.category_id
                  where t.user_id = v_user and t.date >= current_date - 100
                    and t.account_id in (select id from public.fin_accounts where user_id = v_user and institution ilike 'bourso%' and kind = 'courant')),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'parent',p.name,'role',c.role,
                   'n',(select count(*) from public.fin_transactions t where t.category_id = c.id))), '[]')
                   from public.fin_categories c left join public.fin_categories p on p.id = c.parent_id where c.user_id = v_user),
    'label_cat', (select coalesce(jsonb_agg(jsonb_build_array(k, cat, n, man)), '[]') from (
                   select lower(btrim(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i'))) k, c.name cat, count(*) n,
                          count(*) filter (where t.category_manual) man
                     from public.fin_transactions t join public.fin_categories c on c.id = t.category_id
                    where t.user_id = v_user group by 1, 2) q)
  );
end $$;

revoke all on function public.fin_import_snapshot(text) from public;
grant execute on function public.fin_import_snapshot(text) to anon, service_role;
