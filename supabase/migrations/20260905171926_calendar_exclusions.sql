-- ============================================================
-- Migration 020 — Filtrage des agendas externes
-- Un agenda général contient des évènements qui n'ont rien à faire dans
-- « Temps ». On exclut par mot-clé sur le titre : simple, lisible, et
-- réversible (retirer le mot réimporte les évènements au passage suivant).
-- ============================================================

alter table public.calendar_feeds
  add column if not exists exclusions text[] not null default '{}'::text[];

comment on column public.calendar_feeds.exclusions is
  'Mots-clés : un évènement dont le titre en contient un n''est pas importé (comparaison sans casse ni accents).';
