-- ============================================================
-- Finances : une dépense sans catégorie (ou « Non catégorisé ») va dans
-- « Achats » (sous « Dépenses du mois », ligne Dépenses courantes).
-- Débits seulement ; ni virements internes, ni exclues, ni ventilation, ni choix manuel.
-- Trigger BEFORE INSERT : couvre le webhook carte crypto, l'import appli/CSV et l'import Bourso.
-- ============================================================
create or replace function public.fin_tx_default_achats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_achats uuid;
begin
  if new.amount >= 0 or coalesce(new.internal, false) or coalesce(new.excluded, false)
     or coalesce(new.source, '') = 'ventilation' or coalesce(new.category_manual, false) then
    return new;
  end if;
  if new.category_id is not null and not exists (
       select 1 from public.fin_categories c where c.id = new.category_id and c.name = 'Non catégorisé') then
    return new;
  end if;
  select c.id into v_achats
    from public.fin_categories c
    join public.fin_categories p on p.id = c.parent_id
    join public.fin_lines l on l.id = p.line_id
   where c.user_id = new.user_id and c.name = 'Achats' and not coalesce(c.hidden, false)
     and l.name = 'Dépenses courantes'
   limit 1;
  if v_achats is not null then new.category_id := v_achats; end if;
  return new;
end $$;

drop trigger if exists fin_tx_default_achats on public.fin_transactions;
create trigger fin_tx_default_achats before insert on public.fin_transactions
  for each row execute function public.fin_tx_default_achats();
