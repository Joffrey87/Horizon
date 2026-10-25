-- Un remboursement peut pointer vers la dépense qu'il rembourse : il compte alors dans le mois et la catégorie de cette dépense.
alter table public.fin_transactions
  add column if not exists rembourse_de uuid references public.fin_transactions(id) on delete set null;
create index if not exists fin_transactions_rembourse_de_idx on public.fin_transactions (rembourse_de) where rembourse_de is not null;
