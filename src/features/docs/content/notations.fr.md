# Notations

Une notation définit la représentation visuelle et les règles des diagrammes d’architecture. Elle précise quels types d’éléments sont disponibles et comment ils s’affichent.

## Liste des notations

La page **Notations** affiche toutes les notations, regroupées par nom. Chaque notation peut avoir plusieurs versions.

### Créer une notation

1. Cliquez sur **Créer** dans l’en-tête de la liste
2. Saisissez le nom de la notation
3. Confirmez avec **Créer**

### Partager une notation

Le partage se fait via **Partager** :

- **VIEW** — consulter la notation ;
- **EDIT** — modifier composants, relations et règles de liaison.

Pour les ressources partagées, les actions disponibles dépendent du niveau d’autorisation.

### Importer une notation

Import possible depuis un fichier JSON contenant la notation complète avec types et styles.

## Éditeur de notation

Outil visuel pour configurer l’apparence et le comportement des éléments de notation.

### Éléments d’une notation

- **Types de nœuds** — gabarits visuels des composants (rectangles, cercles, etc.)
- **Types de liens** — gabarits des connexions (flèches, lignes)
- **Règles de relation** — quels types d’éléments peuvent être reliés

### Configuration du style

Pour chaque type de nœud :

- Forme (rectangle, ellipse, losange, etc.)
- Couleurs de remplissage et de contour
- Police et couleur du texte
- Dimensions par défaut
- Icône

Pour les types de liens :

- Type de ligne (plein, tirets, pointillés)
- Style de flèche (ouvert, fermé, losange, etc.)
- Couleur et épaisseur

### Formes de nœud

Dans les paramètres de style du composant :

- **Rectangle**
- **Rectangle biseauté**
- **Losange**
- **Cercle**
- **Trapèze**
- **Parallélogramme**
- **Forme personnalisée**

Conseils :

- rectangle pour services / modules centraux ;
- losange et trapèze pour sémantiques particulières (conditions, passerelles, agrégateurs) ;
- cercle pour nœuds compacts type rôle / événement ;
- forme personnalisée lorsque les options intégrées ne suffisent pas.

Notes :

- le rayon de coin (`R`) s’applique aux formes rectangulaires qui le supportent ;
- après changement de forme, revoir les marges de contenu (`T/R/B/L`) et la position du libellé.

#### Libellés de champs courts

Pour un panneau compact, des abréviations sont utilisées :

- `W/H/R` — largeur, hauteur, rayon ;
- `PT/PB/PL/PR` — ports haut / bas / gauche / droite ;
- `T/R/B/L` — marges haut / droite / bas / gauche.

Le survol affiche l’explication complète.
Les boutons de synchronisation des marges **Paire** / **Tout** suivent la langue de l’interface.

### Propriétés personnalisées

Les types de nœuds et de liens peuvent avoir des propriétés personnalisées disponibles dans l’éditeur de modèle : texte, nombre, enum, etc.

À la création, une propriété peut être marquée **système** — pour un comportement spécial dans l’éditeur.

### Propriété système `group`

La propriété système `group` (`boolean`) active un **comportement de regroupement** piloté par la sémantique des relations.

#### Utilité

`group` modélise les relations conteneur (ex. « service appartient au sous-système ») visuellement et au niveau comportement :

- les éléments imbriqués peuvent se déplacer avec le conteneur ;
- les liens de regroupement peuvent être masqués pour alléger le diagramme ;
- au dépôt dans un conteneur, l’éditeur aide à créer / réutiliser la bonne relation.

#### Pour les composants

Si un type de composant a `group=true` :

- le déplacement du composant déplace aussi ceux entièrement à l’intérieur de ses limites ;
- il participe aux flux d’auto-regroupement au dépôt.

#### Pour les liens

Si un type de lien a `group=true`, il est traité comme relation de regroupement :

- lorsque la cible est entièrement dans la source, le lien peut être masqué (la relation structurelle reste, le bruit visuel diminue) ;
- au dépôt d’un composant dans un autre, si une relation `group=true` est autorisée, l’éditeur propose de réutiliser ou de créer un lien ;
- si plusieurs types de relation sont possibles, un choix s’affiche.

#### Configuration

1. Créez une propriété nommée `group`.
2. Type `boolean`.
3. Souvent valeur par défaut `true` si le type participe toujours au regroupement.
4. Cochez **Sys.** (système).
5. Appliquez aux types voulus :
   - **composants** — comportement conteneur ;
   - **liens** — relation de regroupement.

### Propriétés interactives sur le diagramme

