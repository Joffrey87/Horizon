-- Carte Crypto.com — lignes à date approximative (note « date approximative, à confirmer par CSV … »).
-- Quand l'utilisateur importe un CSV de l'appli, une ligne entrante qui correspond (même montant, libellé proche) à une
-- ligne approximative est reconnue dans une fenêtre de date large (±45 jours) ; la date de la ligne existante est alors
-- corrigée et la mention approximative retirée, sans créer de doublon. La fenêtre large n'est utilisée que par l'import
-- (p_wide = true), jamais par le webhook de notifications (fenêtre ±1 jour).

drop function if exists public.fin_card_find_match(uuid, uuid, numeric, date, text, text, text[]);

create or replace function public.fin_card_find_match(p_user uuid, p_acc uuid, p_amount numeric, p_date date,
                                                      p_label text, p_pattern text, p_exclude text[], p_wide boolean default false)
returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.fin_transactions t
   where t.user_id = p_user and t.account_id = p_acc and t.source = 'crypto'
     and t.external_id like p_pattern
     and not (t.external_id = any (coalesce(p_exclude, '{}')))
     and t.amount = p_amount
     and (abs(t.date - p_date) <= 1
          or (p_wide and t.note like '%date approximative%' and abs(t.date - p_date) <= 45))
     and public.fin_card_label_close(t.label, p_label)
     and not exists (select 1 from public.fin_card_matches m where m.row_id = t.id)
   order by (t.date = p_date) desc, (t.note like '%date approximative%') asc, abs(t.date - p_date), t.created_at
   limit 1
$$;

-- p_rows : [{date:'yyyy-MM-dd', amount:-4.38 (signé), label, pending?:bool, category_id?, internal?, excluded?, note?}]
-- Résultat : {inserted, existing, matched, confirmed, ids:[...]}
create or replace function public.fin_card_app_import(p_user uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_acc uuid; r record; v_ext text; v_cat uuid; v_from text; v_m uuid; v_id uuid;
  v_exts text[]; v_ins int := 0; v_exist int := 0; v_matched int := 0; v_conf int := 0; v_fixed int := 0; v_ids jsonb := '[]';
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
    v_m := public.fin_card_find_match(p_user, v_acc, r.amt, r.d, r.lbl, '%', v_exts, true);
    if v_m is not null then
      insert into public.fin_card_matches (user_id, incoming_ext, row_id) values (p_user, r.ext, v_m);
      if not r.pending then
        update public.fin_transactions set note = null where id = v_m and note = 'en attente';
        if found then v_conf := v_conf + 1; end if;
        -- ligne importée avec une date approximative : on la corrige au lieu de créer un doublon
        update public.fin_transactions
           set date = r.d,
               note = nullif(btrim(regexp_replace(regexp_replace(note, 'date approximative, à confirmer par CSV( \([^)]*\))?', '', 'g'), '(^\s*·\s*|\s*·\s*$)', '', 'g')), '')
         where id = v_m and note like '%date approximative%';
        if found then v_fixed := v_fixed + 1; end if;
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
  return jsonb_build_object('inserted', v_ins, 'existing', v_exist, 'matched', v_matched, 'confirmed', v_conf, 'date_fixed', v_fixed, 'rows', v_ids);
end $$;


revoke all on function public.fin_card_find_match(uuid, uuid, numeric, date, text, text, text[], boolean) from public, anon, authenticated;
revoke all on function public.fin_card_app_import(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fin_card_find_match(uuid, uuid, numeric, date, text, text, text[], boolean) to service_role;
grant execute on function public.fin_card_app_import(uuid, jsonb) to service_role;
