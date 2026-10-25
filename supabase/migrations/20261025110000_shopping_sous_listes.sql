-- Sous-listes (rayons) personnalisées d'une liste : noms ordonnés ; null = rayons par défaut (liste récurrente) ou aucune sous-liste.
alter table public.shopping_lists add column if not exists sections text[];
