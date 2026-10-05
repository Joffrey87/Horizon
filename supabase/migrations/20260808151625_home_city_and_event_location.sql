-- ============================================================
-- Migration 011 — Localisation pour la recherche de messes
--  - settings.home_city : ville de référence (adresse) → où chercher les messes
--    par défaut (déroulante horaire seulement là où une liste est maintenue : Reims) ;
--  - tasks.location : lieu d'un évènement (ex. lieu de vacances). Pendant un
--    séjour (évènement multi-jours avec lieu), les messes se cherchent là-bas,
--    et tout dimanche du séjour réclame une messe.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

alter table public.settings add column if not exists home_city text;
alter table public.tasks add column if not exists location text;
