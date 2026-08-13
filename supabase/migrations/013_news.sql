-- ============================================================
-- Migration 013 — Actualités (onglet « Activités »)
-- Suivi de sujets choisis par l'utilisateur (IA, Elon Musk, Atelier
-- Missor…). Une edge function « horizon-news » génère chaque matin une
-- synthèse par sujet (Claude + recherche web) et l'écrit ici ; la vue
-- Actualités lit ce cache. Le bouton « Actualiser » force une régénération.
-- Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

-- Sujets suivis (modifiables par l'utilisateur) --------------------------------
create table if not exists public.news_topics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,                 -- ex. « Intelligence artificielle »
  prompt      text,                           -- précisions optionnelles pour orienter la synthèse
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.news_topics enable row level security;
create policy "own rows select" on public.news_topics for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.news_topics for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.news_topics for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.news_topics for delete to authenticated using (user_id = (select auth.uid()));

-- Synthèses générées (une par sujet, remplacée à chaque génération) -------------
create table if not exists public.news_digests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  topic_id      uuid not null references public.news_topics(id) on delete cascade,
  content       text not null default '',      -- synthèse (texte, une actu par puce « — »)
  sources       jsonb not null default '[]'::jsonb,  -- [{ title, url }]
  generated_at  timestamptz not null default now()
);

create index if not exists news_digests_topic_idx on public.news_digests(topic_id);

alter table public.news_digests enable row level security;
-- lecture par l'utilisateur ; l'écriture se fait via l'edge function (service role, hors RLS)
create policy "own rows select" on public.news_digests for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows delete" on public.news_digests for delete to authenticated using (user_id = (select auth.uid()));
