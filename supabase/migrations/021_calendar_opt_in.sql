-- ============================================================
-- Migration 021 — Agendas externes : on choisit ce qui entre
-- Rien n'est importé automatiquement. La synchro PROPOSE les évènements à
-- venir ; l'utilisateur décide lesquels rejoignent « Temps ».
--   `ignored` = identifiants (UID iCal) de séries écartées : elles ne
--   réapparaissent plus dans les propositions.
-- Aucun historique n'est lu : la fenêtre part du jour même.
-- ============================================================

alter table public.calendar_feeds
  add column if not exists ignored text[] not null default '{}'::text[];

comment on column public.calendar_feeds.ignored is
  'UID iCal des séries écartées : plus jamais proposées à l''import.';
