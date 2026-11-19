# Keyo, maquettes et charte (pour le développement)

Ce dossier contient tout le design de Keyo, lisible directement par Claude Code. À placer dans le dépôt sous `docs/design/`.

| Dossier ou fichier | Contenu |
| --- | --- |
| `charte.md` | Charte de marque : ton, couleurs, typo, logo, signature DK Group, règles de style des maquettes |
| `tokens.json` | Valeurs exactes : couleurs, typographie, espacements, rayons. Source pour `packages/tokens` |
| `logos/` | Logo Keyo (symbole, versions claire et sombre) et logo DK Group (versions blanche et encre) |
| `ecrans/png/` | Les 21 écrans en image (×2), pour voir le rendu attendu |
| `ecrans/html/` | Les 21 écrans en HTML, pour lire les valeurs exactes (tailles, couleurs, espacements, textes) |

**Comment s'en servir :** pour chaque écran à développer, ouvrir le PNG pour le rendu et le HTML pour les valeurs. Le HTML est une maquette statique, pas du code de production : il faut le traduire en composants React Native avec les tokens de `packages/tokens`.

Les données affichées (noms, montants, adresses, banques « partenaires ») sont des exemples fictifs.

## Les écrans

### App Propriétaire, iPhone (390 × 844)
| Fichier | Écran | Rôle |
| --- | --- | --- |
| `01-Splash` | Démarrage | Logo Keyo, signature DK Group discrète |
| `02-Main` | Accueil | Carte 3D de tous les biens, montant encaissé, liste « À traiter » |
| `03-ProBien` | Détail d'un bien | Vue 3D du bâtiment, loyer, rentabilité, locataire, incidents, documents, finances |
| `04-ProLoyers` | Loyers | Barre de progression du mois, en retard, reçus, à venir |
| `05-ProIncidents` | Incidents | En cours et résolus |
| `06-ProIncident` | Incident | Photo, analyse IA, choix d'un devis, validation |
| `07-ProAssistant` | Assistant IA | Question en langage naturel, réponse chiffrée avec graphique, suggestions |
| `08-ProAjout` | Ajouter un bien | Étape 1 sur 3 : type de bien (Plantation et Ferme « Bientôt »), nom |

### App Propriétaire, Android (412 × 915)
| Fichier | Écran | Rôle |
| --- | --- | --- |
| `09-AndroidAccueil` | Accueil | Même carte que sur iPhone, navigation Material 3 |
| `10-AndroidBiens` | Mes biens | Cartes de biens avec statut et loyer, bouton d'ajout |

### App Locataire, Android (412 × 915)
| Fichier | Écran | Rôle |
| --- | --- | --- |
| `11-AndroidLocataire` | Accueil | Prochain loyer et bouton « Payer », raccourcis, prochaine intervention |
| `12-LocPaiements` | Paiements | Prochain loyer, historique, quittances à télécharger |
| `13-AndroidPaiement` | Payer le loyer | Montant, choix Wave / Orange Money / MTN MoMo / carte, numéro |
| `14-LocDemandes` | Mes demandes | Suivi étape par étape d'une réparation, demandes résolues |
| `15-AndroidSignaler` | Signaler un problème | Catégorie, description, photos |
| `16-LocDocuments` | Documents | Bail, état des lieux, quittances |
| `17-LocMessages` | Messages | Conversation avec le propriétaire |

### Passeport locataire, Android (412 × 915)
| Fichier | Écran | Rôle |
| --- | --- | --- |
| `18-PasseportScore` | Score | Jauge du score Keyo, critères, partage avec une banque |
| `19-PasseportHistorique` | Historique | Mois payés à l'heure, détail des paiements |
| `20-PasseportPartage` | Partage | Choix de l'établissement, contenu partagé, durée d'accès |
| `21-PasseportAttestation` | Attestation | Document vérifiable avec QR code, téléchargement PDF |

## Navigation
- **Propriétaire** : Accueil (carte) · Biens · Loyers · Incidents · Assistant
- **Locataire** : Accueil · Paiements · Passeport · Demandes (Documents et Messages s'ouvrent depuis l'accueil)

## Versions en ligne
Les originaux modifiables restent sur Claude (accès réservé au compte de Daniel) :
- Maquettes : https://claude.ai/artifact/Vs3gjzTzNNKAGPrG1EWSmN
- Charte Keyo : https://claude.ai/artifact/LGpzSBmxxjeWaeeW6V9QRQ

En cas de mise à jour des maquettes, régénérer ce dossier pour que Claude Code voie la dernière version.
