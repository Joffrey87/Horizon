-- ============================================================
-- Migration 022 — Épingler une tâche sur l'accueil
-- L'accueil ne montre plus « tout sauf ce qui est masqué » mais SEULEMENT ce
-- qui a été choisi : une vision de ce sur quoi on se concentre en ce moment.
-- L'ordre affiché est l'ordre manuel du projet (`sort_order`).
-- `home_hidden` (ancien modèle inverse) reste en base, inutilisé.
-- ============================================================

alter table public.tasks
  add column if not exists home_pinned boolean not null default false;

comment on column public.tasks.home_pinned is
  'Épinglée sur l''accueil : seules ces tâches remontent dans la carte du projet.';

create index if not exists tasks_home_pinned_idx on public.tasks(user_id, project_id)
  where home_pinned;
