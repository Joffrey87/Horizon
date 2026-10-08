-- ============================================================
-- Finances : catégorie masquée des listes de choix (tri fait par Joffrey).
-- Ses opérations restent comptées ; l'import Finary n'y touche pas (il ne
-- met à jour que le nom d'une catégorie existante).
-- ============================================================
alter table public.fin_categories add column if not exists hidden boolean not null default false;
