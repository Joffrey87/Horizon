-- ============================================================
-- Type d'élément d'une tâche (bouton « + » : Tâche / Achat / Rappel).
-- Même table, même vue Priorités : seul le badge change. Colonne ajoutée avec
-- une valeur par défaut, donc sans effet sur les lignes et les versions
-- précédentes de l'app. Appliquée sur le projet Supabase horizon (zahrgmswfejabqpgjkfe).
-- ============================================================

alter table public.tasks add column if not exists kind text not null default 'tache';
do $$ begin
  alter table public.tasks add constraint tasks_kind_check check (kind in ('tache', 'achat', 'rappel'));
exception when duplicate_object then null; end $$;
