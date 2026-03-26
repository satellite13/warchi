# Diagrammes

Un diagramme est une représentation graphique d’un modèle d’architecture. Chaque modèle peut contenir un ou plusieurs diagrammes.

## Gestion des diagrammes

### Créer un diagramme

1. Ouvrez le menu contextuel dans l’arborescence du modèle
2. Choisissez **Créer un diagramme**
3. Saisissez le nom et sélectionnez la notation
4. La version est choisie automatiquement — si un diagramme porte déjà ce nom, la version mineure est incrémentée

### Basculer entre diagrammes

Cliquez sur le diagramme souhaité dans l’arborescence. S’il y a des modifications non enregistrées, le système propose :

- **Enregistrer et basculer** — enregistrer puis ouvrir le nouveau diagramme
- **Ne pas enregistrer** — abandonner les changements et basculer
- **Annuler** — rester sur le diagramme courant

### Créer une ligne de base (nouvelle version de diagramme)

Une ligne de base est une nouvelle version du diagramme courant, créée à partir de son état actuel.

Procédure :

1. Ouvrez le diagramme dans l’éditeur de modèle
2. Lancez l’action de création d’une nouvelle version (ligne de base)
3. Confirmez — le système crée la version suivante et l’ouvre

Points importants :

- la ligne de base copie l’ensemble des éléments et la disposition au moment de la création ;
- vous pouvez passer à n’importe quelle version via le sélecteur de version ;
- seule la dernière version est éditable ; les versions précédentes s’ouvrent en lecture seule.

#### Quand créer une ligne de base

Avant des changements pouvant fortement modifier la structure du diagramme :

- avant une auto-disposition de nombreux nœuds ;
- avant des modifications massives de liens ou de styles d’affichage ;
- avant de retravailler le regroupement et la composition de sous-systèmes ;
- avant d’expérimenter une autre vue d’architecture.

Exemple :

1. Le diagramme courant est validé et sert de version de travail.
2. Vous voulez tester une nouvelle disposition (réorganisation en sous-systèmes).
3. Créez une ligne de base.
4. Appliquez les changements dans la nouvelle version.
5. Si le résultat convient, continuez dans cette version ; sinon revenez à la version précédente comme référence stable.

### Comparaison des versions d’un diagramme

Pour le diagramme actif, un écran dédié permet de comparer les versions.

Ouverture :

1. Ouvrez le diagramme dans l’éditeur de modèle.
2. Dans le bloc des versions du diagramme, cliquez sur **Comparer les versions du diagramme** (icône `compare`).
3. Choisissez les versions gauche et droite.

Comportement :

- la comparaison porte sur un même nom de diagramme (ex. `Context` en `1.0.0` et `1.1.0`) ;
- les deux côtés sont rendus en lecture seule ;
- **Inverser la base** permute l’interprétation des changements ;
- un clic sur un élément ouvre en bas un tableau des propriétés **était / est devenu** ;
- le tracé des liens et leurs propriétés sont également comparés.

Utile :

- juste après une ligne de base, pour voir ce qui a réellement changé ;
- avant revue / validation d’une nouvelle version ;
- avant de partager un lien public vers l’image de l’état visuel le plus récent.

### Fermer et supprimer

- **Fermer** — bouton de la barre d’outils. Le diagramme reste dans le modèle mais se ferme dans l’éditeur
- **Supprimer** — menu contextuel dans l’arborescence. Le diagramme sera supprimé à l’enregistrement

## Éditeur de diagrammes

L’éditeur fournit un canevas graphique pour placer et relier les composants du modèle.

### Verrou d’édition

Un seul utilisateur peut **éditer le canevas** d’un diagramme donné à la fois. À l’ouverture, le client demande un verrou ; tant qu’il le détient, les autres utilisateurs autorisés voient en général le diagramme en **lecture seule** (pas de déplacement d’éléments ni d’enregistrement du canevas).

- L’**arborescence du modèle** indique **qui détient le verrou** — vous ou un autre.
- Si vous avez ouvert le diagramme pendant qu’un autre éditait, après libération du verrou vous pouvez utiliser une action du type **Tenter d’éditer** (nouvelle demande de verrou).
- En consultation, si le diagramme **a changé sur le serveur**, on peut vous proposer **Recharger depuis le serveur** pour obtenir l’état à jour.
- Le verrou est **rafraîchi périodiquement** tant que l’éditeur est ouvert ; après une longue inactivité ou une session déconnectée il peut **expirer**, permettant à un autre utilisateur d’éditer.
- Les **administrateurs** peuvent forcer la libération d’un verrou bloqué depuis la zone d’administration.

Les changements ailleurs — **arborescence**, **liens** et autres entités — s’enregistrent toujours avec **Enregistrer** dans l’éditeur de modèle ; les éditions parallèles peuvent provoquer un **conflit d’enregistrement** — voir [Modèles → Enregistrement](/docs/models).

### Ajouter des éléments

Plusieurs possibilités :

