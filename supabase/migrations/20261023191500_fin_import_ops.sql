-- Migration : import d'opérations bancaires (Boursorama…)
-- vers des comptes existants (rattachés par id, quelle que soit leur source), sans Finary.
-- Idempotent : unique(user_id, source, external_id) -> on conflict do nothing
-- (une ligne déjà là, éventuellement recatégorisée à la main, n'est jamais modifiée).
create or replace function public.fin_import_ops(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_source text := coalesce(p_payload->>'source', 'bourso');
  n_tx int := 0; n_bal int := 0;
begin
  select user_id into v_user from public.fin_import_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  if v_user is null then
    raise exception 'Jeton d''import invalide ou expiré';
  end if;

  insert into public.fin_transactions (user_id, source, external_id, account_id, date, amount, label, category_id, internal, excluded)
  select v_user, v_source, t->>'external_id', acc.id, (t->>'date')::date, (t->>'amount')::numeric,
         coalesce(t->>'label', ''),
         (select c.id from public.fin_categories c where c.user_id = v_user and c.id = nullif(t->>'category_id','')::uuid),
         coalesce((t->>'internal')::boolean, false), coalesce((t->>'excluded')::boolean, false)
    from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
    join public.fin_accounts acc on acc.user_id = v_user and acc.id = (t->>'account_id')::uuid
  on conflict (user_id, source, external_id) do nothing;
  get diagnostics n_tx = row_count;

  -- Soldes : balance_source/balance_at toujours ; balance seulement sans saisie manuelle ;
  -- balance_manual_at n'est jamais touché.
  update public.fin_accounts a
     set balance_source = (b->>'balance')::numeric,
         balance_at = now(),
         balance = case when a.balance_manual_at is null then (b->>'balance')::numeric else a.balance end
    from jsonb_array_elements(coalesce(p_payload->'balances', '[]')) b
   where a.user_id = v_user and a.id = (b->>'account_id')::uuid;
  get diagnostics n_bal = row_count;

  return jsonb_build_object('operations', n_tx, 'soldes', n_bal);
end $$;

revoke all on function public.fin_import_ops(text, jsonb) from public;
grant execute on function public.fin_import_ops(text, jsonb) to anon, service_role;
