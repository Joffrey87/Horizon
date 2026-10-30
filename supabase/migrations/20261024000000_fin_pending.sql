-- Opérations « en attente » (autorisations carte non encore comptabilisées, statut PDNG chez Boursorama).
-- - fin_transactions.pending : true tant que la banque ne l'a pas comptabilisée. Elle compte déjà dans le solde
--   temps réel ; l'interface l'affiche « en attente ».
-- - fin_import_ops : accepte `pending` par opération, et `pending_sync` (ids de comptes dont la liste PDNG est
--   complète) : les lignes pending de la source qui ne sont plus en attente sont retirées (la ligne comptabilisée
--   arrive, elle, avec son propre external_id).
alter table public.fin_transactions add column if not exists pending boolean not null default false;

-- Le compte courant concerné existe déjà en base. Pas de libellé ni d'identifiant ici.

create or replace function public.fin_import_ops(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_source text := coalesce(p_payload->>'source', 'bourso');
  n_tx int := 0; n_pend int := 0; n_bal int := 0; n_drop int := 0;
begin
  select user_id into v_user from public.fin_import_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  if v_user is null then
    raise exception 'Jeton d''import invalide ou expiré';
  end if;

  -- Opérations en attente qui ne le sont plus (comptabilisées ou annulées) : retirées pour les comptes listés.
  delete from public.fin_transactions x
   where x.user_id = v_user and x.source = v_source and x.pending
     and x.account_id in (select (a)::uuid from jsonb_array_elements_text(coalesce(p_payload->'pending_sync', '[]')) a)
     and x.external_id not in (select t->>'external_id' from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
                                where coalesce((t->>'pending')::boolean, false));
  get diagnostics n_drop = row_count;

  insert into public.fin_transactions (user_id, source, external_id, account_id, date, amount, label, category_id, internal, excluded, pending)
  select v_user, v_source, t->>'external_id', acc.id, (t->>'date')::date, (t->>'amount')::numeric,
         coalesce(t->>'label', ''),
         (select c.id from public.fin_categories c where c.user_id = v_user and c.id = nullif(t->>'category_id','')::uuid),
         coalesce((t->>'internal')::boolean, false), coalesce((t->>'excluded')::boolean, false),
         coalesce((t->>'pending')::boolean, false)
    from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
    join public.fin_accounts acc on acc.user_id = v_user and acc.id = (t->>'account_id')::uuid
  on conflict (user_id, source, external_id) do nothing;
  get diagnostics n_tx = row_count;

  select count(*) into n_pend from public.fin_transactions x
   where x.user_id = v_user and x.source = v_source and x.pending;

  -- Soldes : balance_source/balance_at toujours ; balance seulement sans saisie manuelle ;
  -- balance_manual_at n'est jamais touché.
  update public.fin_accounts a
     set balance_source = (b->>'balance')::numeric,
         balance_at = now(),
         balance = case when a.balance_manual_at is null then (b->>'balance')::numeric else a.balance end
    from jsonb_array_elements(coalesce(p_payload->'balances', '[]')) b
   where a.user_id = v_user and a.id = (b->>'account_id')::uuid;
  get diagnostics n_bal = row_count;

  return jsonb_build_object('operations', n_tx, 'en_attente_total', n_pend, 'en_attente_retirees', n_drop, 'soldes', n_bal);
end $$;

revoke all on function public.fin_import_ops(text, jsonb) from public;
grant execute on function public.fin_import_ops(text, jsonb) to anon, service_role;
