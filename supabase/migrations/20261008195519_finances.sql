-- ============================================================
-- Onglet « Finances » — budget du foyer, patrimoine, investissements.
--
-- Modèle indépendant de la source : chaque ligne importée porte sa `source`
-- ('finary', puis demain une banque, un relevé…) et son `external_id`, ce
-- qui rend l'import idempotent. Changer de source = changer de connecteur,
-- jamais de vue.
--
-- Ce que l'utilisateur règle dans Horizon n'est JAMAIS écrasé par un import :
-- titulaire et « compte du budget » d'un compte, ligne de budget d'une
-- catégorie, catégorie d'une opération recatégorisée (`category_manual`),
-- titulaire d'une opération, classe d'actif corrigée (`class_manual`).
--
-- Aucun montant ni libellé personnel dans ce fichier (dépôt public) : les
-- lignes, budgets, cibles et DCA de départ sont posés par SQL hors dépôt.
-- ============================================================

-- Lignes de budget (celles du tableau de bord : Frais fixe, Courses…)
create table if not exists public.fin_lines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'depense' check (kind in ('depense', 'epargne')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.fin_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  institution text,
  kind        text not null default 'autre'
              check (kind in ('courant', 'epargne', 'investissement', 'crypto', 'immobilier', 'metaux', 'pret', 'autre')),
  subtype     text,                                  -- pea, per, compte_titres, lifeinsurance, exchange…
  owner       text not null default 'joffrey' check (owner in ('commun', 'joffrey', 'honorine')),
  in_budget   boolean not null default false,        -- ses opérations comptent dans le budget
  balance     numeric(14,2) not null default 0,      -- valeur actuelle (négative pour un prêt)
  balance_at  timestamptz,
  archived    boolean not null default false,
  sort_order  int not null default 0,
  source      text not null default 'manuel',
  external_id text,
  created_at  timestamptz not null default now(),
  unique (user_id, source, external_id)
);

-- Catégories (deux niveaux). La ligne de budget se lit sur la catégorie,
-- à défaut sur sa catégorie parente.
create table if not exists public.fin_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.fin_categories(id) on delete cascade,
  line_id     uuid references public.fin_lines(id) on delete set null,
  role        text not null default 'depense' check (role in ('depense', 'revenu', 'hors_budget')),
  source      text not null default 'manuel',
  external_id text,
  created_at  timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists fin_categories_parent_idx on public.fin_categories(parent_id);
create index if not exists fin_categories_line_idx on public.fin_categories(line_id);

create table if not exists public.fin_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null references public.fin_accounts(id) on delete cascade,
  date            date not null,
  amount          numeric(14,2) not null,            -- signé : négatif = sortie
  label           text not null default '',
  category_id     uuid references public.fin_categories(id) on delete set null,
  category_manual boolean not null default false,    -- recatégorisée dans Horizon : l'import n'y touche plus
  owner           text check (owner in ('commun', 'joffrey', 'honorine')),  -- null = titulaire du compte
  internal        boolean not null default false,    -- virement entre ses propres comptes
  excluded        boolean not null default false,    -- écartée du budget
  note            text,
  source          text not null default 'manuel',
  external_id     text,
  created_at      timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists fin_transactions_user_date_idx on public.fin_transactions(user_id, date);
create index if not exists fin_transactions_account_idx on public.fin_transactions(account_id);
create index if not exists fin_transactions_category_idx on public.fin_transactions(category_id);

-- Budget d'une ligne : vaut à partir de `month` jusqu'au montant suivant
-- (kind 'budget'). Le prévisionnel ('prevision') ne vaut que pour son mois.
create table if not exists public.fin_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  line_id     uuid not null references public.fin_lines(id) on delete cascade,
  kind        text not null default 'budget' check (kind in ('budget', 'prevision')),
  month       date not null check (extract(day from month) = 1),
  amount      numeric(12,2) not null,
  created_at  timestamptz not null default now(),
  unique (line_id, kind, month)
);
create index if not exists fin_budgets_user_idx on public.fin_budgets(user_id);

-- Historique du patrimoine (un point par jour au plus).
create table if not exists public.fin_networth (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  net         numeric(14,2) not null,
  gross       numeric(14,2),
  source      text not null default 'manuel',
  unique (user_id, date)
);

create table if not exists public.fin_holdings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid not null references public.fin_accounts(id) on delete cascade,
  name        text not null,
  code        text,                                  -- ISIN ou symbole
  quantity    numeric,
  value       numeric(14,2) not null default 0,
  buy_value   numeric(14,2),
  asset_class text not null default 'autre'
              check (asset_class in ('actions', 'obligations', 'or', 'argent', 'energie', 'crypto', 'immobilier', 'liquidites', 'autre')),
  class_manual boolean not null default false,       -- classe corrigée dans Horizon
  source      text not null default 'manuel',
  external_id text,
  updated_at  timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists fin_holdings_account_idx on public.fin_holdings(account_id);

