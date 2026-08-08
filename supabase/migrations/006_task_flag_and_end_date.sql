-- ============================================================
-- Migration 006 — Distinction évènement/tâche + durée « jusqu'à une date »
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe) le 2026-08-08.
-- ============================================================

-- Distinction évènement / tâche : seules les tâches apparaissent dans Priorités.
-- Les lignes existantes restent des tâches (default true).
alter table public.tasks add column if not exists is_task boolean not null default true;

-- Durée « jusqu'à une date » : borne de fin optionnelle
-- (les durées en heures/jours restent stockées dans duration_min).
alter table public.tasks add column if not exists end_date date;
