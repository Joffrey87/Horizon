-- ============================================================
-- Migration 018 — Actualités importantes
-- Une même table `news_digests` porte désormais deux synthèses par sujet :
--   kind = 'jour'      → la veille courante (14 derniers jours, priorité à la semaine écoulée)
--   kind = 'important' → les 5 informations structurantes des 3 derniers mois
-- L'edge function `horizon-news` reçoit { mode } et ne remplace que la synthèse
-- du mode demandé.
-- ============================================================

alter table public.news_digests
  add column if not exists kind text not null default 'jour';

alter table public.news_digests
  drop constraint if exists news_digests_kind_check;
alter table public.news_digests
  add constraint news_digests_kind_check check (kind in ('jour', 'important'));

create index if not exists news_digests_topic_kind_idx on public.news_digests(topic_id, kind);
