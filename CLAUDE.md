# Keyo

App mobile de gestion d'actifs à distance (immobilier d'abord), éditée par DK Group.
Promesse : « Vos biens, gérés d'ici. »

- Feuille de route complète : `docs/ROADMAP.md` (à lire avant toute nouvelle fonctionnalité).
- Design : `docs/design/` (charte, `tokens.json`, logos, 21 écrans en PNG pour le rendu et en HTML pour les valeurs exactes).

## Architecture (monorepo pnpm + Turborepo)

```
apps/mobile     Expo + Expo Router (TypeScript), iOS et Android, une seule app avec rôles
apps/api        NestJS + Prisma (PostgreSQL), BullMQ + Redis pour les tâches planifiées
apps/admin      Next.js, back-office DK Group
packages/shared Types, schémas Zod, constantes (statuts, devises), partagés mobile/API
packages/tokens Tokens de design générés depuis docs/design/tokens.json
packages/config ESLint, TSConfig, Prettier partagés
```

## Ordre de développement choisi

1. Partie propriétaire (iOS en premier pour les démos)
2. Partie locataire
3. Back-office (`apps/admin`)

Le développement se fait sous Linux : pas de simulateur iOS. On teste sur un iPhone réel via Expo Go (ou un development build EAS).

## Règles

- TypeScript strict partout. Schémas Zod partagés dans `packages/shared`.
- Montants en entiers (unité mineure) + code devise (`XOF`, `EUR`, puis `CAD`, `USD`). Jamais de float pour l'argent.
- Un paiement n'est « payé » qu'après confirmation par webhook de l'opérateur, jamais sur la parole de l'app.
- Les fonds ne transitent jamais par DK Group : tout passe par l'agrégateur (CinetPay/PayDunya, Stripe). Pas de solde ni de porte-monnaie Keyo.
- Ne jamais coder « loyer » / « locataire » en dur dans le cœur : utiliser `Asset`, `AssetUnit`, `Agreement`, `Party`, `Schedule`, `Transaction`, `Event`, `Document`. L'immobilier est le premier module ; les champs propres à un type vont dans `details` (JSON validé par un schéma Zod par type).
- Mobile hors ligne d'abord : cache local et file d'attente des actions.
- Authentification par téléphone + OTP SMS.

## UI

- Uniquement les tokens de `packages/tokens`, aucune couleur en dur.
- Texte sur `mint` = `night`, jamais blanc. Un seul bouton principal par écran.
- Un statut porte toujours un mot en plus de la couleur (point 7 px + mot).
- Plus Jakarta Sans ; titres 800 ; montants en chiffres tabulaires, devise plus petite et grise.
- Icônes Lucide au trait (24 px, trait 1,8).
- Boutons et champs en pilule (56 px de haut), cartes 26 à 32 px de rayon, fond d'écran `#F3F6F9`.
- Navigation iPhone : barre flottante `night` en pilule, onglet actif `mint` avec libellé.
- Signature DK Group uniquement sur l'écran de démarrage : symbole DK seul, sans texte, petit et discret.
- Textes en français, vouvoiement, sans emoji, ton clair et calme. i18n prête pour l'anglais.

## Méthode

- Une branche par fonctionnalité, une PR relue avant fusion.
- Pour chaque fonctionnalité : d'abord un plan (fichiers, modèle de données, endpoints), validé, puis l'implémentation.
- Terminer par : tests verts, typecheck vert, démo sur un vrai téléphone.
- Chaque fonctionnalité : tests unitaires (API) + test du parcours principal.

## Commandes

```
pnpm install          # à la racine (node-linker=hoisted, requis par React Native)
pnpm typecheck        # tous les paquets, via Turborepo
pnpm test             # tests (packages/shared : node --test)
pnpm tokens           # régénère packages/tokens/src/generated.ts depuis docs/design/tokens.json
pnpm mobile           # lance Metro en mode Expo Go ; scanner le QR code avec l'iPhone
docker-compose up mobile   # même chose dans un conteneur (KEYO_LAN_IP=IP Wi-Fi de la machine)
```

- Carte 3D Mapbox : nécessite `EXPO_PUBLIC_MAPBOX_TOKEN` (voir `apps/mobile/.env.example`) et un development build (`eas build --profile development --platform ios`). Sous Expo Go ou sans jeton, `src/map/AssetsMap.tsx` affiche l'illustration isométrique de secours.
- Mobile : les écrans ne lisent les données que via `src/data/selectors.ts` et `src/data/store.ts` (données fictives pour l'instant, à remplacer par le client API).
