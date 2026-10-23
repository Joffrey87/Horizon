-- Carte Crypto.com — historique lu dans l'appli (lignes 'app-…') + recoupement avec les notifications (lignes 'notif-…').
-- - fin_card_matches : jumelage 1-pour-1 « ligne entrante <-> ligne déjà enregistrée » (RLS sans politique, service_role seul).
--   Sert à ne pas recréer en doublon une dépense déjà connue par l'autre canal, et rend les rejeux idempotents.
-- - fin_card_guess_category : catégorie devinée d'après l'historique Horizon (comme fin_card_notif_record v1).
-- - fin_card_find_match : opération déjà enregistrée = même compte, même montant, date ±1 jour, libellé proche, non jumelée.
-- - fin_card_app_import(p_user, p_rows) : import idempotent d'opérations lues dans l'appli Crypto.com.
-- - fin_card_notif_record : réécrite pour utiliser le recoupement (notification déjà vue dans l'appli -> pas de doublon).

create table if not exists public.fin_card_matches (
  user_id      uuid not null references auth.users(id) on delete cascade,
  incoming_ext text not null,            -- external_id de la ligne entrante (non insérée car déjà connue)
  row_id       uuid not null references public.fin_transactions(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, incoming_ext),
  unique (row_id)
);
alter table public.fin_card_matches enable row level security;
revoke all on public.fin_card_matches from anon, authenticated;

-- Libellés proches : même premier mot (après alias « crf » = « carrefour », mots purement numériques ignorés),
-- ou l'un est préfixe de l'autre.
create or replace function public.fin_card_label_close(a text, b text) returns boolean
language sql immutable set search_path = '' as $$
  with n as (
    select regexp_replace(regexp_replace(public.fin_norm(regexp_replace(coalesce(a,''), '^refund:\s*', '', 'i')), '\mcrf\M', 'carrefour', 'g'), '\m\d+\M', '', 'g') x,
           regexp_replace(regexp_replace(public.fin_norm(regexp_replace(coalesce(b,''), '^refund:\s*', '', 'i')), '\mcrf\M', 'carrefour', 'g'), '\m\d+\M', '', 'g') y
  ), t as (select btrim(regexp_replace(x,'\s+',' ','g')) x, btrim(regexp_replace(y,'\s+',' ','g')) y from n)
  select x <> '' and y <> '' and (split_part(x,' ',1) = split_part(y,' ',1) or x like y || '%' or y like x || '%') from t
$$;

create or replace function public.fin_card_guess_category(p_user uuid, p_label text)
returns table (category_id uuid, src text)
language plpgsql security definer set search_path = '' as $$
declare
  v_words text[]; v_n int; v_cat uuid; v_from text := 'defaut'; v_prefix text; v_nc uuid;
begin
  select c.id into v_nc from public.fin_categories c where c.user_id = p_user and c.name = 'Non catégorisé' and c.parent_id is null limit 1;
  v_words := string_to_array(public.fin_norm(regexp_replace(coalesce(p_label,''), '\s*CB\*\d+.*$', '', 'i')), ' ');
  for v_n in reverse coalesce(array_length(v_words, 1), 0) .. 1 loop
    exit when v_cat is not null;
    v_prefix := array_to_string(v_words[1:v_n], ' ');
    continue when v_n = 1 and length(v_prefix) < 6;
    select t.category_id into v_cat
      from public.fin_transactions t
     where t.user_id = p_user and t.category_id is not null and t.category_id <> v_nc
       and (public.fin_norm(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i')) = v_prefix
            or public.fin_norm(regexp_replace(t.label, '\s*CB\*\d+.*$', '', 'i')) like v_prefix || ' %')
     group by t.category_id
     order by sum(case when t.category_manual then 3 else 1 end) desc, count(*) desc
     limit 1;
    if v_cat is not null then v_from := 'historique:' || v_prefix; end if;
  end loop;
  return query select coalesce(v_cat, v_nc), v_from;
end $$;

create or replace function public.fin_card_find_match(p_user uuid, p_acc uuid, p_amount numeric, p_date date,
                                                      p_label text, p_pattern text, p_exclude text[])
returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.fin_transactions t
   where t.user_id = p_user and t.account_id = p_acc and t.source = 'crypto'
     and t.external_id like p_pattern
     and not (t.external_id = any (coalesce(p_exclude, '{}')))
     and t.amount = p_amount and abs(t.date - p_date) <= 1
     and public.fin_card_label_close(t.label, p_label)
     and not exists (select 1 from public.fin_card_matches m where m.row_id = t.id)
   order by (t.date = p_date) desc, t.created_at
   limit 1
$$;

create or replace function public.fin_card_notif_record(p_user uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_acc uuid;
  v_ext text := p_payload->>'external_id';
  v_label text := coalesce(nullif(btrim(p_payload->>'label'), ''), 'Carte Crypto.com');
  v_amount numeric := -abs((p_payload->>'amount')::numeric);
  v_date date := (p_payload->>'date')::date;
  v_cat uuid; v_from text; v_id uuid; v_m uuid;
begin
  if v_ext is null or v_ext not like 'notif-%' then raise exception 'external_id invalide'; end if;
  select id into v_acc from public.fin_accounts where user_id = p_user and source = 'crypto' and external_id = 'card-visa';
  if v_acc is null then raise exception 'compte Crypto.com Carte introuvable'; end if;

  -- notification déjà rejouée / déjà jumelée à une ligne de l'appli
  if exists (select 1 from public.fin_transactions where user_id = p_user and source = 'crypto' and external_id = v_ext)
     or exists (select 1 from public.fin_card_matches where user_id = p_user and incoming_ext = v_ext) then
    return jsonb_build_object('inserted', false, 'duplicate', true);
  end if;
  -- rejeu « flou » (même montant et libellé, notification enregistrée il y a < 2 min)
  if exists (select 1 from public.fin_transactions t
              where t.user_id = p_user and t.source = 'crypto' and t.account_id = v_acc
                and t.amount = v_amount and t.label = v_label and t.external_id like 'notif-%'
                and t.created_at > now() - interval '2 minutes') then
    return jsonb_build_object('inserted', false, 'duplicate', true);
  end if;
  -- déjà connue par l'historique de l'appli (lignes 'app-', non encore jumelées) ?
  v_m := public.fin_card_find_match(p_user, v_acc, v_amount, v_date, v_label, 'app-%', null);
  if v_m is not null then
    insert into public.fin_card_matches (user_id, incoming_ext, row_id) values (p_user, v_ext, v_m);
    return jsonb_build_object('inserted', false, 'duplicate', true, 'matched_app_row', v_m);
  end if;

  select g.category_id, g.src into v_cat, v_from from public.fin_card_guess_category(p_user, v_label) g;
  insert into public.fin_transactions (user_id, account_id, date, amount, label, category_id, category_manual, owner, internal, excluded, note, source, external_id)
  values (p_user, v_acc, v_date, v_amount, v_label, v_cat, false, 'joffrey', false, false, nullif(p_payload->>'note', ''), 'crypto', v_ext)
  on conflict (user_id, source, external_id) do nothing
  returning id into v_id;
  return jsonb_build_object('inserted', v_id is not null, 'duplicate', v_id is null, 'id', v_id,
                            'category_id', v_cat, 'category_from', v_from);
end $$;

-- p_rows : [{date:'yyyy-MM-dd', amount:-4.38 (signé), label, pending?:bool, category_id?, internal?, excluded?, note?}]
-- Résultat : {inserted, existing, matched, confirmed, ids:[...]}
create or replace function public.fin_card_app_import(p_user uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_acc uuid; r record; v_ext text; v_cat uuid; v_from text; v_m uuid; v_id uuid;
  v_exts text[]; v_ins int := 0; v_exist int := 0; v_matched int := 0; v_conf int := 0; v_ids jsonb := '[]';
  v_note text; v_norm jsonb;
begin
  select id into v_acc from public.fin_accounts where user_id = p_user and source = 'crypto' and external_id = 'card-visa';
  if v_acc is null then raise exception 'compte Crypto.com Carte introuvable'; end if;

  select jsonb_agg(to_jsonb(q) order by q.ord) into v_norm from (
    select z.*, 'app-' || z.d::text || '-' || (round(abs(z.amt) * 100))::text || (case when z.amt < 0 then 'd' else 'c' end) || '-'
                || substr(encode(sha256(convert_to(public.fin_norm(z.lbl), 'UTF8')), 'hex'), 1, 8) || '-' || z.rk::text as ext
    from (
      select (x.ord)::int ord, (x.j->>'date')::date d, round((x.j->>'amount')::numeric, 2) amt,
             btrim(regexp_replace(x.j->>'label', '\s+', ' ', 'g')) lbl,
             coalesce((x.j->>'pending')::boolean, false) pending, nullif(x.j->>'category_id','')::uuid cat,
             coalesce((x.j->>'internal')::boolean, false) internal, coalesce((x.j->>'excluded')::boolean, false) excluded,
             nullif(x.j->>'note','') note,
             row_number() over (partition by (x.j->>'date'), public.fin_norm(x.j->>'label'), round((x.j->>'amount')::numeric,2) order by x.ord) rk
        from jsonb_array_elements(p_rows) with ordinality as x(j, ord)
    ) z
  ) q;
  select array_agg(e->>'ext') into v_exts from jsonb_array_elements(coalesce(v_norm, '[]')) e;

  for r in select * from jsonb_to_recordset(coalesce(v_norm, '[]')) as t(ord int, d date, amt numeric, lbl text, pending boolean, cat uuid, internal boolean, excluded boolean, note text, ext text) order by ord loop
    -- 1. déjà là (même identifiant) ou déjà jumelé
    if exists (select 1 from public.fin_transactions where user_id = p_user and source = 'crypto' and external_id = r.ext)
       or exists (select 1 from public.fin_card_matches where user_id = p_user and incoming_ext = r.ext) then
      v_exist := v_exist + 1; continue;
    end if;
    -- 2. même opération déjà connue (notification 'notif-', ou ligne 'app-' en attente dont la date a bougé)
    v_m := public.fin_card_find_match(p_user, v_acc, r.amt, r.d, r.lbl, '%', v_exts);
    if v_m is not null then
      insert into public.fin_card_matches (user_id, incoming_ext, row_id) values (p_user, r.ext, v_m);
      if not r.pending then
        update public.fin_transactions set note = null where id = v_m and note = 'en attente';
        if found then v_conf := v_conf + 1; end if;
      end if;
      v_matched := v_matched + 1; continue;
    end if;
    -- 3. nouvelle ligne
    v_cat := r.cat; v_from := 'explicite';
    if v_cat is null then select g.category_id, g.src into v_cat, v_from from public.fin_card_guess_category(p_user, r.lbl) g; end if;
    v_note := concat_ws(' · ', case when r.pending then 'en attente' end, r.note);
    insert into public.fin_transactions (user_id, account_id, date, amount, label, category_id, category_manual, owner, internal, excluded, note, source, external_id)
    values (p_user, v_acc, r.d, r.amt, r.lbl, v_cat, false, 'joffrey', r.internal, r.excluded, nullif(v_note, ''), 'crypto', r.ext)
    on conflict (user_id, source, external_id) do nothing returning id into v_id;
    if v_id is not null then
      v_ins := v_ins + 1; v_ids := v_ids || jsonb_build_array(jsonb_build_object('ext', r.ext, 'label', r.lbl, 'amount', r.amt, 'from', v_from));
    end if;
  end loop;
  return jsonb_build_object('inserted', v_ins, 'existing', v_exist, 'matched', v_matched, 'confirmed', v_conf, 'rows', v_ids);
end $$;

revoke all on function public.fin_card_label_close(text, text) from public, anon, authenticated;
revoke all on function public.fin_card_guess_category(uuid, text) from public, anon, authenticated;
revoke all on function public.fin_card_find_match(uuid, uuid, numeric, date, text, text, text[]) from public, anon, authenticated;
revoke all on function public.fin_card_app_import(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fin_card_notif_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fin_card_label_close(text, text) to service_role;
grant execute on function public.fin_card_guess_category(uuid, text) to service_role;
grant execute on function public.fin_card_find_match(uuid, uuid, numeric, date, text, text, text[]) to service_role;
grant execute on function public.fin_card_app_import(uuid, jsonb) to service_role;
grant execute on function public.fin_card_notif_record(uuid, jsonb) to service_role;
