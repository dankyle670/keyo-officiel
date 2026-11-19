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
docker-compose up api      # API (port 3000) ; clé Claude dans apps/api/.env (copie de .env.example)
pnpm --filter @keyo/api dev   # API hors conteneur
```

## Agent Keyo

- Remplace l'agence de gestion : l'agent consulte et agit depuis le chat (écrit ou dicté). Outils définis une seule fois dans `packages/shared/src/agent.ts` (schémas Zod), décrits à Claude par `apps/api`, exécutés sur le téléphone par `apps/mobile/src/agent/tools.ts`.
- Modèle choisi par le code selon la tâche (`apps/api/src/agent/router.ts`) : Haiku pour les salutations, consultations simples et spécialistes de fond ; Sonnet pour la plupart des demandes et le Gérant ; Opus pour la fiscalité, le droit, la valeur, le patrimoine, les PDF et les analyses. Une confirmation garde le modèle de la demande précédente. Haiku et Sonnet peuvent consulter Opus d'eux-mêmes (outil `advisor`).
- La clé Claude ne quitte jamais `apps/api`. Sans clé, `/agent/status` renvoie `demo` et l'app utilise `src/agent/demo.ts`.
- Toute modification passe par une carte de confirmation (réglage `agentConfirm` dans le Profil).
- Chat (`app/(owner)/assistant.tsx`, `src/agent/conversation.ts`) : plusieurs conversations gardées sur le téléphone, arrêt, régénération, modification d'un message (le champ `hist` d'un message relie le fil à l'historique Claude), réponses mises en forme (`src/ui/Markdown.tsx`). Menu « + » : pièces jointes, connecteurs, réglages rapides. Pas de dépendance native ajoutée : copier passe par la feuille de partage. Les conversations sont aussi gardées côté serveur (`apps/api/src/conversations/`, Redis, sans les photos ni PDF) ; relecture : `pnpm --filter @keyo/api conversations [id]`.
- Contrôle de gestion (« ops ») : `runAudit` dans `packages/shared/src/audit.ts` est la source de vérité (déterministe, testé) ; le sous-agent `/agent/ops` ne fait que prioriser, sans inventer de point.
- Repères fiscaux et juridiques : toujours indicatifs, renvoyer vers un conseiller.
- Passeport propriétaire : `ownerPassport` et `borrowingCapacity` dans `packages/shared/src/owner-passport.ts` (score sur 1000, revenus certifiés = encaissements confirmés par webhook uniquement, capacité d'emprunt à 70 % des loyers). Les revenus déclarés restent marqués « déclarés ». Jamais présenté comme une offre de prêt.
- Patrimoine familial : un bien est `PERSONAL` ou `FAMILY` ; les parts (`AssetShare`, pour mille, total 1000) et la valeur de chacun viennent de `packages/shared/src/patrimony.ts`. Les proches sont des `Party` de rôle `FAMILY` (consulter ou co-gérer). Pas de conversion de devise implicite.
- Évaluation : l'expertise Keyo (`packages/shared/src/appraisal.ts`) pose les questions d'un expert et calcule l'estimation (maisons, appartements, plantations seulement). Écran `bien/[id]/expertise` (simulation sans clé) ; outils `get_appraisal_questions` et `submit_appraisal` pour l'agent. `valueAsset` (`valuation.ts`) ne donne qu'une première indication. Toujours indicatif.

- Agent autonome (`apps/api/src/autonomous/`) : un Gérant délègue à des spécialistes (Encaissement, Relocation, Entretien, Conformité, Finances), chacun avec ses outils. Toute action passe par `ActionGate` : validation contre les données réelles (destinataire et montant tirés de la fiche, jamais du modèle), idempotence, puis `decideAutonomy` (`packages/shared/src/autonomy.ts`), qui décide entre exécuter, demander l'accord, différer ou refuser. Jamais d'argent déplacé, de signature, de résiliation ni de procédure. Sans clé Claude : règles fixes (playbook). `wake()` décide en code qui réveiller, pour ne jamais appeler Claude à vide. Stockage en mémoire pour l'instant (`AgentStore`), connecteurs simulés sauf WhatsApp si `WHATSAPP_TOKEN` est défini. Côté app : `src/autonomous/sync.ts` envoie les données au serveur (après chaque modification, et chaque minute) et applique les modifications des agents (`actions.applyAgentMutations`) ; écrans `agent/` (journal et accords, Autonomie, Connexions).
- Carte 3D Mapbox : nécessite `EXPO_PUBLIC_MAPBOX_TOKEN` (voir `apps/mobile/.env.example`) et un development build (`eas build --profile development --platform ios`). Sous Expo Go ou sans jeton, `src/map/AssetsMap.tsx` affiche l'illustration isométrique de secours.
- Mobile : les écrans ne lisent les données que via `src/data/selectors.ts` et `src/data/store.ts` (données fictives pour l'instant, à remplacer par le client API).
