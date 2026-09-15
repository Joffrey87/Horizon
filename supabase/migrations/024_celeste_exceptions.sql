-- ============================================================
-- Migration 024 — Agent Céleste : exceptions par jour
-- « Pas le jeudi, sauf en Nuit » : un jour refusé (no_weekdays) peut rester
-- ouvert pour certaines vacations. `weekday_exceptions` = { "4": ["N"] }
-- (clé = jour ISO, valeur = codes de vacation acceptés malgré tout).
-- ============================================================

alter table public.celeste_rules
  add column if not exists weekday_exceptions jsonb not null default '{}'::jsonb;

-- Règles de Joffrey au 15/09/2026 : jamais le dimanche, jamais le jeudi sauf en nuit.
alter table public.celeste_rules alter column no_weekdays set default '{4,7}';
alter table public.celeste_rules alter column weekday_exceptions set default '{"4": ["N"]}'::jsonb;
update public.celeste_rules
   set no_weekdays = (select array_agg(distinct j order by j) from unnest(no_weekdays || '{4}') as j),
       weekday_exceptions = weekday_exceptions || '{"4": ["N"]}'::jsonb,
       updated_at = now();
