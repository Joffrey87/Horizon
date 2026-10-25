-- ============================================================
-- Synchro bancaire automatique (Enable Banking) — sans le bot.
-- * fin_bank_connections : une connexion par banque (Boursorama, Crédit Coopératif), comptes EB -> comptes Horizon,
--   date d'expiration du consentement (alerte dans l'app 14 j avant), dernier résultat / erreur.
--   L'utilisateur lit ses connexions (sauf session_id) ; seules les Edge Functions (service_role) écrivent.
-- * fin_bank_auth_states : états temporaires du parcours d'autorisation (bank-auth).
-- * fin_sync_runs : journal des synchros.
-- * fin_sync_snapshot / fin_sync_apply : versions service_role de fin_import_snapshot / fin_import_ops
--   (même logique, sans jeton 30 min : l'utilisateur est passé par l'Edge Function).
-- * pg_cron : 6,7,12,13,18,19 h UTC ; la fonction ne synchronise qu'à 8 h / 14 h / 20 h Paris (été comme hiver).
-- ⚠️ Avant application : créer le secret Vault « bank_sync_cron_secret » (même valeur que le secret
--    d'Edge Function BANK_SYNC_CRON_SECRET) — jamais écrit dans ce fichier.
-- ============================================================

create table if not exists public.fin_bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,                -- préfixe des external_id : 'bourso', 'coop'
  aspsp_name text not null,
  session_id text not null,
  valid_until timestamptz not null,
  accounts jsonb not null default '[]', -- [{uid, l4, name, type: CACC|CARD, account_id: uuid|null}]
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_sync_at timestamptz,
  last_result jsonb,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source)
);
alter table public.fin_bank_connections enable row level security;
drop policy if exists "fin_bank_connections_select_own" on public.fin_bank_connections;
create policy "fin_bank_connections_select_own" on public.fin_bank_connections for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.fin_bank_connections from anon, authenticated;
grant select (id, user_id, source, aspsp_name, valid_until, accounts, status, last_sync_at, last_result, last_error, last_error_at, created_at)
  on public.fin_bank_connections to authenticated;
grant all on public.fin_bank_connections to service_role;

create table if not exists public.fin_bank_auth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  aspsp_name text not null,
  source text not null,
  created_at timestamptz not null default now()
);
alter table public.fin_bank_auth_states enable row level security;
revoke all on public.fin_bank_auth_states from anon, authenticated;
grant all on public.fin_bank_auth_states to service_role;

create table if not exists public.fin_sync_runs (
  id bigint generated always as identity primary key,
  connection_id uuid references public.fin_bank_connections(id) on delete cascade,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  ok boolean not null,
  dry_run boolean not null default false,
  result jsonb
);
alter table public.fin_sync_runs enable row level security;
drop policy if exists "fin_sync_runs_select_own" on public.fin_sync_runs;
create policy "fin_sync_runs_select_own" on public.fin_sync_runs for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.fin_sync_runs from anon, authenticated;
grant select on public.fin_sync_runs to authenticated;
grant all on public.fin_sync_runs to service_role;