Pour les propriétés **composant**, l’option **« Interactif sur le diagramme »** affiche sur le nœud un petit bouton-icône en haut à gauche lorsque la propriété a une valeur ; le clic déclenche une action selon le type. Pour toute propriété interactive (URL, Diagramme, Document), le type de propriété doit être **« string »** ; au choix du type d’action, le type est ajusté automatiquement si besoin.

#### Types d’action et valeurs

| Type d’action | Valeur à saisir | Exemple | Effet au clic |
|---------------|-----------------|--------|----------------|
| **URL** | Adresse web | `https://wiki.example.com/ServiceA` | Ouvre un nouvel onglet |
| **Diagramme** | ID du diagramme (UUID) dans le modèle courant | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | Bascule vers ce diagramme (sélection dans l’arbre) |
| **Document** | ID du fichier (UUID) | `f0e1d2c3-b4a5-9876-5432-10fedcba0987` | Ouvre la visionneuse / l’éditeur du fichier |

#### Saisie dans l’éditeur de modèle

Pour **Diagramme** et **Document**, une liste déroulante remplace la saisie manuelle d’UUID : choix par nom et version, ou document déjà attaché au modèle. Pour **Document**, un bouton **« Nouveau document »** crée un fichier vide et renseigne l’ID. Pour **URL**, champ texte ; dans l’éditeur de notation, le champ « Regex » de la propriété peut valider le format (modèle suggéré pour le type URL).

#### Obtenir les ID manuellement

- **Diagramme** : chaque diagramme a un UUID. Copie possible au glisser-déposer (`diagram:<uuid>` — utiliser la partie après `diagram:`), ou depuis export / API.
- **Document** : ID renvoyé à l’attachement ou à la sélection du fichier dans l’éditeur de modèle.

#### Configuration dans l’éditeur de notation

1. Ouvrez le composant et la propriété personnalisée.
2. Activez **« Interactif sur le diagramme »**.
3. Choisissez **type d’action** : URL, Diagramme ou Document.
4. Choisissez l’**icône** (link, open_in_new, description, article, etc.).
5. Enregistrez la notation.

Dans l’éditeur de modèle, une valeur renseignée affiche l’icône ; le clic exécute l’action.

### Modèles de libellé

Pour un composant notation, un **modèle de libellé composite** définit le texte affiché sur le nœud : nom du nœud, champs du **type de nœud** et du **composant notation** ; les valeurs s’éditent dans l’[éditeur de modèle](/docs/models) (panneau des propriétés du nœud).

#### Syntaxe

- `${name}` — **nom du nœud** sur le diagramme (réservé ; pas une propriété personnalisée composant)
- `#{clé}` — valeur d’une propriété personnalisée du **type de nœud** (clé comme dans [Types](/docs/types))
- `${clé}` — valeur d’une propriété personnalisée du **composant** (section propriétés du composant)

**Important :** **`#`** uniquement pour le type de nœud ; **`$`** pour le nom (`name`) ou les champs composant.

Sans modèle, seul le nom du nœud s’affiche.

#### Exemples

| Modèle | Résultat |
|--------|----------|
| `${name}` | nom seul, ex. `API Gateway` |
| `${name} · #{code} · ${status}` | nom, code du type, statut du composant |
| `${name} [${status}]` | nom et propriété composant `status` |
| `${protocol}://${name}:${port}` | si `protocol` et `port` sont des champs **composant** |
| `${name}\n#{description}` | première ligne nom, deuxième ligne description **type** |

#### Sauts de ligne

Utilisez `\n` dans le modèle. Ex. `${name}\n${status}` : nom sur la première ligne, `status` composant sur la deuxième.

#### Où configurer

- **Panneau Style** — champ « Modèle » dans la section « Libellé » avec un composant sélectionné sur le diagramme
- **Panneau Propriétés** — section « Libellé composite » avec aperçu

#### Comportement

- propriété absente du modèle → remplacée par une chaîne vide ;
- double-clic pour renommer → seul le nom du nœud, pas le rendu du modèle ;
- dans l’**éditeur de modèle**, valeurs depuis **Propriétés du type de nœud** et **Propriétés du composant notation** ; sinon défauts des schémas ;
- dans la **prévisualisation** de l’éditeur de notation, défauts de schéma ;
- **Migration :** les valeurs type de nœud s’exprimaient parfois en `${clé}` ; utilisez **`#{clé}`** pour le type et **`${clé}`** uniquement pour le **composant** ;
- les modèles ne s’appliquent qu’aux nœuds (pas aux liens)

### Alignement du libellé

Deux réglages indépendants :

- **Position** — bord de la forme (auto, centre, haut, bas, gauche, droite)
- **Alignement** — alignement des lignes de texte (centre, gauche, droite), utile pour les libellés multilignes.

## Versionnement des notations

Comme les modèles, les notations suivent le versionnement sémantique. Une nouvelle version copie types et styles de la version précédente.
