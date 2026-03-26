# Travail avec les modèles

Les modèles sont les entités centrales de wArchi. Chaque modèle décrit l’architecture d’un système : diagrammes, composants et relations.

## Liste des modèles

La page **Modèles** liste tous les modèles. Ils sont regroupés par nom — chaque groupe peut contenir plusieurs versions.

### Créer un modèle

1. Cliquez sur **Créer** dans l’en-tête de la liste
2. Saisissez le nom du modèle
3. Choisissez la notation utilisée dans le modèle
4. Confirmez avec **Créer**

Un nouveau modèle est créé en version `1.0.0`. La notation définit quels types de composants et de liens sont disponibles dans la palette et sur les diagrammes.

### Renommer un modèle

Le nom peut être modifié dans l’en-tête de l’éditeur — cliquez sur le nom et saisissez le nouveau. Le renommage est aussi possible depuis la carte du modèle dans la liste.

### Partager un modèle

Le propriétaire peut ouvrir l’accès via **Partager** :

- **VIEW** — consultation du modèle et des diagrammes ;
- **EDIT** — édition du modèle et des diagrammes.

La carte affiche le niveau d’accès effectif.

### Versionnement

Versionnement sémantique (SemVer) :

- **Majeure** — changements d’architecture incompatibles
- **Mineure** — ajouts tout en conservant la compatibilité
- **Correctif** — correctifs et petites mises à jour

Vous pouvez créer une nouvelle version à partir d’une version existante.

### Comparaison des versions d’un modèle

Écran dédié de **comparaison visuelle** des versions.

Ouverture :

1. Ouvrez le modèle dans l’éditeur.
2. Cliquez sur **Comparer avec une version** (icône `compare_arrows`) dans l’en-tête.
3. Choisissez les versions gauche et droite.
4. Si besoin, le nom du diagramme à aligner entre les versions.

Lecture du résultat :

- deux diagrammes côte à côte en lecture seule ;
- un côté sert de **base**, l’autre montre les **changements** ;
- **Inverser la base** inverse l’interprétation ;
- clic sur un nœud ou lien → tableau **était / est devenu** en bas ;
- élément absent d’un côté → `—` dans le tableau.

Surlignage des différences :

- **ajouté** ;
- **supprimé** ;
- **modifié**.

La comparaison couvre présence et propriétés des nœuds / liens, y compris les valeurs spécifiques à la notation sur le diagramme.

## Éditeur de modèle

### Arborescence du modèle (panneau gauche)

Structure hiérarchique :

- **Dossiers** — regroupement des composants
- **Composants** — éléments d’architecture (services, modules, bases de données, etc.)
- **Diagrammes** — vues graphiques du modèle

Menu contextuel :

- Créer dossier, composant ou diagramme
- Renommer
- Supprimer

### Palette

Types d’éléments définis par la notation du modèle. Glissez depuis la palette sur le diagramme pour ajouter un composant.

### Panneau des propriétés (panneau droit)

À la sélection d’un élément dans l’arbre ou sur le diagramme : onglets **Propriétés**, **Traçabilité** ; pour un nœud sur le canevas, aussi **Style**.

- Onglet **Style** — apparence de l’**instance** sur le diagramme (couleur, forme, taille), avec restauration depuis la notation.

#### Propriétés personnalisées d’un nœud (onglet Propriétés)

Pour un **nœud**, deux blocs distincts (selon les schémas du catalogue de types et de la notation) :

1. **Propriétés du type de nœud** — schéma défini dans [Types](/docs/types). Valeurs **communes au nœud pour tout le modèle** (tous diagrammes). Badge source **type de nœud** et indice de placeholder de libellé : `#{nomPropriété}`.
2. **Propriétés du composant notation** — schéma défini dans l’[éditeur de notation](/docs/notations). Valeurs **propres au diagramme** (un même nœud peut différer d’un diagramme à l’autre). Placeholder : `${nomPropriété}`. Badge **composant**.

Le nom affiché sur la forme est piloté par le modèle de libellé composite : **`${name}`** est réservé et **n’est pas** une propriété personnalisée composant.

Syntaxe complète : [Notations → Modèles de libellé](/docs/notations).

Pour les **liens**, l’onglet Propriétés reprend les champs du type de lien et de la relation notation (liée à la notation de la même façon).