-- ---------------------------------------------------------------- instantané (lecture seule)
create or replace function public.fin_sync_snapshot(p_user uuid, p_accounts uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'source',a.source,
                  'balance_source',a.balance_source,'balance_manual_at',a.balance_manual_at)), '[]')
                  from public.fin_accounts a where a.user_id = p_user and a.id = any(p_accounts)),
    'transactions', (select coalesce(jsonb_agg(jsonb_build_object('account_id',t.account_id,'date',t.date,'amount',t.amount,
                  'label',t.label,'category',c.name,'category_manual',t.category_manual,'external_id',t.external_id,
                  'source',t.source,'pending',t.pending)), '[]')
                  from public.fin_transactions t left join public.fin_categories c on c.id = t.category_id
                 where t.user_id = p_user and t.date >= current_date - 100 and t.account_id = any(p_accounts)),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'parent',p.name,
                  'n',(select count(*) from public.fin_transactions t where t.category_id = c.id))), '[]')
                  from public.fin_categories c left join public.fin_categories p on p.id = c.parent_id where c.user_id = p_user),
    'label_cat', (select coalesce(jsonb_agg(jsonb_build_array(k, cat, n, man)), '[]') from (
                  select lower(btrim(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i'))) k, c.name cat, count(*) n,
                         count(*) filter (where t.category_manual) man
                    from public.fin_transactions t join public.fin_categories c on c.id = t.category_id
                   where t.user_id = p_user group by 1, 2) q)
  )
$$;
revoke all on function public.fin_sync_snapshot(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fin_sync_snapshot(uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------- écriture (mêmes règles que fin_import_ops)
create or replace function public.fin_sync_apply(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source text := coalesce(p_payload->>'source', 'bourso');
  n_tx int := 0; n_pend int := 0; n_bal int := 0; n_drop int := 0;
begin
  if p_user is null then raise exception 'utilisateur manquant'; end if;

  -- En attente qui ne le sont plus (comptabilisées ou annulées) : retirées pour les comptes synchronisés.
  delete from public.fin_transactions x
   where x.user_id = p_user and x.source = v_source and x.pending
     and x.account_id in (select (a)::uuid from jsonb_array_elements_text(coalesce(p_payload->'pending_sync', '[]')) a)
     and x.external_id not in (select t->>'external_id' from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
                                where coalesce((t->>'pending')::boolean, false));
  get diagnostics n_drop = row_count;

  insert into public.fin_transactions (user_id, source, external_id, account_id, date, amount, label, category_id, internal, excluded, pending)
  select p_user, v_source, t->>'external_id', acc.id, (t->>'date')::date, (t->>'amount')::numeric, coalesce(t->>'label', ''),
         (select c.id from public.fin_categories c where c.user_id = p_user and c.id = nullif(t->>'category_id','')::uuid),
         coalesce((t->>'internal')::boolean, false), coalesce((t->>'excluded')::boolean, false), coalesce((t->>'pending')::boolean, false)
    from jsonb_array_elements(coalesce(p_payload->'transactions', '[]')) t
    join public.fin_accounts acc on acc.user_id = p_user and acc.id = (t->>'account_id')::uuid and acc.source <> 'virtuel'
  on conflict (user_id, source, external_id) do nothing;
  get diagnostics n_tx = row_count;

  select count(*) into n_pend from public.fin_transactions x where x.user_id = p_user and x.source = v_source and x.pending;

  -- Soldes : balance_source/balance_at toujours ; balance seulement sans saisie manuelle ; balance_manual_at jamais touché.
  update public.fin_accounts a
     set balance_source = (b->>'balance')::numeric, balance_at = now(),
         balance = case when a.balance_manual_at is null then (b->>'balance')::numeric else a.balance end
    from jsonb_array_elements(coalesce(p_payload->'balances', '[]')) b
   where a.user_id = p_user and a.id = (b->>'account_id')::uuid and a.source <> 'virtuel';
  get diagnostics n_bal = row_count;

  return jsonb_build_object('operations', n_tx, 'en_attente_total', n_pend, 'en_attente_retirees', n_drop, 'soldes', n_bal);
end $$;
revoke all on function public.fin_sync_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fin_sync_apply(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- planification
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('bank-sync') where exists (select 1 from cron.job where jobname = 'bank-sync');
select cron.schedule(
  'bank-sync',
  '0 6,7,12,13,18,19 * * *',  -- UTC ; la fonction ne garde que 8 h / 14 h / 20 h à Paris
  $$
  select net.http_post(
    url     := 'https://zahrgmswfejabqpgjkfe.supabase.co/functions/v1/bank-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bank_sync_cron_secret')),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 120000
  );
  $$
);

-- Secrets Enable Banking lus par les Edge Functions (service_role uniquement) depuis Supabase Vault.
create or replace function public.fin_bank_secrets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets where name in ('eb_app_id', 'eb_private_key', 'bank_sync_cron_secret')
$$;
revoke all on function public.fin_bank_secrets() from public, anon, authenticated;
grant execute on function public.fin_bank_secrets() to service_role;