1. **Glisser depuis la palette** — faire glisser un type d’élément sur le canevas
2. **Depuis l’arborescence** — glisser un composant existant depuis l’arbre du modèle

### Déplacer et redimensionner

- **Déplacer** — cliquer un élément et le faire glisser
- **Redimensionner** — poignées sur les bords de l’élément sélectionné
- **Sélection multiple** — maintenir `Ctrl` / `Cmd` et cliquer plusieurs éléments
- **Sélection par lasso** — `Ctrl` / `Cmd` + glisser sur une zone vide du canevas

### Relier des éléments

Pour créer un lien :

1. Maintenir `Maj` et cliquer l’élément source
2. Tirer la ligne jusqu’à l’élément cible
3. Relâcher sur le point de connexion de la cible

> Si la notation n’a pas de règles de relation pour les types d’éléments choisis, la connexion est indisponible.

### Navigation sur le canevas

- **Zoom** — molette ou gestes trackpad
- **Panoramique** — glisser sur une zone vide, bouton du milieu, ou `Espace` + glisser
- **Ajuster à l’écran** — bouton de la barre d’outils, met à l’échelle tout le contenu

### Libellé de nœud (modèle composite)

Le texte sur la forme peut être piloté par un **modèle** dans le composant notation : `${name}` pour le nom du nœud, `#{…}` pour les champs du **type de nœud**, `${…}` pour les champs **composant** (sauf `name` réservé). Les valeurs s’éditent dans le **panneau des propriétés** du nœud dans l’[éditeur de modèle](/docs/models). Voir [Modèles](/docs/models) et [Notations → Modèles de libellé](/docs/notations).

## Barre d’outils

### Historique

| Action | Description |
|--------|-------------|
| Annuler | Dernière action (`Ctrl+Z`) |
| Rétablir | Action annulée (`Ctrl+Y`) |

### Zoom et navigation

| Action | Description |
|--------|-------------|
| Zoom avant | Augmente l’échelle |
| Zoom arrière | Diminue l’échelle |
| Ajuster à l’écran | Met à l’échelle tout le contenu |
| Zoom sur la sélection | Cadre la sélection |
| Auto-disposition | Dispose automatiquement les nœuds |
| Réinitialiser le zoom | Échelle et position par défaut |

### Affichage

| Action | Description |
|--------|-------------|
| Grille | Afficher / masquer la grille |
| Mini-carte | Afficher / masquer la mini-carte |
| Magnétisme à la grille | Activer / désactiver l’alignement sur la grille au déplacement |
| Ancrer les liens | Fixe les points de connexion (les liens ne suivent pas le déplacement des nœuds) |

## Paramètres du diagramme

Ils contrôlent le comportement de l’éditeur pour un diagramme donné.

Principaux :

- **Auto-liens dans les groupes** — au dépôt d’un composant dans un conteneur, l’éditeur peut proposer de créer ou réutiliser automatiquement une relation de regroupement ;
- **Magnétisme à la grille** — alignement propre au déplacement ;
- **Grille / mini-carte / règles** — aides visuelles ;
- **Ancrer les liens** — conserve les extrémités des liens lors du déplacement des nœuds.

Recommandations :

- activer le magnétisme pour des mises en page régulières ;
- activer les auto-liens dans les groupes pour de nombreuses relations conteneur ;
- utiliser mini-carte et règles sur les grands diagrammes.

### Export et données

| Action | Description |
|--------|-------------|
| Exporter en PNG | Image raster |
| Exporter en SVG | Image vectorielle |
| Partager comme lien image | Dialogue pour un lien public vers l’aperçu (voir ci-dessous) |
| Voir le JSON | Représentation JSON des données du diagramme |

### Partager le diagramme comme image

Vous pouvez obtenir un lien vers l’aperçu SVG du diagramme — pour collègues, Notion, Confluence, chats ou documents ; toute personne avec le lien peut l’ouvrir sans se connecter.

**Obtenir le lien :**

1. Ouvrez le diagramme dans l’éditeur de modèle.
2. Cliquez **Partager comme lien image** sur la barre d’outils.
3. Choisissez le type de lien :
   - **Cette version du diagramme** — l’image reste figée sur l’instantané actuel.
   - **Toujours la dernière version par nom** — l’image suit la dernière version enregistrée portant ce nom (mise à jour après enregistrement).
4. Cliquez **Obtenir le lien** — l’aperçu est téléversé et le lien est généré.
5. **Copier le lien** et le coller où nécessaire.

L’aperçu est aussi téléversé à l’enregistrement du modèle ; un lien « toujours dernière » reflète l’état après sauvegarde.

### Commandes

| Action | Description |
|--------|-------------|
| Fermer le diagramme | Fermer sans supprimer |
| Enregistrer | Enregistrer toutes les modifications du modèle |

## Enregistrement

Le bouton **Enregistrer** s’active lorsqu’il y a des changements non sauvegardés. Avant l’enregistrement, le système vérifie que toutes les propriétés obligatoires des composants sont renseignées. En cas d’échec, un message indique l’élément et la propriété concernés.