#### Indices des champs compacts du panneau Style

- `W/H/R` — largeur, hauteur, rayon ;
- `PT/PB/PL/PR` — nombre de ports haut / bas / gauche / droite ;
- `T/R/B/L` — marges.

Survol → infobulle avec le nom complet.
Modes de synchro des marges **Paire** et **Tout**, libellés localisés selon la langue de l’interface.

Les panneaux gauche et droit sont redimensionnables et repliables.

### Diagrammes

Un modèle peut contenir plusieurs diagrammes. Chacun est une vue graphique pouvant montrer tout ou partie des composants. Détails : [Diagrammes](/docs/diagrams).

Pour le diagramme actif, l’action **Infos diagramme** dans la barre d’outils affiche :

- nom et version du diagramme ;
- nom et version de la notation ;
- propriétaire de la notation (si les métadonnées sont disponibles).

## Enregistrement

Le bouton **Enregistrer** s’active s’il y a des changements non sauvegardés. Un indicateur (point) signale l’état. Avant sauvegarde, validation des champs obligatoires, y compris **propriétés du type de nœud** et **propriétés du composant notation** lorsque les schémas s’appliquent.

Lors d’un changement ou d’une fermeture de diagramme avec modifications non enregistrées, une invite propose d’enregistrer, d’abandonner ou de revenir à l’édition.

### Conflit d’enregistrement

Si vous et un autre utilisateur **avez modifié le même nœud, lien ou diagramme** et que le serveur a déjà une version plus récente, un clic sur **Enregistrer** peut **interrompre** la sauvegarde groupée pour éviter d’écraser silencieusement le travail des autres. Un dialogue **Conflit d’enregistrement** s’ouvre :

- En haut, **deux blocs explicatifs** (recharger depuis le serveur vs écraser le serveur).
- En dessous, **liste des entités en conflit** avec horodatages : version de base de votre brouillon, dernière modification serveur.
- **Sur chaque ligne**, développez la comparaison : tableau des **champs où brouillon et serveur diffèrent** (champs principaux et clés de premier niveau dans `attrs`). Les horodatages de base restent dans la légende de la ligne. Les valeurs serveur se chargent par id ; pendant le chargement, le tableau est masqué.
- Tant que le dialogue est ouvert, un **second** dialogue de conflit ne s’ouvre pas automatiquement ; après votre choix et un nouvel **Enregistrer**, le serveur est revérifié — d’autres sauvegardes entre-temps peuvent **rouvrir** le dialogue.

Choix en bas :

- **Recharger depuis le serveur** — **rechargement complet** du modèle depuis l’API. Les **nœuds et liens** en conflict reçoivent les **valeurs serveur** pour tous les champs (y compris attrs) ; les champs déjà alignés restent alignés. Si un **diagramme** est listé : métadonnées et attrs du diagramme (hors canevas) viennent du serveur ; si le bloc **instances** sur le canevas diffère, **votre** copie du canevas est conservée (pas d’édition parallèle du canevas). Puis **Enregistrer** à nouveau.  
  **Remarque :** les modifications non sauvegardées sur **d’autres** objets (hors liste de conflit) sont **perdues** au rechargement complet — sauf l’exception canevas ci-dessus.
- **Écraser le serveur avec mes données** — nouvelle sauvegarde en force ; les changements des autres sur ces objets sont perdus.
- **Annuler** — fermer le dialogue ; le brouillon local reste, la sauvegarde n’est pas terminée tant qu’une stratégie n’est pas choisie.

Les libellés des boutons correspondent aux chaînes de la locale `models` dans l’application.

**Qui peut éditer le canevas** d’un diagramme ouvert est aussi régi par un **verrou d’édition** (un éditeur à la fois) — voir [Diagrammes](/docs/diagrams).

### Synchro live entre utilisateurs

L’éditeur de modèle utilise la synchro live pour les modèles partagés :

- les changements des autres utilisateurs mettent à jour modèle, nœuds, liens et diagrammes ;
- WebSocket avec repli sur le polling périodique ;
- le brouillon local non sauvegardé reste visible dans l’onglet courant ; les enregistrements conflictuels passent par le dialogue de conflit.

## Supprimer un modèle

Utilisez le bouton de suppression dans la liste des modèles. La suppression est irréversible et concerne toutes les données du modèle.
