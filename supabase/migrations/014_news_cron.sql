-- ============================================================
-- Migration 014 — Cron quotidien des Actualités
-- Appelle l'edge function « horizon-news » chaque matin pour régénérer
-- les synthèses. La fonction traite tous les sujets actifs (app perso).
--
-- ⚠️ Remplacer <ANON_KEY> par la clé publishable/anon du projet avant
--    application (elle sert uniquement à passer verify_jwt ; la fonction
--    écrit avec sa propre SERVICE_ROLE_KEY). La clé anon est publique.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (ré)installe proprement le job
select cron.unschedule('horizon-news-daily')
where exists (select 1 from cron.job where jobname = 'horizon-news-daily');

select cron.schedule(
  'horizon-news-daily',
  '0 5 * * *',  -- 05:00 UTC (~7 h à Paris l'été, 6 h l'hiver)
  $$
  select net.http_post(
    url     := 'https://zahrgmswfejabqpgjkfe.supabase.co/functions/v1/horizon-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 120000
  );
  $$
);
