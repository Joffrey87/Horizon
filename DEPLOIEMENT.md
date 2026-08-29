# Déployer Horizon en ligne (gratuit, ~10 minutes)

## 1. Mettre le code sur GitHub

1. Crée un dépôt **privé** `horizon` sur github.com.
2. Depuis le dossier du projet :

```bash
git init
git add .
git commit -m "Horizon v0.1"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/horizon.git
git push -u origin main
```

## 2. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) → *Sign up with GitHub* (gratuit).
2. *Add New → Project* → importe le dépôt `horizon`.
3. Vercel détecte Vite automatiquement. Ajoute les **variables d'environnement** :
   - `VITE_SUPABASE_URL` = l'URL du projet Supabase (dashboard → *Project Settings → API*)
   - `VITE_SUPABASE_ANON_KEY` = la clé **publishable** du même écran

   Ces deux valeurs sont dans `.env` en local (fichier non versionné). Ne les recopie
   pas dans un fichier suivi par git : ce dépôt est public.
4. *Deploy*. Tu obtiens une URL du type `https://horizon-xxx.vercel.app`.

Le fichier `vercel.json` (déjà présent) gère le routage de l'application.

## 3. Autoriser les liens de connexion (une seule fois)

Dans le dashboard Supabase du projet **horizon** :

1. *Authentication → URL Configuration*
2. **Site URL** : ton URL Vercel (ex. `https://horizon-xxx.vercel.app`)
3. **Redirect URLs** : ajoute la même URL (et `http://localhost:5173` pour le dev local).

Sans cela, le lien magique reçu par email redirigerait vers localhost.

## 4. Activer l'assistant IA (optionnel)

1. Récupère une clé API sur [console.anthropic.com](https://console.anthropic.com) (*API Keys*).
2. Dashboard Supabase → *Edge Functions* → `horizon-ai` → *Secrets* :
   - `ANTHROPIC_API_KEY` = `sk-ant-…`

C'est tout : la clé reste côté serveur, jamais dans le navigateur.

## 5. Utilisation quotidienne

- Ouvre l'URL Vercel sur n'importe quel appareil (PC, téléphone, tablette).
- Connecte-toi avec ton email → clique le lien reçu.
- Premier lancement : Horizon propose de créer tes 6 domaines de vie.

## Mises à jour

Chaque `git push` sur `main` redéploie automatiquement. Tu peux itérer sur le code
avec Claude (Cowork ou Claude Code) puis pousser.
