-- ============================================================
-- Migration 007 — Note libre par projet
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe) le 2026-08-09.
-- ============================================================

-- Note libre par projet (idées du moment, texte avec puces).
alter table public.projects add column if not exists notes text;
