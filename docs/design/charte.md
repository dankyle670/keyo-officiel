# Keyo, charte de marque

Keyo est l'application de gestion locative de DK Group. Elle permet aux propriétaires, en France, en Côte d'Ivoire ou dans la diaspora, de gérer leurs biens à distance : loyers encaissés, locataires, incidents, travaux et rentabilité. Les locataires paient, signalent un problème et retrouvent leurs documents depuis leur propre app.

**Promesse :** « Vos biens, gérés d'ici. »

## Personnalité

Keyo est **moderne et rassurant**, comme une néobanque. On y parle d'argent et de chez-soi : chaque écran doit inspirer confiance avant d'impressionner.

- **Clair** : un chiffre, un statut, une action. Pas de jargon immobilier ou juridique sans explication.
- **Calme** : les mauvaises nouvelles (retard, impayé, panne) sont dites franchement, sans alarmisme, avec la prochaine étape.
- **Proche** : on vouvoie, avec des phrases courtes et chaleureuses. Pas de point d'exclamation en série, pas d'emoji dans l'interface.

## Ton : exemples

| Situation | ✅ Keyo | ❌ À éviter |
| --- | --- | --- |
| Loyer reçu | « Loyer de novembre reçu. 150 000 FCFA, de Awa K. » | « Super !!! Paiement OK 🎉 » |
| Retard | « Le loyer de l'appartement Cocody a 5 jours de retard. Nous avons relancé le locataire ce matin. » | « ALERTE : impayé détecté » |
| Incident | « Fuite signalée dans la salle de bain. Urgence moyenne. Voulez-vous demander un devis ? » | « Ticket #4521 créé » |

Le nom s'écrit **Keyo** dans le texte, **keyo** dans le logo.

## Couleurs

Les valeurs exactes sont dans `tokens.json`. Deux couleurs portent la marque : **night** (`#0B1B33`), le bleu nuit de la confiance, et **mint** (`#2ED47A`), le vert de l'argent qui rentre et de l'action.

| Token | Valeur | Usage |
| --- | --- | --- |
| `night` | #0B1B33 | Marque, écrans forts, texte principal |
| `night-soft` | #1B2D4F | Cartes et motifs sur fond `night` |
| `mint` | #2ED47A | Bouton principal, argent reçu, onglet actif |
| `mint-deep` | #0B7A4B | Texte et icônes « payé » sur fond clair |
| `mint-tint` | #DDF7EA | Fonds de confirmation |
| `amber` / `amber-tint` | #B54708 / #FEF0C7 | En retard |
| `danger` / `danger-tint` | #C4320A / #FEE4E2 | Impayé, urgent |
| `sky` | #2F5BEA | Liens, information |

- **Bouton principal** : fond `mint`, texte `night`, **jamais blanc sur mint**. Un seul bouton principal par écran.
- Un statut porte toujours un mot : la couleur seule ne suffit jamais.

## Typographie

Une seule famille : **Plus Jakarta Sans** (Google Fonts), avec Inter puis la police système en secours. Titres en 800 avec un léger resserrement (-0,025 em), montants en chiffres tabulaires, la devise plus petite et en gris (« 450 000 FCFA »).

## Iconographie

Icônes au trait de type Lucide, 24 px, trait de 1,8 px, coins arrondis. Elles reprennent la couleur du texte voisin, ou se placent dans un cercle teinté.

## Logo

Le symbole est une **serrure** menthe dans un carré bleu nuit arrondi : la clé du chez-soi, et l'accès sécurisé à ses biens. Fichiers dans `logos/`.

## Signature DK Group

Keyo est un produit de **DK Group**. La signature apparaît sur l'écran de démarrage, à la fin des vidéos, sur le site et dans les documents commerciaux, jamais dans les écrans de travail de l'app.

- **Signature discrète, sur une ligne** : « UN PRODUIT » (petites capitales espacées) suivi du **symbole DK seul**, à 70 % d'opacité, en bas et centré.
- Le symbole DK reste **monochrome** : blanc sur `night`, encre `#111121` sur fond clair. Jamais recoloré.
- Largeur minimale de 40 px pour le symbole seul. Le logo complet DK + GROUP (100 px minimum) est réservé aux documents commerciaux.

## Style des maquettes (refonte du 18 novembre 2026)

Les maquettes de `ecrans/` appliquent ces règles.

- **Une tâche par écran.** Un grand chiffre ou un grand titre, puis peu d'éléments. On préfère une liste aérée à une grille de cartes.
- **Statuts** : un point de couleur de 7 px suivi d'un mot, en petit texte gras (« ● 5 jours de retard »).
- **Listes** : des lignes d'environ 72 px (icône ronde de 40 à 44 px, titre, sous-titre, valeur à droite), séparées par un filet `line`, sans carte autour quand le fond est clair.
- **Rayons** : boutons et champs en pilule (999 px), cartes à 26–32 px, icônes dans des cercles.
- **Boutons** : 56 px de haut, en pilule. Principal : `mint` avec texte `night`. Secondaire : `night` avec texte blanc, ou fond clair `#E9EFF5`.
- **Navigation** : sur iPhone, une barre flottante `night` en pilule, l'onglet actif en `mint` avec son libellé. Sur Android, une barre Material 3 blanche, l'onglet actif dans une pastille `mint-tint`.
- **Motif de marque** : la silhouette de serrure du logo, en grand et en `night-soft`, en fond des écrans forts (solde, accueil locataire, passeport), toujours derrière le texte.
- **Accueil propriétaire** : une carte 3D de tous les biens. Les biens sans souci sont un point vert ; les autres portent une étiquette (« 1 retard », « 1 incident »). Le montant encaissé du mois est en haut, la liste « À traiter » en bas.
- Fond des écrans : `#F3F6F9`. Texte secondaire : `#5A6A80`.
