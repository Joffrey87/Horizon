-- ============================================================
-- Migration 019 — Agendas externes (iCal)
-- Un « flux » = une adresse iCal privée (Google Agenda, ou autre) dont les
-- évènements remontent dans `tasks` (is_task = false), comme le planning CAPS.
--
-- L'adresse iCal est une CLÉ D'ACCÈS EN LECTURE à l'agenda : elle vit ici,
-- protégée par RLS (chacun ne voit que ses lignes), et jamais dans le dépôt
-- — qui est public.
--
-- Les évènements importés portent `notes = 'source:gcal:<feed_id>:<uid>'` :
-- c'est ce marqueur qui rend la synchro idempotente (mise à jour au lieu de
-- duplication) et qui permet de retirer ce qui a disparu de l'agenda.
-- ============================================================

create table if not exists public.calendar_feeds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  label         text not null,                        -- « Perso », « Famille », « ARIL »…
  ical_url      text not null,                        -- adresse privée au format iCal
  domain_id     uuid references public.domains(id) on delete set null,
  active        boolean not null default true,
  last_sync_at  timestamptz,
  last_error    text,                                 -- dernier échec, en clair
  last_count    integer,                              -- évènements retenus au dernier passage
  created_at    timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy "own rows select" on public.calendar_feeds for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.calendar_feeds for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.calendar_feeds for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.calendar_feeds for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists calendar_feeds_user_idx on public.calendar_feeds(user_id);

-- Retrouver rapidement les évènements d'un flux lors de la synchro.
create index if not exists tasks_source_gcal_idx on public.tasks(user_id, notes)
  where notes like 'source:gcal:%';
