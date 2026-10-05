-- ============================================================
-- Suivi de la consommation de l'API Anthropic.
-- Une ligne par appel au modèle, écrite par les fonctions Edge
-- (horizon-gospel, horizon-news, horizon-ai) avec la service-role key.
-- L'app ne fait que LIRE (Paramètres → « Consommation de l'IA ») : aucune
-- policy d'écriture pour `authenticated`.
-- Le coût n'est pas stocké : il se calcule à l'affichage (src/lib/aiUsage.ts),
-- pour qu'une correction de tarif s'applique aussi à l'historique.
-- ============================================================

create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  fn             text not null,                   -- 'gospel' | 'news' | 'assistant'
  detail         text,                            -- ex. 'jour niv. 2', 'revision', 'important'
  model          text not null,
  input_tokens   int  not null default 0,
  output_tokens  int  not null default 0,
  web_searches   int  not null default 0,         -- recherches web facturées à part
  created_at     timestamptz not null default now()
);

create index if not exists ai_usage_user_date_idx on public.ai_usage(user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "own rows select" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;
