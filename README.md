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
- **Temps** : semaine + mois, tâches planifiées, échéances, responsabilités récurrentes, charge estimée.
- **Idées** : une seule liste, classée par domaine, avec report « pour dans 6 mois » et réveil automatique.
- **Habitudes** : ancrage sur 2-3 mois, tendance sur 4 semaines (pas de culte du streak), états d'ancrage.
- **Revues guidées** : samedi (conception), dimanche (confirmation/engagement), mensuelle (ancrage).
- **Espace visuel** : carte drag & drop de tout le système (React Flow), « mettre au carré »,
  organisations automatiques, layouts sauvegardés.
- **Assistant IA** : copilote Claude (via Edge Function sécurisée) — il propose, ne décide jamais.
- **Export / import JSON** : tes données ne sont jamais enfermées.

## Stack

- React 19 + TypeScript + Vite + Tailwind CSS 4
- Zustand (état), React Router, React Flow (`@xyflow/react`), date-fns, lucide-react
- Supabase : Postgres + Auth (lien magique) + RLS + Edge Function `horizon-ai`
- Projet Supabase : `horizon` (`zahrgmswfejabqpgjkfe`, région Paris)

## Démarrer en local

```bash
npm install
npm run dev
```

Le fichier `.env` contient déjà l'URL et la clé publiable du projet Supabase.

**Mode démo sans connexion** : ouvrir `http://localhost:5173/demo.html` — l'app complète
avec des données fictives locales, rien n'est enregistré.

## Base de données

Le schéma est déjà appliqué au projet Supabase (migrations `001` à `003`) :
les 7 objets (domains, objectives, projects, tasks, ideas, habits + habit_logs, reviews),
plus layouts et settings. RLS activée partout (chaque utilisateur ne voit que ses données).
Copie de référence dans `supabase/migrations-reference.sql`.

Décisions incarnées par le schéma :

- une tâche appartient à un projet **ou** librement à un domaine (contrainte `task_anchored`) ;
- récurrence simple sur les tâches (`daily` / `weekly:1,3,5` / `monthly:15`) ;
- toute activité sur une tâche rafraîchit `last_activity_at` du projet (détection de stagnation) ;
- une idée n'est jamais copiée : elle change de statut (`active`, `reportee`, `convertie`, `abandonnee`).

## Assistant IA

La fonction Edge `horizon-ai` est déployée. Pour l'activer, ajouter le secret dans le
dashboard Supabase → *Edge Functions* → *Secrets* :

```
ANTHROPIC_API_KEY=sk-ant-…
```

Sans clé, l'app fonctionne intégralement — l'assistant affiche simplement qu'il n'est pas activé.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (`dist/`)
- `scripts/smoke-test.mjs` — test de bout en bout de la base (nécessite un utilisateur de test)
- `scripts/screenshots.mjs` — captures d'écran du mode démo (nécessite `playwright` en devDependency)

## Déploiement

Voir `DEPLOIEMENT.md`.
