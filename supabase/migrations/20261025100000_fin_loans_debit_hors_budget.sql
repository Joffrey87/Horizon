-- Prêt dont le prélèvement part d'un compte hors budget (ex. prêt payé depuis le compte Airbnb) : son capital compte en épargne
-- même quand les opérations de ce compte ne sont pas visibles (vue partagée : seuls les comptes du budget sont envoyés).
-- La valeur de chaque prêt est posée par SQL (aucun identifiant de prêt dans le dépôt public).
alter table public.fin_loans add column if not exists debit_hors_budget boolean not null default false;
