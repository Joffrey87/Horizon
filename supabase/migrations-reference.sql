-- ============================================================
-- HORIZON — Personal Operating System
-- Migration 001 : schéma des 7 objets + layouts + settings
-- Principe : une seule source de vérité, plusieurs projections.
-- ============================================================

-- Extension pour UUID (déjà présente sur Supabase, par sécurité)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- DOMAINE : grande zone de vie (Travail, Santé, Spiritualité…)
-- ------------------------------------------------------------
create table public.domains (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#f59e0b',
  icon        text not null default 'circle',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- OBJECTIF : résultat souhaité donnant une direction.
-- Appartient à un domaine ; servi par plusieurs projets.
-- ------------------------------------------------------------
create table public.objectives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  domain_id   uuid not null references public.domains(id) on delete cascade,
  title       text not null,
  description text,
  horizon     text not null default 'libre'
              check (horizon in ('court_terme','annuel','trimestriel','long_terme','libre')),
  status      text not null default 'actif'
              check (status in ('actif','atteint','abandonne')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PROJET : ensemble fini d'actions vers un résultat.
-- Appartient à un seul domaine ; peut servir un objectif.
-- Avancement : valeur manuelle simple (0-100), philosophie
-- « l'utilisateur garde la main ».
-- ------------------------------------------------------------
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  domain_id        uuid not null references public.domains(id) on delete cascade,
  objective_id     uuid references public.objectives(id) on delete set null,
  title            text not null,
  description      text,
  status           text not null default 'actif'
                   check (status in ('actif','pause','termine','abandonne')),
  progress         int  not null default 0 check (progress between 0 and 100),
  next_action      text,
  blocked          boolean not null default false,
  blocked_reason   text,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TÂCHE : action concrète et exécutable.
-- Rattachée à un projet OU librement à un domaine (décision :
-- tâches libres autorisées). Récurrence simple optionnelle.
-- ------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  domain_id       uuid references public.domains(id) on delete cascade,
  title           text not null,
  notes           text,
  status          text not null default 'a_faire'
                  check (status in ('a_faire','en_cours','fait','annule')),
  importance      int check (importance between 1 and 3),
  urgence         int check (urgence between 1 and 3),
  effort          int check (effort between 1 and 3),
  due_date        date,
  scheduled_date  date,
  duration_min    int,
  is_recurring    boolean not null default false,
  recurrence_rule text,           -- 'daily' | 'weekly:1,3,5' (ISO jours) | 'monthly:15'
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  -- une tâche est toujours ancrée quelque part (source de vérité unique)
  constraint task_anchored check (project_id is not null or domain_id is not null)
);

-- ------------------------------------------------------------
-- IDÉE : possibilité future, capturée sans interrompre.
-- Une seule liste ; classée directement dans un domaine.
-- Lien optionnel vers un projet. Jamais dupliquée : change d'état.
-- ------------------------------------------------------------
create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  domain_id   uuid not null references public.domains(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null,
  description text,
  status      text not null default 'active'
              check (status in ('active','reportee','convertie','abandonnee')),
  defer_until date,               -- « bonne idée, mais pour dans 6 mois »
  importance  int check (importance between 1 and 3),
  urgence     int check (urgence between 1 and 3),
  impact      int check (impact between 1 and 3),
  effort      int check (effort between 1 and 3),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- HABITUDE : comportement à rendre automatique.
-- Ancrage suivi sur 2-3 mois, vérifié mensuellement.
-- ------------------------------------------------------------
create table public.habits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  domain_id        uuid not null references public.domains(id) on delete cascade,
  title            text not null,
  description      text,
  frequency_type   text not null default 'daily'
                   check (frequency_type in ('daily','weekly')),
  weekly_target    int not null default 7,   -- occurrences visées / semaine
  anchor_state     text not null default 'nouvelle'
                   check (anchor_state in ('nouvelle','consolidation','stable','a_revoir')),
  active           boolean not null default true,
  start_date       date not null default current_date,
  created_at       timestamptz not null default now()
);

create table public.habit_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  habit_id  uuid not null references public.habits(id) on delete cascade,
  log_date  date not null default current_date,
  done      boolean not null default true,
  unique (habit_id, log_date)
);

-- ------------------------------------------------------------
-- REVUE : moment structuré. Traverse le système (pas de domaine).
-- Samedi = conception ; dimanche = confirmation ; mensuelle = ancrage.
-- ------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('hebdo','confirmation','mensuelle')),
  review_date date not null default current_date,
  answers     jsonb not null default '{}'::jsonb,  -- réponses guidées
  week_focus  jsonb not null default '[]'::jsonb,  -- ids des priorités confirmées
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LAYOUT : disposition visuelle sauvegardée (espace de travail).
-- Donnée ≠ projection ≠ layout ≠ zoom.
-- ------------------------------------------------------------
create table public.layouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  projection  text not null default 'graphe',
  is_default  boolean not null default false,
  data        jsonb not null default '{}'::jsonb,  -- positions des nœuds, filtres
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SETTINGS : réglages (WIP souple à 5 par défaut).
-- ------------------------------------------------------------
create table public.settings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  wip_limit    int not null default 5,
  first_name   text,
  daily_quote  boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Index utiles
-- ------------------------------------------------------------
create index idx_objectives_domain on public.objectives(domain_id);
create index idx_projects_domain   on public.projects(domain_id);
create index idx_projects_status   on public.projects(user_id, status);
create index idx_tasks_project     on public.tasks(project_id);
create index idx_tasks_user_status on public.tasks(user_id, status);
create index idx_tasks_sched       on public.tasks(user_id, scheduled_date);
create index idx_ideas_domain      on public.ideas(domain_id);
create index idx_habit_logs_habit  on public.habit_logs(habit_id, log_date);
create index idx_reviews_user      on public.reviews(user_id, kind, review_date);

-- ------------------------------------------------------------
-- RLS : chaque utilisateur ne voit que ses données
-- ------------------------------------------------------------
alter table public.domains    enable row level security;
alter table public.objectives enable row level security;
alter table public.projects   enable row level security;
alter table public.tasks      enable row level security;
alter table public.ideas      enable row level security;
alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;
alter table public.reviews    enable row level security;
alter table public.layouts    enable row level security;
alter table public.settings   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['domains','objectives','projects','tasks','ideas',
                           'habits','habit_logs','reviews','layouts','settings']
  loop
    execute format(
      'create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()));', t);
    execute format(
      'create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()));', t);
    execute format(
      'create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));', t);
    execute format(
      'create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()));', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Trigger : toute activité sur une tâche rafraîchit le projet
-- (détection de stagnation sans effort utilisateur)
-- ------------------------------------------------------------
create or replace function public.touch_project_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    if old.project_id is not null then
      update public.projects set last_activity_at = now() where id = old.project_id;
    end if;
    return old;
  else
    if new.project_id is not null then
      update public.projects set last_activity_at = now() where id = new.project_id;
    end if;
    return new;
  end if;
end $$;

create trigger trg_task_touch_project
after insert or update or delete on public.tasks
for each row execute function public.touch_project_activity();
