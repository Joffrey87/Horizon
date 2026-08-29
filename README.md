# Horizon — Personal Operating System

Tableau de bord personnel pour piloter vie professionnelle, spirituelle, familiale et personnelle,
construit d'après la spécification « POS v0.1 ».

> **Idée directrice : une seule base de données, plusieurs projections, un espace visuel de pilotage.**

## Ce que fait l'app

- **Accueil / cockpit** : ~3 priorités du jour, habitudes du jour, projets actifs, alertes utiles
  (stagnation, blocage, surcharge), focus de la semaine, équilibre des domaines (radar), citation du jour.
- **Projets** : avancement manuel, prochaine action, blocages, seuil souple de projets actifs (5 par défaut).
- **Priorités** : matrice d'Eisenhower qui *puise* dans les idées et tâches — rien n'est dupliqué,
  chaque décision change l'état de l'élément (abandonner / dans 6 mois / → tâche / → projet).
- **Domaines & objectifs** : les 6 grandes zones de vie et leurs objectifs par horizon.
- **Temps** : semaine (grille horaire), mois, trimestre, année. Évènements multi-jours, couches
  de calendrier (Tâches / Fêtes / Messes / Anniversaires / ARIL), croix ✝ « trouver une messe »
  sur chaque jour, grandes fêtes catholiques, planning de garde CAPS.
- **Planification** : vue de mise en place de la semaine, complémentaire de « Temps ».
- **Habitudes** : ancrage sur 2-3 mois, tendance sur 4 semaines (pas de culte du streak), états d'ancrage.
- **Activités** : veille d'actualités par sujet (synthèses du jour et « importantes » du trimestre,
  générées par Claude + recherche web) et lectures du jour (Évangile, quiz de mémorisation).
- **Revues guidées** : samedi (conception), dimanche (confirmation/engagement), mensuelle (ancrage).
- **Vérifications** : garde-fous configurables (périodiques, « messe si je travaille ») et listes de courses.
- **Heures de contrôle** : proposition des heures OLAFATCO à partir du planning CAPS.
- **Espace visuel** : carte drag & drop de tout le système (React Flow), « mettre au carré »,
  organisations automatiques, layouts sauvegardés.
- **Export / import JSON** : toutes les collections, sans exception — les données ne sont jamais enfermées.

L'**assistant IA** (`AssistantPanel.tsx`, Edge Function `horizon-ai`) est présent dans le code
mais **masqué dans l'interface** ; il est réactivable.

## Stack

- React 19 + TypeScript + Vite + Tailwind CSS 4
- Zustand (état), React Router, React Flow (`@xyflow/react`), date-fns, lucide-react
- Supabase : Postgres + Auth (email / mot de passe, connexion par prénom) + RLS + Edge Functions
  (`horizon-ai`, `horizon-news`, `horizon-gospel`, `refresh-masses`)

## Démarrer en local

```bash
npm install
npm run dev
```

Renseigner `.env` (non versionné) à partir de `.env.example` :
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LOGIN_MAP`.
**Ce dépôt est public : aucun secret ne doit être écrit dans un fichier suivi par git.**

**Mode démo sans connexion** : ouvrir `http://localhost:5173/demo.html` — l'app complète,
démarrée vierge, avec des données locales non persistantes (rien n'est enregistré).

## Base de données

Le schéma vit dans `supabase/migrations/` (`004` à `018` ; copie de référence de l'état initial
dans `supabase/migrations-reference.sql`). RLS activée partout : chaque utilisateur ne voit que
ses données. Une nouvelle migration prend le numéro suivant, jamais un numéro déjà utilisé.

Décisions incarnées par le schéma :

- une tâche appartient à un projet **ou** librement à un domaine (contrainte `task_anchored`) ;
- récurrence simple sur les tâches (`daily` / `weekly:1,3,5` / `monthly:15`) ;
- toute activité sur une tâche rafraîchit `last_activity_at` du projet (détection de stagnation) ;
- une idée n'est jamais copiée : elle change de statut (`active`, `reportee`, `convertie`, `abandonnee`).

## Fonctions Edge

Secrets à renseigner dans le dashboard Supabase → *Edge Functions* → *Secrets* :

```
ANTHROPIC_API_KEY=sk-ant-…
ALLOWED_ORIGINS=https://<ton-domaine>,http://localhost:5173   (optionnel)
```

Les fonctions n'acceptent que les origines de `ALLOWED_ORIGINS` et ne traitent que les données
de l'utilisateur appelant (déduit de son JWT).

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — typecheck + build de production (`dist/`)
- `npm run typecheck` — TypeScript seul (`strict`, `noUncheckedIndexedAccess`)
- `npm run lint` — oxlint
- `npm test` — tests unitaires des règles métier (vitest, `src/lib/logic.test.ts`)
- `npm run smoke` — test de bout en bout de la base ; nécessite `HORIZON_TEST_EMAIL` et
  `HORIZON_TEST_PASSWORD` dans l'environnement
- `scripts/screenshots.mjs` — captures d'écran du mode démo (nécessite `playwright`)

Ces quatre vérifications tournent aussi en CI (`.github/workflows/ci.yml`) à chaque push sur `main`.

## Déploiement

Voir `DEPLOIEMENT.md`.
