-- ============================================================
-- Migration 005 — Habitudes (jours précis + heure) & Objectifs (échéance + critères)
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe) le 2026-08-08.
-- ============================================================

-- Habitudes : jours précis de la semaine + heure optionnelle
alter table public.habits add column if not exists weekdays text;     -- ex '2,4,6' (jours ISO) ; null = pas de jours précis
alter table public.habits add column if not exists time_of_day text;  -- ex '07:30' ; null = pas d'heure

-- Objectifs : échéance (avec granularité) + critères de réussite cochables
alter table public.objectives add column if not exists target_date date;
alter table public.objectives add column if not exists target_granularity text
  check (target_granularity in ('jour','semaine','mois'));
alter table public.objectives add column if not exists criteria jsonb not null default '[]'::jsonb;
