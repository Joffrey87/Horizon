-- Mois affecté à la main : une opération compte dans ce mois ('yyyy-MM') malgré sa date bancaire.
-- null = mois de paie de sa date (comportement habituel). L'import ne touche jamais cette colonne.
alter table public.fin_transactions
  add column if not exists mois_affecte text check (mois_affecte is null or mois_affecte ~ '^\d{4}-(0[1-9]|1[0-2])$');
