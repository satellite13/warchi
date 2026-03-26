# Vue d’ensemble du système

**wArchi** est une application web pour gérer des modèles d’architecture, des notations et des types. Elle couvre tout le flux : définition des types et règles de relation, diagrammes, versionnement et accès collaboratif.

## Fonctionnalités principales

- **Modèles** — création et édition de modèles d’architecture avec versions
- **Notations** — configuration visuelle des composants et relations (formes, styles, comportement)
- **Diagrammes** — éditeur graphique avec navigation, auto-disposition, export PNG/SVG et vue JSON
- **Synchro live du modèle** — synchronisation multi-utilisateurs via WebSocket avec repli sur le polling
- **Lignes de base de diagramme** — nouvelle version de diagramme à partir de l’état actuel et bascule entre versions
- **Comparaison de versions** — comparaison visuelle des versions de modèle et de diagramme avec surlignage et tableau de propriétés
- **Types** — types de nœuds et de liens avec propriétés personnalisées et système
- **Propriétés personnalisées** — `string`, `number`, `boolean`, `enum` avec valeurs par défaut et validation
- **Partage** — ACL sur modèles, notations et types avec niveaux `VIEW` / `EDIT`

## Structure de l’application

L’application comporte plusieurs sections accessibles depuis le menu :

| Section | Description |
|---------|-------------|
| Accueil | Tableau de bord : statistiques, activité récente, actions rapides, version courante |
| Modèles | Liste, éditeur, diagrammes et flux de versions de diagramme |
| Notations | Liste, éditeur visuel des composants/relations et règles de relation |
| Types | Éditeur des types de nœuds/liens (`icon`, `defaultDirectoryPath`, propriétés) |
| Formes | Catalogue de contours personnalisés avec éditeur visuel |
| Documentation | Aide produit |
| Wiki | Pages liées aux entités (modèle, notation, type, forme) |

## Section Documentation

Pages ciblées :

- **Vue d’ensemble** — panorama des capacités et flux ;
- **Modèles** — structure, versionnement, opérations courantes ;
- **Notations** — composants, relations, styles, règles ;
- **Diagrammes** — édition, navigation, export, lignes de base ;
- **Comparaison de versions** — comparaison modèle et diagramme ;
- **Types** — champs système/personnalisés et attributs ;
- **Formes** — contours personnalisés réutilisables ;
- **Raccourcis** — raccourcis clavier ;
- **FAQ** — questions fréquentes ;
- **Journal des modifications** — nouveautés récentes.

## Section Wiki

Le `Wiki` complète l’aide statique par de la documentation attachée aux entités : conventions métier, consignes d’équipe, notes contextuelles.

Détails de comparaison :

- comparaison de modèles — [Modèles](/docs/models) ;
- comparaison de diagrammes — [Diagrammes](/docs/diagrams).

## Droits et partage

Rôles et ACL :

- **ADMIN** — accès complet.
- **USER** — ressources personnelles et partagées.
- Partage des entités de premier niveau : **VIEW** (lecture) et **EDIT** (édition).

Les cartes et listes affichent le niveau d’accès effectif.

## Premiers pas

1. Connexion
2. Page d’accueil : aperçu des modèles et notations
3. **Types** : créer types de nœuds/liens et propriétés si besoin
4. **Notation** : composants et relations à partir des types, styles et règles
5. **Modèle** : choisir une notation, construire un diagramme depuis la palette
6. Avant une refonte importante : créer une **ligne de base** pour garder une version de référence
