-- ============================================================
-- Grants explicites sur la Data API (public schema).
--
-- À partir du 30 octobre 2026, Supabase arrête d'accorder automatiquement
-- les privilèges Postgres nécessaires à la Data API pour toute nouvelle
-- table de public (voir email Supabase du 23/09/2026). Les tables déjà
-- créées gardent leurs droits actuels sur CE projet — mais si l'historique
-- de migration est rejoué (nouveau projet, branche de preview, `supabase
-- db reset`), seules les tables dont la migration contient un GRANT
-- explicite restent accessibles depuis l'app après cette date.
--
-- Cette migration rend explicites, pour toutes les tables existantes, les
-- droits qui étaient jusqu'ici accordés implicitement. Aucune policy RLS de
-- ce projet ne référence `anon` (application personnelle, mono-utilisateur) :
-- seuls `authenticated` et `service_role` reçoivent des privilèges, sauf
-- `celeste_session`, volontairement sans policy (accès service_role
-- uniquement, cf. migration celeste_agent).
--
-- Règle à suivre pour toute future table : ajouter les GRANT nécessaires
-- dans la même migration que le CREATE TABLE.
-- ============================================================

grant select, insert, update, delete on public.domains           to authenticated, service_role;
grant select, insert, update, delete on public.objectives        to authenticated, service_role;
grant select, insert, update, delete on public.projects          to authenticated, service_role;
grant select, insert, update, delete on public.tasks             to authenticated, service_role;
grant select, insert, update, delete on public.ideas             to authenticated, service_role;
grant select, insert, update, delete on public.habits            to authenticated, service_role;
grant select, insert, update, delete on public.habit_logs        to authenticated, service_role;
grant select, insert, update, delete on public.reviews           to authenticated, service_role;
grant select, insert, update, delete on public.layouts           to authenticated, service_role;
grant select, insert, update, delete on public.settings          to authenticated, service_role;
grant select, insert, update, delete on public.steps             to authenticated, service_role;
grant select, insert, update, delete on public.birthdays         to authenticated, service_role;
grant select, insert, update, delete on public.checks            to authenticated, service_role;
grant select, insert, update, delete on public.olafatco_jobs     to authenticated, service_role;
grant select, insert, update, delete on public.news_topics       to authenticated, service_role;
grant select, insert, update, delete on public.news_digests      to authenticated, service_role;
grant select, insert, update, delete on public.shopping_lists    to authenticated, service_role;
grant select, insert, update, delete on public.shopping_items    to authenticated, service_role;
grant select, insert, update, delete on public.calendar_feeds    to authenticated, service_role;
grant select, insert, update, delete on public.celeste_rules     to authenticated, service_role;
grant select, insert, update, delete on public.celeste_proposals to authenticated, service_role;

-- Aucune policy RLS : accès service_role uniquement (voir commentaire ci-dessus).
grant select, insert, update, delete on public.celeste_session   to service_role;
