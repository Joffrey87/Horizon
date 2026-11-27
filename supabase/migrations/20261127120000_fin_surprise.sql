-- Surprise : une dépense rangée en Cadeaux peut être cachée à l'autre personne du foyer
-- (intitulé et montant masqués à l'affichage, totaux inchangés) jusqu'à sa date de révélation.
-- Masquage VISUEL seulement (choix de Joffrey) : la base n'en filtre rien.
-- surprise_de = compte qui l'a cachée (le propriétaire, ou le membre du partage) ; la garde du partage
-- (fin_transactions_garde_partage) ne liste pas ces colonnes : un membre peut donc les poser.
alter table public.fin_transactions
  add column if not exists surprise_de uuid,
  add column if not exists surprise_jusqu date;
