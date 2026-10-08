-- ============================================================
-- Finances : valeur d'un compte saisie dans Horizon (biens immobiliers, prêts).
--   balance            = valeur retenue partout (saisie ou, à défaut, source)
--   balance_source     = dernière valeur reçue de la source (Finary)
--   balance_manual_at  = non nul : saisie dans Horizon, l'import ne touche plus `balance`
--   acquired_on        = date d'achat d'un bien : l'historique du patrimoine compte
--                        sa valeur retenue depuis cette date (réécriture du passé)
-- ============================================================
alter table public.fin_accounts
  add column if not exists balance_source numeric(14,2),
  add column if not exists balance_manual_at timestamptz,
  add column if not exists acquired_on date;

update public.fin_accounts set balance_source = balance where balance_source is null;

create or replace function public.fin_import(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_source text := coalesce(p_payload->>'source', 'import');
  n_acc int := 0; n_cat int := 0; n_tx int := 0; n_hold int := 0; n_nw int := 0;
begin
  select user_id into v_user from public.fin_import_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and expires_at > now();
  if v_user is null then
    raise exception 'Jeton d''import invalide ou expiré';
  end if;

  -- Comptes : titulaire, budget, archivage, valeur saisie et date d'achat réglés
  -- dans Horizon restent les leurs ; la valeur de la source est toujours gardée à part.
  insert into public.fin_accounts (user_id, source, external_id, name, institution, kind, subtype, owner, in_budget,
                                   balance, balance_source, balance_at, acquired_on)
  select v_user, v_source, a->>'external_id', a->>'name', a->>'institution', a->>'kind', a->>'subtype',
         coalesce(a->>'owner', 'joffrey'), coalesce((a->>'in_budget')::boolean, false),
         coalesce((a->>'balance')::numeric, 0), coalesce((a->>'balance')::numeric, 0), now(),
         (a->>'acquired_on')::date
    from jsonb_array_elements(coalesce(p_payload->'accounts', '[]')) a
  on conflict (user_id, source, external_id) do update
     set name = excluded.name, institution = excluded.institution, kind = excluded.kind,
         subtype = excluded.subtype, balance_source = excluded.balance_source, balance_at = excluded.balance_at,
         balance = case when public.fin_accounts.balance_manual_at is not null
                        then public.fin_accounts.balance else excluded.balance end,
         acquired_on = coalesce(public.fin_accounts.acquired_on, excluded.acquired_on);
  get diagnostics n_acc = row_count;

  -- Catégories : la ligne de budget n'est posée qu'à la création.
  insert into public.fin_categories (user_id, source, external_id, name, role, line_id)
  select v_user, v_source, c->>'external_id', c->>'name', coalesce(c->>'role', 'depense'),
         (select l.id from public.fin_lines l where l.user_id = v_user and l.name = c->>'line' limit 1)
    from jsonb_array_elements(coalesce(p_payload->'categories', '[]')) c
  -- Une catégorie retouchée dans Horizon (nom, place, fusion : `manual`) garde sa forme.
  on conflict (user_id, source, external_id) do update
     set name = case when public.fin_categories.manual then public.fin_categories.name else excluded.name end;
  get diagnostics n_cat = row_count;

  update public.fin_categories child
     set parent_id = parent.id
    from jsonb_array_elements(coalesce(p_payload->'categories', '[]')) c
    join public.fin_categories parent
      on parent.user_id = v_user and parent.source = v_source and parent.external_id = c->>'parent_external_id'
   where child.user_id = v_user and child.source = v_source and child.external_id = c->>'external_id'
     and not child.manual
     and child.parent_id is distinct from parent.id;

  -- Opérations : une catégorie choisie dans Horizon n'est jamais écrasée.
  insert into public.fin_transactions (user_id, source, external_id, account_id, date, amount, label, category_id, internal, excluded)
  select v_user, v_source, t->>'external_id', acc.id, (t->>'date')::date, (t->>'amount')::numeric,
         coalesce(t->>'label', ''), cat.id, coalesce((t->>'internal')::boolean, false),
         coalesce((t->>'excluded')::boolean, false)
    from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
    join public.fin_accounts acc
      on acc.user_id = v_user and acc.source = v_source and acc.external_id = t->>'account_external_id'
    left join public.fin_categories cat
      on cat.user_id = v_user and cat.source = v_source and cat.external_id = t->>'category_external_id'
  on conflict (user_id, source, external_id) do update
     set date = excluded.date, amount = excluded.amount, label = excluded.label,
         internal = excluded.internal, account_id = excluded.account_id,
         category_id = case when public.fin_transactions.category_manual
                            then public.fin_transactions.category_id else excluded.category_id end;
  get diagnostics n_tx = row_count;

  -- Positions : on remplace celles des comptes reçus (une position vendue disparaît).
  if p_payload ? 'holdings' then
    delete from public.fin_holdings h
     using public.fin_accounts acc
     where h.user_id = v_user and h.source = v_source and h.account_id = acc.id
       and acc.external_id in (select x->>'external_id' from jsonb_array_elements(coalesce(p_payload->'accounts', '[]')) x)
       and h.external_id not in (select x->>'external_id' from jsonb_array_elements(p_payload->'holdings') x);
    insert into public.fin_holdings (user_id, source, external_id, account_id, name, code, quantity, value, buy_value, asset_class, updated_at)
    select v_user, v_source, h->>'external_id', acc.id, h->>'name', h->>'code', (h->>'quantity')::numeric,
           coalesce((h->>'value')::numeric, 0), (h->>'buy_value')::numeric, coalesce(h->>'asset_class', 'autre'), now()
      from jsonb_array_elements(p_payload->'holdings') h
      join public.fin_accounts acc
        on acc.user_id = v_user and acc.source = v_source and acc.external_id = h->>'account_external_id'
    on conflict (user_id, source, external_id) do update
       set account_id = excluded.account_id, name = excluded.name, code = excluded.code,
           quantity = excluded.quantity, value = excluded.value, buy_value = excluded.buy_value,
           updated_at = excluded.updated_at,
           asset_class = case when public.fin_holdings.class_manual
                              then public.fin_holdings.asset_class else excluded.asset_class end;
    get diagnostics n_hold = row_count;
  end if;

  insert into public.fin_networth (user_id, source, date, net, gross, immobilier, prets, investissements, metaux, liquidites, crypto)
  select v_user, v_source, (w->>'date')::date, (w->>'net')::numeric, (w->>'gross')::numeric,
         (w->>'immobilier')::numeric, (w->>'prets')::numeric, (w->>'investissements')::numeric,
         (w->>'metaux')::numeric, (w->>'liquidites')::numeric, (w->>'crypto')::numeric
    from jsonb_array_elements(coalesce(p_payload->'networth', '[]')) w
  on conflict (user_id, date) do update
     set net = excluded.net, gross = excluded.gross, source = excluded.source,
         immobilier = coalesce(excluded.immobilier, public.fin_networth.immobilier),
         prets = coalesce(excluded.prets, public.fin_networth.prets),
         investissements = coalesce(excluded.investissements, public.fin_networth.investissements),
         metaux = coalesce(excluded.metaux, public.fin_networth.metaux),
         liquidites = coalesce(excluded.liquidites, public.fin_networth.liquidites),
         crypto = coalesce(excluded.crypto, public.fin_networth.crypto);
  get diagnostics n_nw = row_count;

  return jsonb_build_object('comptes', n_acc, 'categories', n_cat, 'operations', n_tx, 'positions', n_hold, 'patrimoine', n_nw);
end $$;
