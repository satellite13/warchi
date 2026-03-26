# Formes

La section **Formes** sert à gérer les contours personnalisés des nœuds, réutilisables ensuite dans les notations comme **forme personnalisée**.

## À quoi servent les formes

- créer des contours de marque ou métier absents des formes intégrées ;
- réutiliser le même contour dans plusieurs notations ;
- mettre à jour un contour centralement au lieu de modifier chaque notation à la main.

## Structure de la page

La page comporte deux zones principales :

- **Panneau gauche** — liste des formes, recherche et bouton de création ;
- **Panneau droit** — éditeur de la forme sélectionnée.

## Champs d’une forme

Chaque forme a deux champs clés :

- **Nom** — affiché dans les listes et dans le choix de forme de la notation ;
- **Contour** — géométrie éditée visuellement.

## Édition du contour

L’éditeur de contour permet :

- déplacer un point pour modifier le contour ;
- double-cliquer sur un côté pour ajouter un point ;
- double-cliquer sur un point pour le supprimer (minimum 3 points) ;
- zoom : `+`, `-` et réinitialisation `1:1`.

## Création et suppression

### Créer une forme

1. Cliquez sur **Ajouter une forme**.
2. Une nouvelle forme est créée avec un rectangle de base.
3. Modifiez le nom et le contour.
4. Cliquez sur **Enregistrer**.

### Supprimer une forme

1. Sélectionnez une forme.
2. Cliquez sur **Supprimer**.
3. Confirmez dans la boîte de dialogue.

## Contrôle d’accès

- Sans droit d’édition, la forme s’ouvre en lecture seule.
- En lecture seule, les champs sont désactivés et enregistrer/supprimer ne sont pas disponibles.

## Utilisation dans une notation

Après enregistrement, la forme est disponible dans les paramètres de style du composant :

1. Ouvrez l’éditeur de notation.
2. Sélectionnez un composant.
3. Dans les paramètres de forme, choisissez le type **Forme personnalisée**.
4. Sélectionnez la forme souhaitée dans la liste.
