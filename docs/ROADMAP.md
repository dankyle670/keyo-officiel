# Keyo : feuille de route produit et technique

> **Keyo** est une application mobile de gestion d'actifs à distance, éditée par **DK Group**.
> Elle commence par la gestion locative, puis s'étend à d'autres types de biens : plantations, fermes, véhicules, commerces.
> Promesse : **« Vos biens, gérés d'ici. »**

Ce document sert de référence pour le développement avec Claude Code. Place-le à la racine du dépôt (`docs/ROADMAP.md`) et fais-le référencer depuis `CLAUDE.md`.

---

## 0. Contexte à donner à Claude Code

Claude Code ne connaît pas les échanges précédents. Ce qui suit résume tout ce qui a été décidé.

### Le produit en une phrase
Permettre à un propriétaire (en France, en Côte d'Ivoire ou dans la diaspora) de gérer ses biens à distance : encaisser les loyers, relancer les retards, gérer les incidents et suivre la rentabilité. Le locataire, lui, paie facilement et se construit un historique de crédit.

### Les utilisateurs
| Rôle | Description | Besoin principal |
| --- | --- | --- |
| **Propriétaire** | Possède 1 à 20 biens, souvent à distance (diaspora) | Visibilité, encaissement, tranquillité |
| **Locataire** | Occupe un logement ou un local | Payer simplement, être écouté, construire un dossier crédible |
| **Gérant terrain** *(V2)* | Personne de confiance sur place | Recevoir les missions, faire remonter photos et rapports |
| **Artisan** *(V2)* | Plombier, électricien… | Recevoir des interventions, envoyer un devis, être payé |
| **Agence** *(V3)* | Gère des dizaines ou des centaines de biens | Back-office multi-propriétaires |
| **Exploitant** *(Phase 4)* | Gère une plantation, une ferme ou un véhicule pour le compte du propriétaire | Déclarer récoltes, ventes, dépenses |

### Marchés
- **Côte d'Ivoire** en priorité (FCFA, Mobile Money : Wave, Orange Money, MTN MoMo), avec la **diaspora** comme cœur de cible côté propriétaires.
- **France** ensuite (EUR, carte et virement).

### Livrables de design existants
- **Charte Keyo** (couleurs, typographie, logo, ton, signature DK Group) : https://claude.ai/artifact/LGpzSBmxxjeWaeeW6V9QRQ
- **Maquettes mobiles** (iPhone et Android : propriétaire, locataire, carte 3D, Passeport locataire) : https://claude.ai/artifact/Vs3gjzTzNNKAGPrG1EWSmN
- **Design system DK Group** (marque mère) : https://claude.ai/artifact/3MJP4FAdNMCavyoABUBTi7

### Rappel de la charte
- Couleurs : `night` #0B1B33 (confiance), `mint` #2ED47A (action, argent qui rentre). Texte sur mint en `night`, jamais en blanc.
- Statuts : Payé (`mint-tint` / `mint-deep`), En retard (`amber-tint` / `amber`), Impayé ou urgent (`danger-tint` / `danger`). Toujours un mot en plus de la couleur.
- Typographie : Plus Jakarta Sans. Coins arrondis (16 px pour les cartes et boutons, 28 px pour les grandes cartes), icônes au trait de type Lucide.
- Ton : clair, calme, proche, avec vouvoiement et sans emoji.
- Signature DK Group : « UN PRODUIT » suivi du symbole DK, discret, uniquement sur l'écran de démarrage et dans le marketing.

---

## 1. Architecture technique

### Monorepo (pnpm + Turborepo)
```
keyo/
├── apps/
│   ├── mobile/          # React Native + Expo (TypeScript), iOS et Android
│   ├── api/             # NestJS (TypeScript), API REST
│   └── admin/           # Next.js : back-office interne DK Group (puis agences)
├── packages/
│   ├── shared/          # Types, schémas Zod, constantes (statuts, devises)
│   ├── tokens/          # Tokens de design Keyo (générés depuis la charte)
│   └── config/          # ESLint, TSConfig, Prettier partagés
├── docs/
│   └── ROADMAP.md       # ce fichier
└── CLAUDE.md
```

### Choix techniques
| Brique | Choix | Raison |
| --- | --- | --- |
| Mobile | **Expo (React Native) + Expo Router** | Un seul code iOS et Android, en TypeScript |
| Rôles | **Une seule app avec rôles** (propriétaire, locataire, etc.) | Plus simple à maintenir au départ. On pourra séparer en deux apps sur les stores plus tard |
| API | **NestJS** + validation **Zod** (partagée avec le mobile) | Structure modulaire, typage de bout en bout |
| Base de données | **PostgreSQL** + **Prisma** | Relationnel, migrations propres |
| Tâches planifiées | **BullMQ + Redis** | Échéances, relances, rapports mensuels |
| Fichiers | Stockage compatible S3 | Photos, baux, quittances, attestations |
| Authentification | **Numéro de téléphone + code SMS (OTP)** | Indispensable en Afrique de l'Ouest |
| Paiements | **CinetPay** ou **PayDunya** (Mobile Money UEMOA), **Stripe** (France) | Agrégateurs agréés : Keyo ne détient jamais les fonds |
| Notifications | Expo Push + SMS en secours | Les locataires n'ont pas tous l'app ouverte |
| IA | **API Claude** (Anthropic) | Assistant, qualification des incidents, rédaction des relances |
| Cartes | **Mapbox** (`@rnmapbox/maps`) | Vue 2D et 3D des biens |
| PDF | Génération côté serveur (quittances, attestations) | Documents officiels et vérifiables |
| Observabilité | Sentry + logs structurés | Suivi des erreurs en production |

### Principes à respecter partout
- **Montants en unités entières + code devise** (`amount: 35000000`, `currency: "XOF"`). Jamais de nombres à virgule pour l'argent.
- **Multi-devises dès le départ** : XOF, EUR, puis CAD et USD pour la diaspora.
- **Les fonds ne transitent jamais par un compte DK Group** : tout passe par l'agrégateur de paiement.
- **Chaque paiement est confirmé par webhook** de l'opérateur, et non par l'app, avant d'être marqué « Payé ».
- **Hors ligne d'abord** sur mobile : cache local et file d'attente des actions, car le réseau peut être instable.
- **Android d'abord** pour les tests et l'optimisation (majoritaire en Côte d'Ivoire), avec des téléphones d'entrée de gamme comme référence.
- **Français par défaut**, i18n prête pour l'anglais.

---

## 2. Modèle de données : pensé dès maintenant pour tous les types de biens

L'objectif « gérer d'autres biens que l'immobilier » se prépare **dès la Phase 0**. Le cœur du modèle est générique ; seuls les détails changent selon le type.

```
Owner (propriétaire)
 └── Asset (actif)                ← type : REAL_ESTATE | PLANTATION | FARM | VEHICLE | SHOP
      ├── AssetUnit (lot/parcelle) ← appartement, parcelle de 2 ha, enclos, véhicule…
      ├── Location                 ← adresse + coordonnées GPS (+ polygone pour une parcelle)
      ├── Agreement (contrat)      ← bail, contrat de gérance, contrat d'exploitation
      │    └── Party               ← locataire, gérant, exploitant
      ├── Schedule (échéancier)    ← loyers mensuels, versements de récolte…
      ├── Transaction              ← revenus et dépenses (loyer, vente de récolte, intrants, travaux)
      ├── Event                    ← incident, intervention, récolte, naissance, panne…
      ├── Document                 ← bail, quittance, rapport, photo
      └── Report                   ← rapport mensuel, rapport de campagne agricole
```

- `Asset.type` et `AssetUnit.type` décident des champs spécifiques, stockés dans une colonne `details` JSON **validée par un schéma Zod propre à chaque type**.
- Les écrans génériques (liste des actifs, finances, documents, carte, assistant) marchent pour tous les types. Seuls quelques écrans sont spécialisés.
- **Règle pour Claude Code** : ne jamais coder « loyer » ou « locataire » en dur dans le cœur. Utiliser `Transaction`, `Schedule` et `Party`, et laisser l'immobilier être le premier « module ».

---

## 3. Fonctionnalités

### 3.1 Propriétaire
| Fonctionnalité | Phase |
| --- | --- |
| Inscription par téléphone, profil, choix de la devise d'affichage | 1 |
| Créer un bien et ses lots (photos, adresse, type, loyer) | 1 |
| Inviter un locataire par SMS ou lien, créer le bail (dates, loyer, caution, échéance) | 1 |
| Tableau de bord : encaissé ce mois, attendu, retards, incidents | 1 |
| Liste des loyers du mois avec statuts et filtres | 1 |
| Relances automatiques des retards (J+1, J+5, J+10, ton progressif) | 1 |
| Quittances générées et envoyées automatiquement | 1 |
| Incidents remontés par les locataires, avec photos et urgence | 1 |
| Notifications : loyer reçu, retard, nouvel incident | 1 |
| Coffre-fort de documents par bien (titre foncier ou ACD, bail, factures) | 1 |
| Finances : revenus, dépenses, rentabilité par bien, export | 2 |
| Assistant IA : questions en langage naturel sur ses biens | 2 |
| Rapport mensuel automatique (texte et audio) | 2 |
| Devis d'artisans : demande, comparaison, validation, paiement | 2 |
| Entretien préventif (rappels : climatisation, fosse, peinture…) | 2 |
| Carte des biens en 2D, puis **en 3D**, avec leur statut | 2 |
| Gérant terrain : missions, visites, rapports photo | 2 |
| Mise en location : annonce, candidatures, visites | 3 |
| Multi-actifs : plantations, fermes, véhicules, commerces | 4 |

### 3.2 Locataire
| Fonctionnalité | Phase |
| --- | --- |
| Rejoindre son logement via l'invitation du propriétaire | 1 |
| Voir le prochain loyer et l'échéance | 1 |
| Payer par Wave, Orange Money, MTN MoMo ou carte | 1 |
| **Mode secours : lien de paiement par SMS sans installer l'app** | 1 |
| Rappels avant l'échéance | 1 |
| Quittances, bail et état des lieux dans l'app | 1 |
| Signaler un problème (catégorie, description, photos) et suivre l'intervention | 1 |
| Messagerie avec le propriétaire, avec historique conservé | 2 |
| Paiement en plusieurs fois, si le propriétaire l'accepte | 2 |
| **Passeport locataire** : score, historique certifié, badges | 3 |
| Partage du passeport avec une banque ou une microfinance (consentement, durée, révocation) | 3 |
| Attestation PDF avec QR code de vérification | 3 |

### 3.3 Back-office DK Group (`apps/admin`)
| Fonctionnalité | Phase |
| --- | --- |
| Support : rechercher un utilisateur, un bien, un paiement | 1 |
| Suivi des paiements et rapprochement avec les webhooks | 1 |
| Modération des comptes, gestion des litiges | 2 |
| Gestion des artisans vérifiés | 2 |
| Portail de vérification des attestations, pour les banques | 3 |
| Espace agences (multi-propriétaires, marque blanche) | 5 |

---

## 4. Feuille de route par phases

### Phase 0 : Fondations (2 à 3 semaines)
**Objectif :** un socle propre sur lequel tout le reste s'appuie.
- [ ] Monorepo pnpm + Turborepo, ESLint, Prettier, TSConfig partagés
- [ ] CI (lint, typecheck, tests) sur chaque pull request
- [ ] `packages/tokens` généré depuis la charte Keyo (couleurs, typo, espacements, rayons)
- [ ] App Expo : navigation, thème, écran de démarrage avec la signature DK Group, polices
- [ ] API NestJS : structure par modules, Prisma, migrations, gestion des erreurs, logs
- [ ] Authentification par téléphone et OTP, gestion des rôles
- [ ] **Modèle de données générique** (section 2), avec l'immobilier comme premier type
- [ ] Environnements dev, staging et prod ; secrets hors du dépôt

**Terminé quand :** un utilisateur peut s'inscrire par SMS sur Android et iOS, choisir son rôle et voir un écran d'accueil vide aux couleurs de Keyo.

### Phase 1 : MVP gestion locative (8 à 10 semaines)
**Objectif :** un propriétaire de la diaspora encaisse les loyers d'un locataire à Abidjan sans passer un seul appel.
- [ ] Biens, lots, baux, invitation du locataire
- [ ] Échéancier des loyers généré à partir du bail
- [x] Comptes de réception du propriétaire (Mobile Money, banque ; par bien), vérifiés par code SMS, chiffrés
- [x] Moyen de paiement de l'abonnement Keyo : carte (Visa, Mastercard…) ou Mobile Money ; prestataire carte simulé, Stripe ou CinetPay à brancher
- [ ] Tarif de l'abonnement (forfait mensuel fixe) et prélèvements
- [ ] Paiement Mobile Money (CinetPay ou PayDunya) + webhooks + lien SMS de secours
- [ ] Statuts des loyers (à venir, payé, en retard, partiel) calculés par une tâche quotidienne
- [ ] Relances automatiques (push puis SMS), rédigées avec un ton progressif
- [ ] Quittances PDF automatiques
- [ ] Incidents : signalement avec photos, notification au propriétaire, suivi des statuts
- [ ] Tableau de bord propriétaire, accueil locataire
- [ ] Tests de bout en bout du parcours paiement (bac à sable de l'agrégateur)

**Terminé quand :** 5 à 10 propriétaires pilotes (famille et proches) encaissent au moins 2 loyers réels via Keyo, et chaque paiement est rapproché sans intervention manuelle.

### Phase 2 : Gestion complète (mois 3 à 5)
- [ ] Finances et rentabilité, export comptable
- [ ] Assistant IA (API Claude, limité aux données du propriétaire, avec sources affichées)
- [ ] Rapport mensuel automatique
- [ ] Artisans : demande de devis, comparaison, validation, paiement
- [ ] Entretien préventif
- [ ] Carte Mapbox 2D, puis 3D avec les statuts sur chaque bien
- [ ] Rôle de gérant terrain
- [ ] Multi-devises complet (EUR, CAD, USD) et conversion à l'affichage
- [ ] Ouverture du marché France (Stripe, quittances conformes)

### Phase 2 bis : Agent autonome (en cours)
L'agent Keyo agit à la place du propriétaire, dans les limites qu'il fixe. Code : `packages/shared/src/autonomy.ts` (catalogue, niveaux, décision) et `apps/api/src/autonomous/`.
- [x] Catalogue des actions autonomes et niveaux par action : Jamais / Me demander / Faire et me prévenir / Faire seul, avec un plafond par action
- [x] Décision par le code, jamais par le modèle (`decideAutonomy`) : interrupteur général, plafond de dépense par devise, heures calmes pour les messages aux tiers
- [x] Règles fixes : jamais déplacer d'argent, signer, résilier un contrat ni engager une procédure (hors catalogue)
- [x] Orchestration multi-agents : un Gérant qui délègue à cinq spécialistes (Encaissement, Relocation, Entretien, Conformité, Finances), chacun limité à ses outils
- [x] Mode sans clé : règles fixes (relances, liens de paiement, quittances, qualification d'incident, rapport) passant par le même contrôle
- [x] Journal « Ce que Keyo a fait », demandes d'accord, annulation, idempotence (pas de double relance)
- [x] Déclencheurs : chaque jour, chaque semaine, chaque mois (BullMQ + Redis, ou minuterie sans Redis) et événements (paiement reçu, incident signalé, logement libéré)
- [x] Connecteurs : interface commune, pilote WhatsApp Business (API Cloud de Meta), pilotes simulés pour les autres canaux
- [ ] PostgreSQL + Prisma à la place du stockage en mémoire (même interface `AgentStore`)
- [ ] Connexion téléphone + code SMS (remplace l'en-tête provisoire `x-keyo-owner`)
- [ ] App : envoi des données au serveur, application des modifications, écrans Autonomie, Connexions, Ce que Keyo a fait, Accords en attente
- [ ] Connecteurs réels : SMS (fournisseur local), e-mail, agrégateur de paiement (liens et webhooks), agenda, sites d'annonces, signature électronique
- [ ] Actions suivantes : révision de loyer, état des lieux, restitution du dépôt, déclaration fiscale préparée, rapprochement bancaire en lecture seule

### Phase 3 : Passeport locataire (mois 5 à 7)
> **Avant de coder :** rencontrer 2 ou 3 microfinances ou banques à Abidjan pour valider ce qu'elles acceptent comme preuve. Leur réponse définit le format.
- [ ] Score Keyo (ponctualité, ancienneté, régularité), calculé **uniquement sur les paiements passés par Keyo**
- [ ] Historique certifié et badges, **sans valeur monétaire** (pas de devise interne : ce serait de la monnaie électronique, soumise à agrément)
- [ ] Partage avec consentement explicite, durée limitée, révocation, journal des accès
- [ ] Attestation PDF signée + QR code + page publique de vérification
- [ ] Procédure de contestation d'un retard
- [ ] Revue de conformité : ARTCI (Côte d'Ivoire), RGPD (France)

### Phase 4 : Multi-actifs (mois 7 à 12)
**Objectif :** Keyo devient l'app de gestion de **tous** les biens à distance, pas seulement de l'immobilier.

| Type d'actif | Exploitant | Revenus suivis | Dépenses suivies | Événements spécifiques |
| --- | --- | --- | --- | --- |
| **Plantation** (cacao, hévéa, anacarde, palmier) | Gérant de plantation | Ventes de récolte (kg × prix) | Intrants, main-d'œuvre, transport | Récolte, traitement, visite, vol, sinistre |
| **Ferme / élevage** (volaille, porcs, poissons) | Gérant de ferme | Ventes d'animaux et de produits | Aliments, soins vétérinaires, salaires | Naissances, mortalité, vaccinations |
| **Véhicule** (taxi, VTC, minibus) | Chauffeur | Versement journalier ou hebdomadaire | Carburant, entretien, assurance | Panne, accident, contrôle technique |
| **Commerce / boutique** | Gérant | Recettes déclarées | Stock, loyer, salaires | Inventaire, fermeture |

Fonctionnalités clés :
- [ ] **Parcelles cartographiées** : polygone GPS dessiné sur la carte, surface calculée
- [ ] **Rapports terrain géolocalisés et horodatés** : photo prise dans l'app, position vérifiée, pour limiter les fraudes
- [ ] **Échéanciers adaptés** : versement journalier (véhicule), par campagne (plantation), par lot (ferme)
- [ ] **Prix du marché** (cacao, anacarde…) pour comparer avec les ventes déclarées
- [ ] **Alertes** : météo pour les plantations, échéances d'assurance ou de contrôle technique pour les véhicules
- [ ] L'assistant IA et les rapports mensuels fonctionnent pour tous les types
- [ ] Le Passeport peut s'étendre aux exploitants (historique de versements → crédit agricole)

### Phase 5 : Écosystème (an 2)
- [ ] Espace agences, en marque blanche
- [ ] **DK Diaspora** : pot familial, paiement direct des factures au pays
- [ ] **DK Scoring** : score de crédit à partir des données de Keyo, vendu aux institutions financières
- [ ] Marketplace d'artisans et de services (assurance, gestion, travaux)

---

## 5. Modèle économique (rappel)
| Offre | Cible | Prix indicatif |
| --- | --- | --- |
| Gratuit | 1 bien, fonctions de base | 0 |
| Propriétaire | 2 à 10 biens, IA, relances, rapports | ~5 000 FCFA ou 8 € par bien et par mois |
| Diaspora Premium | Tout + gérant terrain + suivi des travaux | ~15 à 25 € par mois |
| Agence | Back-office, biens illimités | Sur devis |
| Passeport | Attestation premium (locataire) ou consultation (banque) | À définir avec les partenaires |

Revenus additionnels : petite commission sur les paiements, commission sur les interventions d'artisans.

---

## 6. Conformité et sécurité (à traiter tôt)
- **Paiements** : passer exclusivement par des agrégateurs agréés (BCEAO en UEMOA, ACPR en France). Pas de solde ni de « porte-monnaie » Keyo.
- **Données personnelles** : déclaration auprès de l'ARTCI (Côte d'Ivoire), conformité RGPD (France), hébergement et transferts de données documentés.
- **Données sensibles** : pièces d'identité et documents chiffrés au repos, accès journalisés.
- **Baux et mises en demeure** : modèles validés par un juriste dans chaque pays.
- **Licence commerciale** des contenus générés (voix off, visuels) pour le marketing.

> Ce document n'est pas un avis juridique : faire valider chaque point par un professionnel.

---

## 7. Indicateurs de réussite
| Phase | Indicateur |
| --- | --- |
| MVP | % de loyers payés via Keyo, délai moyen de paiement, nombre de relances avant paiement |
| Adoption | % de locataires qui installent l'app (et pas seulement le lien SMS) |
| Rétention | Propriétaires actifs après 3 mois, nombre de biens par propriétaire |
| Passeport | Attestations générées, partages avec une institution, demandes de crédit acceptées |
| Multi-actifs | Actifs non immobiliers créés, rapports terrain envoyés chaque mois |

---

## 8. Méthode de travail avec Claude Code

### `CLAUDE.md` à créer à la racine (extrait conseillé)
```md
# Keyo
App mobile de gestion d'actifs à distance (immobilier d'abord), éditée par DK Group.
Feuille de route complète : docs/ROADMAP.md (à lire avant toute nouvelle fonctionnalité).

## Règles
- TypeScript strict partout. Schémas Zod partagés dans packages/shared.
- Montants en entiers + code devise. Jamais de float pour l'argent.
- Un paiement n'est "payé" qu'après confirmation par webhook de l'opérateur.
- Ne jamais coder "loyer"/"locataire" en dur dans le cœur : Asset, Agreement, Party, Schedule, Transaction.
- UI : tokens de packages/tokens uniquement, aucune couleur en dur. Texte sur mint = night.
- Textes de l'interface en français, vouvoiement, sans emoji.
- Chaque fonctionnalité : tests unitaires (API) + test du parcours principal.
```

### Façon de travailler, phase par phase
1. Une branche par fonctionnalité et une pull request relue avant fusion.
2. Pour chaque fonctionnalité, demander d'abord à Claude Code **un plan** (fichiers touchés, modèle de données, endpoints), le valider, puis lancer l'implémentation.
3. Toujours terminer par : tests verts, typecheck vert, et une démo sur un vrai téléphone Android.

### Premiers prompts suggérés
1. *« Lis docs/ROADMAP.md. Mets en place le monorepo de la Phase 0 (pnpm, Turborepo, apps/mobile Expo, apps/api NestJS, packages/shared, packages/tokens) avec la CI. Propose-moi d'abord le plan. »*
2. *« Implémente le modèle de données générique de la section 2 avec Prisma, avec l'immobilier comme premier type d'actif et un schéma Zod par type pour `details`. »*
3. *« Implémente l'authentification par téléphone et OTP, avec les rôles propriétaire et locataire. »*
4. *« Génère packages/tokens à partir de la charte Keyo, puis l'écran de démarrage et l'accueil propriétaire vide, conformes aux maquettes. »*
