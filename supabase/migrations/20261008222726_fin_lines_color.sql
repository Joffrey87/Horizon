-- Finances : couleur de fond (translucide) d'une ligne de budget, ex. rgba(245, 158, 11, 0.18).
-- Les couleurs de Joffrey sont posées par SQL (hors dépôt).
alter table public.fin_lines add column if not exists color text;
