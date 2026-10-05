-- ============================================================
-- Migration 015 — Désactivation du cron des Actualités
-- Décision produit : plus de rafraîchissement automatique côté serveur.
-- Les synthèses se régénèrent uniquement à la 1re visite de la page
-- Actualités dans la journée (max 1×/jour), côté client. Économie maximale.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

select cron.unschedule('horizon-news-daily')
where exists (select 1 from cron.job where jobname = 'horizon-news-daily');
