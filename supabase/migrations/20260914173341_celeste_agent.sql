-- ============================================================
-- Migration 023 — Agent Céleste (remplacements)
-- Céleste (celeste-app.fr) est le site où les collègues postent des demandes
-- de remplacement de vacation. L'agent (fonction Edge « celeste », cron toutes
-- les 2 min) lit les demandes « remplaçables », les passe au crible des règles
-- de l'utilisateur et de son agenda Horizon, et selon le mode : accepte
-- lui-même, ou propose et attend la validation dans l'app.
--
-- Les identifiants Céleste ne sont PAS ici : ce sont des secrets de la
-- fonction Edge (CELESTE_EMAIL / CELESTE_PASSWORD). Seul le cookie de session
-- obtenu avec eux est conservé (celeste_session), protégé par RLS — et sans
-- accès en lecture depuis l'app : la service-role key seule le manipule.
--
-- Les vacations acceptées entrent dans `tasks` avec
-- `notes = 'source:caps source:celeste:<id>'` : « source:caps » pour que
-- Horizon les compte comme jour travaillé (messes, heures de contrôle…),
-- « source:celeste » pour les retrouver et les retirer en cas d'annulation.
-- ============================================================

-- ---- Règles de disponibilité (une ligne par utilisateur) ------------------
create table if not exists public.celeste_rules (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  enabled          boolean not null default true,
  -- auto_premiere : accepte seul la PREMIÈRE demande compatible (test), puis
  --                 passe en « confirmation » ; confirmation : propose, attend
  --                 la validation dans l'app ; auto : accepte toujours seul.
  mode             text not null default 'auto_premiere'
                   check (mode in ('auto_premiere', 'confirmation', 'auto')),
  delay_seconds    integer not null default 10,      -- pause avant une acceptation automatique
  no_weekdays      integer[] not null default '{7}', -- jours ISO refusés (7 = dimanche)
  no_shifts        text[] not null default '{}',     -- codes de vacation refusés (N, S2…)
  no_teams         text[] not null default '{10}',   -- équipes refusées (équipe du demandeur)
  -- Demande réservée : Céleste la fléche vers quelqu'un (reservedForUserId),
  -- ou le commentaire dit « Pour <Prénom> » : on n'y touche pas.
  refuse_reserved  boolean not null default true,
  no_keywords      text[] not null default '{}',     -- mots du commentaire qui font écarter (ex. « Cds »)
  min_notice_days  integer not null default 0,       -- délai minimum avant la vacation
  max_per_week     integer,                          -- plafond de remplas acceptés par semaine (null = aucun)
  ntfy_topic       text,                             -- topic ntfy.sh pour la notification téléphone
  last_scan_at     timestamptz,
  last_error       text,                             -- dernier échec du scan, en clair
  updated_at       timestamptz not null default now()
);

alter table public.celeste_rules enable row level security;
create policy "own rows select" on public.celeste_rules for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.celeste_rules for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.celeste_rules for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.celeste_rules for delete to authenticated using (user_id = (select auth.uid()));

-- ---- Demandes vues par l'agent -------------------------------------------
create table if not exists public.celeste_proposals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  celeste_id     text not null,                      -- _id de la demande sur Céleste
  date           date not null,
  shift_code     text not null,                      -- S1, M2, N…
  start_time     text not null,                      -- « 15:00 »
  end_time       text not null,                      -- « 23:00 »
  ends_next_day  boolean not null default false,
  team           text,                               -- équipe du demandeur
  points         integer,
  comment        text,
  poster         text,                               -- « Alexandre G. »
  -- proposee : attend ta décision ; acceptee : acceptée sur Céleste ;
  -- ignoree : écartée par toi ; refusee : écartée par une règle (trace) ;
  -- expiree : plus disponible (prise par un autre, retirée) ;
  -- annulee : acceptation retirée ; erreur : Céleste a refusé.
  status         text not null default 'proposee'
                 check (status in ('proposee', 'acceptee', 'ignoree', 'refusee', 'expiree', 'annulee', 'erreur')),
  reason         text,                               -- règle en cause, ou message d'erreur
  auto           boolean not null default false,     -- acceptée par l'agent seul
  task_id        uuid references public.tasks(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, celeste_id)
);

alter table public.celeste_proposals enable row level security;
create policy "own rows select" on public.celeste_proposals for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows update" on public.celeste_proposals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.celeste_proposals for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists celeste_proposals_user_idx on public.celeste_proposals(user_id, status);

-- ---- Session Céleste (cookie) — service-role uniquement -------------------
create table if not exists public.celeste_session (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  cookie           text not null,                    -- cookie(s) de rafraîchissement du site
  celeste_user_id  text,                             -- id de l'utilisateur côté Céleste
  updated_at       timestamptz not null default now()
);
alter table public.celeste_session enable row level security;
-- Aucune policy : invisible depuis l'app, même pour son propriétaire.

-- ---- Cron : scan toutes les 2 minutes -------------------------------------
-- ⚠️ Remplacer <ANON_KEY> par la clé anon du projet avant application (elle
--    sert uniquement à passer verify_jwt ; la fonction écrit avec sa propre
--    SERVICE_ROLE_KEY). La clé anon est publique.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('celeste-scan')
where exists (select 1 from cron.job where jobname = 'celeste-scan');

select cron.schedule(
  'celeste-scan',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://zahrgmswfejabqpgjkfe.supabase.co/functions/v1/celeste',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body    := jsonb_build_object('action', 'scan', 'source', 'cron'),
    timeout_milliseconds := 120000
  );
  $$
);
