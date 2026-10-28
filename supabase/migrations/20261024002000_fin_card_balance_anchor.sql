-- Solde automatique de la carte Crypto.com : ancrage + lignes ajoutées après l'ancrage.
--   solde = montant d'ancrage (relevé par l'utilisateur) + somme des lignes de la carte dont created_at > anchored_at
-- Le critère est la date d'INSERTION (created_at), pas la date d'opération : une ligne CSV jumelée à une ligne existante
-- (correction de date = UPDATE) n'est jamais recomptée ; une ligne insérée plus tard avec une date d'opération ancienne compte.
-- Le trigger recalcule le solde à chaque insertion / suppression / changement de montant : pas de dérive possible
-- (fin_card_notif_record et fin_card_app_import n'ont pas besoin d'être modifiées).
-- Recalage : select public.fin_card_recaler('<user_id>', 123.45);   (voir README)

create table if not exists public.fin_card_anchor (
  account_id uuid primary key references public.fin_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  anchored_at timestamptz not null default now(),
  note text,
  updated_at timestamptz not null default now()
);
alter table public.fin_card_anchor enable row level security;
drop policy if exists fin_card_anchor_select on public.fin_card_anchor;
create policy fin_card_anchor_select on public.fin_card_anchor for select to authenticated using (user_id = (select auth.uid()));
grant select on public.fin_card_anchor to authenticated;
grant select, insert, update, delete on public.fin_card_anchor to service_role;

create or replace function public.fin_card_balance_refresh(p_acc uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_a public.fin_card_anchor; v_bal numeric;
begin
  select * into v_a from public.fin_card_anchor where account_id = p_acc;
  if not found then return null; end if;
  select v_a.amount + coalesce(sum(t.amount), 0) into v_bal
    from public.fin_transactions t
   where t.account_id = p_acc and t.created_at > v_a.anchored_at;
  -- balance_manual_at (saisie dans l'interface) est respecté : alors seule balance_source suit le calcul
  update public.fin_accounts
     set balance_source = v_bal,
         balance = case when balance_manual_at is null then v_bal else balance end,
         balance_at = now()
   where id = p_acc;
  return v_bal;
end $$;

create or replace function public.fin_card_balance_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.fin_card_balance_refresh(new.account_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.account_id is distinct from new.account_id) then
    perform public.fin_card_balance_refresh(old.account_id);
  end if;
  return null;
end $$;

drop trigger if exists fin_card_balance_ins_del on public.fin_transactions;
create trigger fin_card_balance_ins_del after insert or delete on public.fin_transactions
  for each row execute function public.fin_card_balance_trg();
drop trigger if exists fin_card_balance_upd on public.fin_transactions;
create trigger fin_card_balance_upd after update of amount, account_id on public.fin_transactions
  for each row execute function public.fin_card_balance_trg();

-- Recalage : « solde carte = X » -> nouvel ancrage maintenant (toutes les lignes existantes sont réputées incluses dans X).
create or replace function public.fin_card_recaler(p_user uuid, p_solde numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_acc uuid;
begin
  select id into v_acc from public.fin_accounts where user_id = p_user and source = 'crypto' and external_id = 'card-visa';
  if v_acc is null then raise exception 'compte Crypto.com Carte introuvable'; end if;
  insert into public.fin_card_anchor (account_id, user_id, amount, anchored_at, note, updated_at)
  values (v_acc, p_user, round(p_solde, 2), clock_timestamp(), p_note, now())
  on conflict (account_id) do update
    set amount = excluded.amount, anchored_at = excluded.anchored_at, note = excluded.note, updated_at = now();
  return public.fin_card_balance_refresh(v_acc);
end $$;

revoke all on function public.fin_card_balance_refresh(uuid), public.fin_card_balance_trg(), public.fin_card_recaler(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.fin_card_balance_refresh(uuid), public.fin_card_recaler(uuid, numeric, text) to service_role;

-- L'ancrage initial a été posé en base, hors dépôt : pas de montant ni d'identifiant ici.
