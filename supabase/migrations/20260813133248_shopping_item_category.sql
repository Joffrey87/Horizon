-- ============================================================
-- Migration 017 — Sous-catégorie d'article (listes de courses)
-- Permet de regrouper les articles d'un rayon (ex. « Viande » → Poulet,
-- « Fruits » → Fraise, Framboise…). null = article autonome.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

alter table public.shopping_items add column if not exists category text;
