-- ============================================================
-- Migration 008 — Date « idéale » sur les tâches (planification)
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe) le 2026-08-09.
-- ============================================================

-- Date « idéale » (souhait) distincte de scheduled_date (planifié/ferme).
alter table public.tasks add column if not exists ideal_date date;
