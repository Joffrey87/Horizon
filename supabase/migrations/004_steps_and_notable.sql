-- ============================================================
-- Migration 004 — Étapes (sous-projets) + caractéristique "notable"
-- À appliquer sur le projet Supabase `horizon` UNIQUEMENT sur accord.
-- ============================================================

-- ------------------------------------------------------------
-- ÉTAPE : sous-projet d'un projet. Un titre, une échéance, une
-- date de planification (pour le calendrier), et ses propres tâches.
-- ------------------------------------------------------------
create table if not exists public.steps (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  title          text not null,
  due_date       date,
  scheduled_date date,
  status         text not null default 'actif' check (status in ('actif','termine')),
  notable        boolean not null default false,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

-- Une tâche peut appartenir à une étape (elle reste ancrée à son projet).
alter table public.tasks add column if not exists step_id uuid
  references public.steps(id) on delete set null;

-- Caractéristique "notable" : fait apparaître l'item dans les vues trimestre / année.
alter table public.tasks add column if not exists notable boolean not null default false;

-- ------------------------------------------------------------
-- RLS : chaque utilisateur ne voit et ne modifie que ses lignes.
-- ------------------------------------------------------------
alter table public.steps enable row level security;

create policy "own rows select" on public.steps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.steps
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.steps
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.steps
  for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists steps_project_id_idx on public.steps(project_id);
create index if not exists tasks_step_id_idx on public.tasks(step_id);
