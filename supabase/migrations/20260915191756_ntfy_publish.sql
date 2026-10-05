-- ============================================================
-- Migration 025 — Envoi ntfy depuis Postgres
-- ntfy.sh plafonne les messages PAR ADRESSE IP. Les fonctions Edge partagent
-- leurs IP avec d'autres projets Supabase : le quota est atteint par les
-- autres et ntfy répond 429. La base, elle, tourne sur sa propre machine
-- (IP à elle) : c'est d'ici qu'on publie, via pg_net (asynchrone).
-- Appelée par la fonction Edge « celeste » (db.rpc('ntfy_publish', …)).
-- ============================================================

create or replace function public.ntfy_publish(payload jsonb)
returns bigint
language sql
security definer
set search_path = public, net
as $$
  select net.http_post(
    url := 'https://ntfy.sh',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload
  );
$$;

-- Service-role uniquement : l'app n'envoie jamais de notification elle-même.
revoke all on function public.ntfy_publish(jsonb) from public, anon, authenticated;
grant execute on function public.ntfy_publish(jsonb) to service_role;
