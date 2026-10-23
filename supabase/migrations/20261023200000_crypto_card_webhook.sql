-- Paiements par carte Crypto.com (notifications Android -> Edge Function `crypto-card-webhook`).
-- - fin_webhook_tokens : empreintes SHA-256 des mots de passe du point de réception (RLS activée, AUCUNE politique :
--   seul service_role y accède). L'empreinte elle-même n'est PAS dans ce fichier (insérée à part).
-- - fin_webhook_log    : notifications ignorées (remboursements, devise étrangère…) pour relecture. Même protection.
-- - compte « Crypto.com Carte » (source 'crypto', external_id 'card-visa', en budget, solde 0 : la carte consomme le
--   portefeuille Crypto.com déjà suivi par Finary, on ne double pas le patrimoine).
-- - fin_card_notif_record : écrit UNE dépense (idempotente), devine la catégorie d'après l'historique. service_role seul.

create table if not exists public.fin_webhook_tokens (
  name        text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.fin_webhook_tokens enable row level security;
revoke all on public.fin_webhook_tokens from anon, authenticated;

create table if not exists public.fin_webhook_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  reason      text not null,
  title       text,
  body        text
);
alter table public.fin_webhook_log enable row level security;
revoke all on public.fin_webhook_log from anon, authenticated;

-- Compte carte (idempotent)
insert into public.fin_accounts (user_id, name, institution, kind, subtype, owner, in_budget, balance, source, external_id, sort_order)
select '68a32837-708e-42f6-a493-5f61f7322120', 'Crypto.com Carte', 'Crypto.com', 'courant', 'carte', 'joffrey', true, 0, 'crypto', 'card-visa',
       coalesce((select max(sort_order) from public.fin_accounts where user_id = '68a32837-708e-42f6-a493-5f61f7322120'), 0) + 1
where exists (select 1 from auth.users where id = '68a32837-708e-42f6-a493-5f61f7322120')
on conflict (user_id, source, external_id) do nothing;

create or replace function public.fin_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiooouuuucn'), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.fin_card_notif_record(p_user uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc uuid;
  v_ext text := p_payload->>'external_id';
  v_label text := coalesce(nullif(btrim(p_payload->>'label'), ''), 'Carte Crypto.com');
  v_amount numeric := -abs((p_payload->>'amount')::numeric);   -- dépense = négatif
  v_date date := (p_payload->>'date')::date;
  v_key text; v_words text[]; v_n int; v_cat uuid; v_from text := 'defaut';
  v_id uuid;
begin
  if v_ext is null or v_ext not like 'notif-%' then raise exception 'external_id invalide'; end if;
  select id into v_acc from public.fin_accounts where user_id = p_user and source = 'crypto' and external_id = 'card-visa';
  if v_acc is null then raise exception 'compte Crypto.com Carte introuvable'; end if;

  -- Rejeu « flou » : même compte, même montant, même libellé, notification déjà enregistrée il y a < 2 min
  -- (MacroDroid qui réessaie à cheval sur deux minutes). Deux achats identiques en 2 min : improbable.
  if exists (select 1 from public.fin_transactions t
              where t.user_id = p_user and t.source = 'crypto' and t.account_id = v_acc
                and t.amount = v_amount and t.label = v_label and t.external_id like 'notif-%'
                and t.created_at > now() - interval '2 minutes') then
    return jsonb_build_object('inserted', false, 'duplicate', true);
  end if;

  -- Catégorie : historique Horizon (toutes sources) par préfixe de mots du libellé normalisé, manuel pèse x3.
  v_key := public.fin_norm(regexp_replace(v_label, '\s*CB\*\d+.*$', '', 'i'));
  v_words := string_to_array(v_key, ' ');
  for v_n in reverse coalesce(array_length(v_words, 1), 0) .. 1 loop
    exit when v_cat is not null;
    declare v_prefix text := array_to_string(v_words[1:v_n], ' ');
    begin
      continue when v_n = 1 and length(v_prefix) < 6;
      select t.category_id into v_cat
        from public.fin_transactions t
       where t.user_id = p_user and t.category_id is not null
         and (public.fin_norm(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i')) = v_prefix
              or public.fin_norm(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i')) like v_prefix || ' %')
         and t.category_id <> (select c.id from public.fin_categories c where c.user_id = p_user and c.name = 'Non catégorisé' and c.parent_id is null limit 1)
       group by t.category_id
       order by sum(case when t.category_manual then 3 else 1 end) desc, count(*) desc
       limit 1;
      if v_cat is not null then v_from := 'historique:' || v_prefix; end if;
    end;
  end loop;
  if v_cat is null then
    select c.id into v_cat from public.fin_categories c
     where c.user_id = p_user and c.name = 'Non catégorisé' and c.parent_id is null limit 1;
  end if;

  insert into public.fin_transactions (user_id, account_id, date, amount, label, category_id, category_manual, owner, internal, excluded, note, source, external_id)
  values (p_user, v_acc, v_date, v_amount, v_label, v_cat, false, 'joffrey', false, false, nullif(p_payload->>'note', ''), 'crypto', v_ext)
  on conflict (user_id, source, external_id) do nothing
  returning id into v_id;

  return jsonb_build_object('inserted', v_id is not null, 'duplicate', v_id is null, 'id', v_id,
                            'category_id', v_cat, 'category_from', v_from);
end $$;

revoke all on function public.fin_card_notif_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fin_card_notif_record(uuid, jsonb) to service_role;
revoke all on function public.fin_norm(text) from public, anon, authenticated;
grant execute on function public.fin_norm(text) to service_role;