-- Allocation cible, en % du portefeuille suivi (classes ayant une cible).
create table if not exists public.fin_targets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  asset_class text not null
              check (asset_class in ('actions', 'obligations', 'or', 'argent', 'energie', 'crypto', 'immobilier', 'liquidites', 'autre')),
  pct         numeric(5,2) not null check (pct >= 0 and pct <= 100),
  unique (user_id, asset_class)
);

-- Plan d'investissement mensuel (DCA).
create table if not exists public.fin_dca (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  code        text,
  envelope    text,                                  -- PEA, CTO, PER, AV, Crypto…
  asset_class text check (asset_class in ('actions', 'obligations', 'or', 'argent', 'energie', 'crypto', 'immobilier', 'liquidites', 'autre')),
  amount      numeric(10,2) not null,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Dépenses à venir : une provision mensuelle se calcule jusqu'à l'échéance.
create table if not exists public.fin_planned (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  amount      numeric(12,2) not null,
  due_date    date not null,
  line_id     uuid references public.fin_lines(id) on delete set null,
  saved       numeric(12,2) not null default 0,      -- déjà mis de côté
  done        boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);

-- RLS : chaque table n'est visible que de son propriétaire.
do $$
declare t text;
begin
  foreach t in array array['fin_lines', 'fin_accounts', 'fin_categories', 'fin_transactions', 'fin_budgets',
                           'fin_networth', 'fin_holdings', 'fin_targets', 'fin_dca', 'fin_planned'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Import : jetons à usage court + fonction d'import.
--
-- La page Finary interdit tout envoi réseau hors de chez elle (CSP) : la
-- synchro passe par un fichier JSON, envoyé ensuite par un script local
-- (scripts/fin-import.mjs) avec la clé publique « anon ». Ce qui autorise
-- l'écriture, c'est un jeton aléatoire créé pour l'occasion (stocké haché,
-- valable 30 min) qui désigne l'utilisateur — jamais un identifiant.
-- ------------------------------------------------------------
create table if not exists public.fin_import_tokens (
  token_hash  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null
);
alter table public.fin_import_tokens enable row level security;  -- aucune policy : fonction d'import seule
grant select, insert, update, delete on public.fin_import_tokens to service_role;

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

  -- Comptes : titulaire, budget et archivage restent ceux réglés dans Horizon.
  insert into public.fin_accounts (user_id, source, external_id, name, institution, kind, subtype, owner, in_budget, balance, balance_at)
  select v_user, v_source, a->>'external_id', a->>'name', a->>'institution', a->>'kind', a->>'subtype',
         coalesce(a->>'owner', 'joffrey'), coalesce((a->>'in_budget')::boolean, false),
         coalesce((a->>'balance')::numeric, 0), now()
    from jsonb_array_elements(coalesce(p_payload->'accounts', '[]')) a
  on conflict (user_id, source, external_id) do update
     set name = excluded.name, institution = excluded.institution, kind = excluded.kind,
         subtype = excluded.subtype, balance = excluded.balance, balance_at = excluded.balance_at;
  get diagnostics n_acc = row_count;

  -- Catégories : la ligne de budget n'est posée qu'à la création.
  insert into public.fin_categories (user_id, source, external_id, name, role, line_id)
  select v_user, v_source, c->>'external_id', c->>'name', coalesce(c->>'role', 'depense'),
         (select l.id from public.fin_lines l where l.user_id = v_user and l.name = c->>'line' limit 1)
    from jsonb_array_elements(coalesce(p_payload->'categories', '[]')) c
  on conflict (user_id, source, external_id) do update set name = excluded.name;
  get diagnostics n_cat = row_count;

  update public.fin_categories child
     set parent_id = parent.id
    from jsonb_array_elements(coalesce(p_payload->'categories', '[]')) c
    join public.fin_categories parent
      on parent.user_id = v_user and parent.source = v_source and parent.external_id = c->>'parent_external_id'
   where child.user_id = v_user and child.source = v_source and child.external_id = c->>'external_id'
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

  insert into public.fin_networth (user_id, source, date, net, gross)
  select v_user, v_source, (w->>'date')::date, (w->>'net')::numeric, (w->>'gross')::numeric
    from jsonb_array_elements(coalesce(p_payload->'networth', '[]')) w
  on conflict (user_id, date) do update set net = excluded.net, gross = excluded.gross, source = excluded.source;
  get diagnostics n_nw = row_count;

  return jsonb_build_object('comptes', n_acc, 'categories', n_cat, 'operations', n_tx, 'positions', n_hold, 'patrimoine', n_nw);
end $$;

revoke all on function public.fin_import(text, jsonb) from public;
-- anon seulement (clé publique du script local) : le jeton fait foi.
grant execute on function public.fin_import(text, jsonb) to anon, service_role;
