# Types de nœuds et de liens

Les types sont des entités globales qui définissent la structure des éléments des modèles d’architecture. Un type précise le **nom** d’un élément et un ensemble de **propriétés personnalisées**. Le style visuel (forme, couleur, icône) se configure séparément dans les composants de notation liés au type.

La gestion des types se fait dans la section **Types** du menu de navigation.

## Types de nœuds

Les types de nœuds décrivent les composants d’architecture — services, modules, bases de données, interfaces, etc.

Un type de nœud définit la **sémantique du composant** (ce que représente l’entité), tandis que l’apparence (forme, couleur, icône, libellés) se configure dans la notation via un élément composant.

### Propriétés d’un type de nœud

| Propriété | Description |
|-----------|-------------|
| Nom | Nom unique du type |
| Icône (`icon`) | Icône SVG du type. Utilisée dans la palette / les listes pour une identification visuelle rapide |
| Chemin de dossier par défaut (`defaultDirectoryPath`) | Chemin de dossier suggéré par défaut pour placer / structurer les instances de ce type |

### Créer un type de nœud

1. Ouvrez la section **Types**
2. Dans le panneau des types de nœuds, cliquez sur **Ajouter**
3. Saisissez le nom du type
4. (Facultatif) choisissez une icône
5. (Facultatif) définissez le chemin de dossier par défaut
6. Enregistrez

### Où le type de nœud est utilisé

Après création, un type de nœud sert en général à deux endroits :

1. **Dans la notation** — créer un composant lié au type de nœud, puis définir style et comportement sur le diagramme.
2. **Dans les modèles** — les utilisateurs créent des instances de ce type et remplissent les propriétés personnalisées.

En outre :

- `icon` facilite la recherche des types dans les palettes et listes ;
- `defaultDirectoryPath` propose une structure par défaut pour les nouvelles instances.

Sans lien avec un composant de notation, le type ne peut pas être pleinement utilisé sur les diagrammes.

### Supprimer un type de nœud

Suppression via le menu contextuel ou le bouton supprimer. Avant de supprimer, vérifiez qu’il n’est pas utilisé dans les notations et modèles.

### Mettre à jour un type de nœud

- Le renommage affecte tous les usages (notations, modèles, règles de relation).
- L’ajout de propriétés obligatoires peut impacter les instances existantes (notamment les champs requis).

## Types de liens

Les types de liens décrivent les relations entre composants — dépendances, flux de données, héritage, etc.

Un type de lien définit la **sémantique de la relation** ; l’apparence se configure dans la notation via un composant relation (style de ligne, marqueurs, libellés, couleurs).

### Propriétés d’un type de lien

| Propriété | Description |
|-----------|-------------|
| Nom | Nom unique du type de lien |

> Dans les projets avec regroupement, la propriété système `group` (`boolean`) est souvent ajoutée pour marquer une relation de regroupement. Cela influence l’éditeur de diagrammes (auto-liens dans les groupes, masquage des liens structurels dans les conteneurs).

### Créer un type de lien

1. Ouvrez la section **Types**
2. Dans le panneau des types de liens, cliquez sur **Ajouter**
3. Saisissez le nom
4. Enregistrez

### Où le type de lien est utilisé

Après création, un type de lien se configure en général à deux endroits :

1. **Dans la notation** — composant relation lié à ce type et style visuel.
2. **Dans les règles de relation** — contraintes source / cible : quels types de composants peuvent être reliés.

Sans règles de relation dans la notation, la liaison interactive sur les diagrammes peut être indisponible.

### Mise à jour et suppression d’un type de lien

- Le renommage affecte tous les usages (notations, règles, modèles).
- Avant suppression, vérifiez qu’il n’est pas utilisé dans les notations et modèles existants.

## Propriétés personnalisées

Les types de nœuds et de liens peuvent avoir des propriétés personnalisées, disponibles à l’édition des instances dans le modèle.

Pour les **types de nœuds**, les valeurs s’éditent dans le modèle sous **Propriétés du type de nœud** (une valeur par nœud pour tout le modèle). Dans le **modèle de libellé** du diagramme, ces champs utilisent **`#{nomPropriété}`** ; les champs **composant notation** utilisent **`${nomPropriété}`** (voir [Notations](/docs/notations) et [Modèles](/docs/models)).

Types pris en charge :

- **Texte** — chaîne
- **Nombre** — valeur numérique
- **Enum** — choix dans une liste prédéfinie

Pour chaque propriété vous pouvez indiquer :

- nom ;
- type de données ;
- valeur par défaut ;
- obligatoire / facultatif ;
- indicateur système (**Sys.**) pour un comportement spécifique à l’éditeur.

> En ajoutant une propriété obligatoire avec valeur par défaut, les instances existantes recevront la valeur par défaut à la prochaine ouverture du modèle.

Les propriétés système servent à la logique spéciale de l’éditeur. Exemple courant : `group` (`boolean`), utilisé pour le regroupement de composants et les flux de relation de regroupement.

## Règles de relation

Les règles de relation définissent quels types de nœuds peuvent être reliés par quels types de liens, pour garantir la cohérence des modèles.

### Configuration

Pour chaque règle :

- **Relation** — type de lien concerné ;
- **Source** — type de composant source autorisé ;
- **Cible** — type de composant cible autorisé.

## Types et notations

Les types sont globaux et disponibles dans toutes les notations. Dans l’éditeur de notation, ils servent à créer des **composants** et des **relations** de notation. Un composant notation est lié à un type et ajoute le style visuel : forme, couleur, icône, style de ligne et autres paramètres d’affichage sur le diagramme.
