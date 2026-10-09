-- Apparence d'un projet : icône (clé de src/lib/projectIcons.tsx) et couleur du
-- liseret, affichés dans « Temps ». Sans couleur, on retombe sur celle du domaine.
alter table public.projects
  add column if not exists icon text,
  add column if not exists color text;
