# Journal des modifications

Tous les changements notables de ce projet sont documentés dans ce fichier.

## [Unreleased]

## [0.5.9] - 2026-04-10

### Corrigé
- Éditeur de notation : l’ouverture d’une notation n’affiche plus immédiatement des modifications non enregistrées lorsque les `attrs` du serveur diffèrent du JSON canonique écrit par l’éditeur pour le calque du diagramme (notations partagées ou plus anciennes).

## [0.5.8] - 2026-04-10

### Corrigé
- Éditeur de modèle : glisser un nœud de l’arbre vers le diagramme lorsque plusieurs composants de notation conviennent au type de nœud crée bien l’instance sur le canevas juste après le choix dans la boîte de dialogue ; le premier glisser-déposer ne lie plus le type sans afficher la forme (fermer la modale sans choix annule l’action en attente).

## [0.5.7] - 2026-04-10

### Corrigé
- Éditeur des formes de nœuds : si l’enregistrement du wiki réussit mais que `POST /documents` échoue (droits insuffisants, etc.), un message d’erreur s’affiche au lieu d’un échec silencieux (RU/EN/FR).

## [0.5.6] - 2026-04-10

### Corrigé
- La documentation wiki respecte les droits de partage : en VIEW, ouverture et lecture du markdown lié dans la modale document (lecture seule) ; création ou modification du contenu réservée à EDIT ou plus. Les entrées de barre d’outils et de panneau restent masquées en VIEW tant qu’aucun fichier n’est lié (modèle, diagramme, notation, types, formes).
- Éditeur de notation : bloc et modale de documentation pour les relations (mêmes règles que pour les composants) ; visibilité du bouton wiki d’en-tête alignée sur l’éditeur de modèle.

### Ajouté
- Éditeur de modèle : message utilisateur en cas d’échec de liaison du document via `POST /documents` (RU/EN/FR).

## [0.5.5] - 2026-04-10

### Modifié
- L’éditeur de modèle charge les données liées à la notation avec le contexte du modèle : composants et relations par notation avec `modelId` et `notationId`, règles de relation avec `modelId`, aligné sur les règles d’accès côté API pour les modèles partagés.
- Le chargement de secours des métadonnées de notation pour le diagramme actif inclut `modelId` dans `/notations/{id}/meta`.

## [0.5.4] - 2026-04-07

### Corrigé
- L’export SVG du diagramme conserve désormais correctement la direction des libellés d’arête (`labelFollowPath`) et la coupure de ligne sous le libellé (`labelLineGap`), comme sur le rendu canvas.

## [0.5.3] - 2026-03-31

### Ajouté
- Marqueur d’extrémité de lien « carré » (`square`) au début et à la fin dans le panneau de style de notation (RU/EN/FR), aligné sur `ArrowMarkerType` dans Papirus.

## [0.5.2] - 2026-03-31

### Modifié
- Les flux composite notation/modèle s’appuient sur un helper partagé `createDefaultCompositeContent` pour des arbres composite par défaut cohérents à l’initialisation et à la réinitialisation.
- Les liaisons de texte composite sont alignées sur le contrat Papirus `bindToProperty` (y compris `__name__` pour le nom affiché du nœud) au lieu des métadonnées basées sur `role`.

## [0.5.1] - 2026-03-31

### Ajouté
- Aide in-app étendue et `docs/composite-components.md` pour la configuration des composants composite dans les éditeurs de modèle et de notation (EN/RU/FR).

### Modifié
- Attributs de notation : analyse et normalisation plus strictes de `compositeShapeType` par rapport aux formes composite autorisées.

## [0.5.0] - 2026-03-31

### Ajouté
- Éditeur complet de composants composite dans les workflows de notation : types de composants, inspecteurs par type, shape picker complet et UI pilotée par propriétés/bindings au lieu d’un éditeur JSON patch brut.
- Bindings composite dans les éditeurs de notation et de modèle : les composants texte peuvent se lier au nom du nœud/aux propriétés personnalisées, et les bindings d’icônes de notation sont résolus dans la palette du modèle.
- Contrôles étendus des libellés d’arêtes dans les diagrammes de notation : position du libellé sur le chemin, comportement follow-path, libellés multilignes via `\n`, et meilleure prise en charge des style bindings.

### Modifié
- Refonte des panneaux composite et de l’UX de l’arbre dans l’éditeur de notation : hiérarchie visuelle plus claire, noms de composants lisibles, cohérence avec les panneaux node/style.
- L’éditeur de modèle affiche désormais un onglet de style composite pour les éléments composite et propose des actions de restauration depuis la notation lorsque c’est pertinent.

### Corrigé
- Comportement du style d’arête dans les éditeurs de notation/modèle : application correcte de `labelInset` lors de la création de nouvelles arêtes, `markDirty` explicite après modification des insets, et style de repli de notation pour les liens uniquement diagramme.
- Fidélité preview/runtime des composites : contours custom-shape, bordures des conteneurs, comportement de scroll, actions désactivées pour les nœuds d’arbre non supprimables, et contraintes de structure de l’arbre.

## [0.4.6] - 2026-03-27

### Ajouté
- Locale FR pour toute l’interface ; sélecteur de langue sur la page d’accueil publique (RU/EN/FR) aligné avec la locale de l’app.
- Documentation utilisateur in-app en français (`*.fr.md`) et journal des modifications en français (`CHANGELOG.fr.md`) pour l’aide et les notes de version sur l’accueil.
- Script `scripts/build-models-fr.mjs` et `models.fr.generated.ts` généré pour les chaînes de l’éditeur de modèles.

### Modifié
- Chargement de l’aide markdown et source du changelog sur l’accueil : prise en charge de `fr` en plus de `ru` / `en`.
- Skill de release : tenir `CHANGELOG.fr.md` à jour avec EN/RU à chaque version.

### Corrigé
- `CHANGELOG.ru.md` : rétablissement de la section manquante `## [0.0.27]` pour l’alignement avec l’historique anglais.

## [0.4.5] - 2026-03-26

### Corrigé
- Dans l’image Docker de production, nginx proxifie désormais `/ws` vers l’API : la synchro live du modèle (STOMP), la vue diagramme spectateur avec pointeur distant fonctionnent lorsque le SPA est servi depuis le même hôte que `/api`.

## [0.4.4] - 2026-03-25

### Corrigé
- Export diagramme en SVG : les arêtes avec marqueurs explicites début/fin ne dessinent plus de flèche supplémentaire là où le marqueur est `none` (aligné avec le rendu sur le canevas).

## [0.4.3] - 2026-03-25

### Ajouté
- Vue diagramme en direct pour les spectateurs : mises à jour via le canal de synchro du modèle, pointeur distant sur le canevas, liste compacte des spectateurs dans l’en-tête de l’éditeur.
- Aides côté client pour une synchro granulaire du modèle : déduplication / fusion d’événements et télémétrie de synchro optionnelle pour le débogage.

### Modifié
- Synchro live du modèle et chemin de fusion affinés pour les événements serveur granulaires et les mises à jour fréquentes.

## [0.4.2] - 2026-03-25

### Ajouté
- Notification in-app lorsqu’un administrateur libère de force votre verrou de diagramme.
- Le tableau des verrous diagramme dans l’admin affiche les chemins résolus vers chaque diagramme.

### Modifié
- Refonte des onglets de la zone d’administration et de l’indicateur de verrou diagramme dans l’éditeur.

### Corrigé
- Verrous diagramme : vérification que vous détenez encore le verrou avant enregistrement ; détection du vol du verrou par un autre utilisateur ou de la libération forcée admin via le polling de la liste des verrous ; après libération forcée, rechargement de l’état serveur et sortie des chemins d’édition conflictuels sans réacquérir à tort un verrou libéré.

## [0.4.1] - 2026-03-25

### Corrigé
- Listes déroulantes personnalisées (recherche et sélection multiple) restent dans la fenêtre : les panneaux s’ouvrent vers le haut lorsque le contrôle est sous la moitié de l’écran, hauteur limitée à l’espace disponible.

### Modifié
- Le panneau multi-sélection est téléporté dans `document.body` et suit les mêmes règles de positionnement que les SearchableSelect (évite la découpe dans les panneaux latéraux défilants).

## [0.4.0] - 2026-03-25

### Ajouté
- Synchro live du modèle côté frontend : modes configurables (`ws`, `poll`, `hybrid`), abonnement STOMP et repli polling via variables d’environnement.
- Verrous d’édition diagramme : acquisition / libération sur la dernière version du diagramme, affichage du détenteur du verrou, vue admin des verrous ouverts.
- Gestion des conflits de sauvegarde groupée dans l’éditeur de modèle : comparaison au niveau des champs, rechargement ou écrasement, avertissements sur les liens supprimés croisés le cas échéant.
- Panneau de traçabilité : mise en évidence si un lien du modèle est déjà sur le diagramme actif ; glisser-déposer d’un lien éligible depuis la traçabilité vers le canevas pour placer l’arête.
- Garde de disponibilité et flux connexion / documentation associés pour un comportement plus clair lorsque l’API est injoignable.

### Modifié
- Refactor de l’éditeur de modèle en composables plus petits : chargement, pipeline de sauvegarde, chargement relations / règles de notation, fusion après rechargement.
- Redirection après authentification : la connexion conserve le retour vers une route protégée ; après inscription, toujours arrivée sur l’accueil.
- Documentation produit et technique mise à jour (synchro live, verrous diagramme, conflits de sauvegarde, auth).

## [0.3.1] - 2026-03-22

### Ajouté
- Libellés de type de lien pour chaque relation dans l’arbre de traçabilité de l’éditeur de modèle.
- Filtre par type de lien dans le panneau de traçabilité pour parcourir les branches par nature de relation.

### Modifié
- Compteurs de l’arbre de traçabilité et expansion des branches respectent le filtre de type de lien sélectionné.

## [0.3.0] - 2026-03-22

### Ajouté
- Exploration de la traçabilité dans l’éditeur de modèle avec inspection ciblée d’une branche.
- Améliorations du panneau de traçabilité pour une structure de branches et un contexte de navigation plus clairs.

### Modifié
- Interactions de traçabilité et comportement du focus dans l’éditeur de modèle pour une analyse des dépendances plus rapide.
- Chaînes de localisation liées au nouveau parcours de traçabilité.

## [0.2.1] - 2026-03-21

### Ajouté
- Onglets de dossiers de nœuds dans l’éditeur de diagrammes pour naviguer plus vite dans la structure du modèle.
- Prise en charge du presse-papiers pour les instances de notes dans l’éditeur de modèle.

### Modifié
- Flux de gestion des liens du modèle dans les interactions de l’éditeur.
- Actions supprimer / renommer dans les cartes et catalogues d’entités pour simplifier la gestion des éléments.

## [0.2.0] - 2026-03-21

### Ajouté
- Prise en charge des ressources `FILE` dans le contrat de permissions frontend pour les contrôles d’accès basés sur les politiques.

### Modifié
- Actions critiques des éditeurs migrées vers des contrôles de permission pilotés par politique ; suppression des branches restantes basées sur les rôles pour les actions privilégiées.
- Couverture élargie des types de ressources pour les types de nœuds et de liens afin d’unifier le comportement d’autorisation dans l’UI.

## [0.1.4] - 2026-03-20

### Ajouté
- Regroupement des données du tableau de bord et résolution des noms de propriétaires pour des vues agrégées plus lisibles.

### Modifié
- Parcours d’édition modèles / notations renforcés, notamment sauvegarde groupée et synchro des règles de relation.
- Partage par lot et intégrations éditeurs types / documents pour des mises à jour transverses plus fluides.

## [0.1.1] - 2026-03-17

### Modifié
- L’aperçu de création de connexion dans les éditeurs de modèle et de notation utilise par défaut une ligne droite pendant le glisser d’un nouveau lien.

## [0.1.0] - 2026-03-15

### Ajouté
- Notification dans l’éditeur de modèle lorsqu’une version plus récente de la notation existe alors que le diagramme utilise une notation obsolète.
- Parcours de comparaison des versions de modèle étendu avec présentation des différences plus claire.

### Modifié
- Gestion des versions de diagramme et flux de renommage dans l’éditeur de modèle.
- Documentation / navigation et formatage des propriétés « scoped » dans les panneaux de l’éditeur.

## [0.0.28] - 2026-03-04

### Ajouté
- Mode navigation seule dans l’éditeur de modèle : le diagramme et la palette peuvent être explorés sans risquer des modifications par glisser-déposer accidentel.

## [0.0.27] - 2026-03-03

### Ajouté
- Nouveaux interrupteurs type switch pour les réglages booléens dans les panneaux de style et de propriétés.
- Nouvelle option de style d’arête pour créer un espace sous les libellés d’arêtes et améliorer la lisibilité sur les diagrammes denses.

### Modifié
- Cohérence renforcée des contrôles booléens entre les éditeurs de modèle et de notation.

## [0.0.26] - 2026-03-02

### Ajouté
- Infobulles au survol (`title`) pour les champs numériques compacts du panneau de style (`W/H/R`, `PT/PB/PL/PR`, `T/R/B/L`) afin de clarifier les libellés abrégés.

### Modifié
- Libellés des boutons de synchro des marges (`Pair` / `All`) localisés.

## [0.0.25] - 2026-02-28

### Modifié
- Stabilité renforcée de l’éditeur de modèle pour la synchro et la validation des liens.

### Corrigé
- Propagation du texte des libellés d’arêtes lors de la restauration des liens à l’ouverture / synchro du diagramme (les nouvelles arêtes runtime ne perdent plus le texte du libellé).
- Liaison du champ libellé dans le panneau de style d’arête pour afficher correctement le texte pour les formes libellé chaîne et objet.

## [0.0.24] - 2026-02-28

### Ajouté
- Versionnement des diagrammes et ligne de base : créer une nouvelle version de diagramme (baseline) à partir de l’actuelle via ModelEditor.
- Sélecteur de version dans l’éditeur de diagrammes pour voir et basculer entre les versions (lecture seule pour les versions autres que la dernière).

### Modifié
- Éditeur de modèle : flux de création de baseline et affichage des versions.

## [0.0.23] - 2026-02-28

### Ajouté
- Glissement de groupe sur le diagramme modèle : faire glisser un nœud dans un conteneur déplace les deux ensemble.
- Auto-liens dans les groupes : lors du dépôt d’un nœud dans un conteneur avec relation de groupe, proposition de créer ou réutiliser un lien (réglage « Auto-liens dans les groupes » dans les paramètres du diagramme).
- Indicateur de propriété système (`system`) sur CustomProperty pour un comportement spécial défini par la notation (ex. `group` pour le mode groupe).

### Modifié
- Éditeur de modèle : modales de réutilisation de lien existant et de choix de relation pour le flux auto-lien.
- Navigation clavier et gestion du focus dans les modales.

### Corrigé
- Les propriétés système ne s’affichent plus dans le panneau des propriétés de l’éditeur de modèle (ModelPropertiesPanel).
- Les propriétés système sont exclues de la validation des champs obligatoires à l’enregistrement (l’utilisateur ne peut pas les éditer).

## [0.0.22] - 2026-02-27

### Ajouté
- Sélection d’icônes SVG pour les types de nœuds dans l’éditeur de types.
- Champ icône pour les types de nœuds (notationAttrs) : affichage en arbre dans la palette du modèle avec icônes personnalisées depuis public/icons.
- Configuration availableIcons avec options d’icônes prédéfinies.

### Modifié
- Profil utilisateur : bouton d’enregistrement aligné sur le design system (btn--primary, icône save), actif seulement en cas de modifications non sauvegardées.
- Améliorations de SearchableSelect pour l’intégration d’IconPicker.

## [0.0.21] - 2026-02-27

### Ajouté
- Résolution du nom d’affichage du propriétaire dans l’éditeur de modèle : les infos de notation du diagramme affichent le nom du propriétaire (repli sur l’e-mail).

### Modifié
- Éditeur de modèle : informations de propriété des diagrammes plus claires.

## [0.0.20] - 2026-02-27

### Ajouté
- Gestion des documents dans l’éditeur de modèle : ouverture et enregistrement de documents pour modèles, nœuds et diagrammes.
- Affichage des versions de document et UI de changement de version dans DocumentEditorModal et TypeDocumentPanel.

### Modifié
- DocumentEditorModal : meilleure gestion des versions et de l’état d’édition.
- Parcours documents dans l’éditeur de modèle améliorés.

## [0.0.19] - 2026-02-26

### Ajouté
- DocumentEditorModal pour éditer des documents Markdown avec historique de versions.
- Prise en charge de l’historique de versions dans TypeDocumentPanel.

### Modifié
- Messages i18n pour l’UI documents / versions.

## [0.0.18] - 2026-02-26

### Ajouté
- Composant SearchableSelect avec recherche, emplacements personnalisés et support `allowEmpty`.
- Composant TabPanel avec onglets à icônes et soulignement de l’onglet actif.
- Panneau droit à onglets dans l’éditeur de notation (Propriétés + Style de la figure), remplaçant le panneau de propriétés redimensionnable du bas.
- Panneau droit à onglets dans l’éditeur de modèle, remplaçant la pile repliable.
- Expérience de sélection et d’édition par onglets plus cohérente entre les éditeurs.

### Modifié
- Comportement et cohérence visuelle unifiés des éditeurs.

## [0.0.17] - 2026-02-25

### Ajouté
- Réglage Outline ON dans la barre d’outils de l’éditeur de modèle : attacher les arêtes au contour de la forme plutôt qu’aux ports (activé par défaut).

## [0.0.16] - 2026-02-25

### Corrigé
- Lors du passage d’un type d’arête polyline ou polyline éditable vers bezier ou straight, les points de contrôle sont supprimés pour éviter une flèche déformée.

## [0.0.15] - 2026-02-25

### Ajouté
- Rechargement automatique lors d’un déploiement blue-green : l’application interroge périodiquement `version.json` et, en cas de nouvelle version, affiche un toast puis recharge la page.

## [0.0.14] - 2026-02-25

### Ajouté
- Localisation complète RU/EN de l’interface avec sélecteur de langue dans l’en-tête.
- Documentation localisée : toutes les rubriques d’aide (aperçu, modèles, notations, diagrammes, types, raccourcis, FAQ) et changelog disponibles en russe et en anglais.

### Modifié
- Le contenu de la documentation se charge selon la locale ; le changement de langue met à jour le texte d’aide.

## [0.0.13] - 2026-02-24

### Ajouté
- Regroupement de la palette des composants dans les attrs de notation (`paletteGroup`) avec édition dans les propriétés personnalisées de la notation.
- La palette de l’éditeur de modèle sépare les groupes de composants par des séparateurs et trie les composants par ordre alphabétique dans chaque groupe.

### Modifié
- La création d’une note dans l’éditeur de modèle n’ouvre plus automatiquement la modale de texte.
- Le menu contextuel des arêtes affiche explicitement le libellage des liens de notes et un texte de suppression spécifique aux liens diagramme-seulement.
- Le bloc de réglage « Groupe de palette » est aligné sur les autres sections repliables du panneau de propriétés de la notation.

### Corrigé
- Séparation visuelle des groupes de palette lorsque le premier groupe de composants est supérieur à `0` (les composants n’apparaissent plus dans le même groupe visuel que la note).

## [0.0.12] - 2026-02-24

### Modifié
- Les nœuds du diagramme de notation dérivent le nombre d’ancres / ports des paramètres de style du composant (`portsTop/Right/Bottom/Left`) avec des valeurs par défaut raisonnables.
- Désactivation du démarrage interactif de connexion / reconnexion dans le runtime du canevas de l’éditeur de notation pour garder le flux centré sur les composants de notation.

## [0.0.11] - 2026-02-23

### Ajouté
- Meilleure reproductibilité du processus de release.

### Modifié
- Barres d’outils des éditeurs modèle / notation unifiées : bouton partage compact, style de barre flottante du canevas, barre du haut dupliquée masquée dans l’éditeur de notation.
- Persistance par utilisateur des bascules de la barre d’outils du diagramme modèle (grille, mini-carte, magnétisme, ancrage des liens) et synchronisation avec le runtime du canevas.

### Corrigé
- Boîtes de confirmation avant suppression de nœuds / diagrammes depuis l’arbre de gauche et avant suppression de nœuds depuis le canevas dans l’éditeur de modèle.
- Dérive undo/redo dans l’éditeur de modèle corrigée en routant ajout / connexion / suppression via une synchro cohérente historique / état.
- Artefacts redo où marqueurs / styles de connexion réapparaissaient en plusieurs phases après reconnexion des arêtes.

## [0.0.10] - 2026-02-23

### Corrigé
- L’export de notation n’inclut que les entités de notation actives et les types de nœuds / liens réellement utilisés par les composants et relations exportés.
- Flux de renommage de notation dans les cartes du catalogue rétabli : UI modale, validation des doublons, mise à jour backend via `PUT /notations/{id}`.

## [0.0.9] - 2026-02-22

### Ajouté
- UI de partage basée sur les ACL pour modèles, notations et types avec modale de gestion des accès.
- Prise en charge des permissions `VIEW` et `EDIT`, y compris badges d’accès effectif dans les catalogues.
- Pages profil utilisateur et admin utilisateurs avec rôles normalisés (`ADMIN` / `USER`).
- Action infos diagramme dans la barre d’outils de l’éditeur de modèle avec métadonnées de notation (nom / version / propriétaire) et chargement de repli.
- Prise en charge du point de terminaison métadonnées de notation (`/notations/{id}/meta`) pour les diagrammes référençant des notations inaccessibles.

### Modifié
- Suppression des hypothèses héritées sur le rôle `EDITOR` dans auth, routage et filtrage d’entités.
- Éditeurs modèle / notation / types basés sur les réponses ACL du backend plutôt que sur un filtrage client propriétaire uniquement.
- Messages d’erreur API affinés pour accès partagé révoqué ou manquant.

### Corrigé
- Plusieurs régressions de sauvegarde en édition partagée (403/409) dans les flux modèle et notation.
- Problèmes UX du partage (recherche utilisateur, valeurs par défaut d’attribution).
- Découpe du texte hero du tableau de bord et problèmes de taille de panneau.

## [0.0.8] - 2026-02-21

### Ajouté
- Modèles de libellés composites pour les nœuds du diagramme avec syntaxe de substitution `${name}` et `${propertyName}`.
- Prise en charge des sauts de ligne (`\n`) dans les modèles de libellé pour des libellés multilignes.
- Contrôle d’alignement du texte du libellé (gauche / centre / droite) indépendamment du placement du libellé.
- UI d’édition du modèle de libellé dans NodeStylePanel et CustomPropertiesPanel avec aperçu en direct.
- Prise en charge de `editableText` dans Papirus TextLabel pour texte d’affichage et d’édition inline distincts.
- Synchro automatique des valeurs par défaut des propriétés personnalisées au chargement du modèle pour les nouvelles propriétés obligatoires.

### Modifié
- L’édition inline du libellé (double-clic) n’affiche plus que le nom du composant, pas le modèle résolu.

### Corrigé
- Les nœuds du modèle ne recevaient pas les modèles de libellé de la notation lors du glisser depuis la palette.
- Les libellés du diagramme ne se mettaient pas à jour en temps réel quand les valeurs des propriétés personnalisées changeaient.
- Erreurs de validation lorsque la notation gagne de nouvelles propriétés obligatoires alors que des nœuds du modèle existent déjà.

## [0.0.5] - 2026-02-20

### Ajouté
- Actions de renommage de modèle dans l’en-tête de l’éditeur et les cartes du catalogue modèles.
- Validation des doublons nom / version pour le renommage de modèle.
- Persistance du z-order des nœuds dans les attrs du diagramme (`attrs.zIndex`) pour conserver les couches après réouverture.

### Modifié
- Logique de superposition : les nœuds plus petits sont rendus au-dessus des plus grands.
- En cas de taille égale, le nœud sélectionné est élevé au-dessus des autres.

### Corrigé
- Problèmes de build / lint du diagramme modèle dans la logique d’aide au z-order.

## [0.0.4] - 2026-02-19

### Ajouté
- Persistance de la préférence d’espace de travail pour l’état replié des tags de la liste des composants de notation.
- Section des notes de version sur la page d’accueil affichant les changements de la version courante à partir de `CHANGELOG`.

### Modifié
- Métadonnées titre / version de la notation déplacées du panneau gauche vers l’en-tête, visuels alignés sur l’éditeur de modèle.
- Contrôles du panneau gauche de la notation : boutons icônes compacts, tri près de la recherche, compteur d’éléments à côté du titre.
- Espace d’en-tête élargi dans les éditeurs modèle / notation pour les longs noms sans troncature.

### Corrigé
- Hauteur de la ligne de contrôle de la liste des composants : le select de tri ne tire plus en hauteur les boutons voisins.
- Persistance manquante de l’état replié / déplié de la section tags entre les sessions.

## [0.0.3] - 2026-02-19

### Ajouté
- Actions du menu contextuel nœud et arête sur le canevas de l’éditeur de modèle : suppression de nœud depuis le diagramme courant, changement de type d’arête, flux de suppression d’arête.
- Icônes de type d’arête dans le menu contextuel (`straight`, `polyline`, `bezier`) alignées sur les contrôles du panneau de style.
- Contrôles du nombre de ports du nœud dans le panneau de style (`top`, `bottom`, `left`, `right`) avec persistance dans `attrs.diagramStyle`.

### Modifié
- Boutons d’action du panneau de style (restaurer depuis la notation, replier / déplier) déplacés dans la ligne d’en-tête « Figure / Lien » ; ligne redondante « Style » supprimée pour gagner de la place.
- Apparence des boutons d’en-tête du panneau de style unifiée avec les boutons icônes du panneau arbre de gauche.
- Confirmation des modifications non enregistrées à la fermeture d’un diagramme actif (`Enregistrer / Ne pas enregistrer / Annuler`).

### Corrigé
- Suivi de la reprise de port d’arête : le bouton d’enregistrement s’active et undo/redo reste correct après reconnexion à un autre port.
- La suppression d’arête depuis le diagramme courant participe à l’historique undo/redo.
- Application des nombres de ports personnalisés et des points d’ancrage après réouverture du diagramme.

## [0.0.2] - 2026-02-19

### Ajouté
- Confirmation de suppression d’arête avec choix : retirer la connexion du diagramme courant ou du modèle entier.
- Bloc de style repliable dans le panneau droit de l’éditeur de modèle avec action rapide pour restaurer les styles depuis la notation.
- Validation des propriétés personnalisées obligatoires avant enregistrement pour les nœuds et liens du modèle.

### Modifié
- Mise en page latérale de l’éditeur de modèle avec panneaux gauche / droit redimensionnables et repliables.
- Libellés du dialogue de réutilisation de lien : affichage du type de relation et de la valeur du libellé plutôt que de l’ID du lien.
- Éditeurs de propriétés personnalisées : champs selon le type de propriété (y compris select enum).

### Corrigé
- Persistance et réapplication du style d’arête après réouverture des diagrammes.
- Gestion de l’historique undo/redo lors du changement ou de la fermeture de diagrammes.
- Initialisation des valeurs par défaut des propriétés personnalisées à l’ajout de nœuds depuis la palette et à la liaison composants / relations.
- Bascule entre diagrammes avec modifications non enregistrées : choix enregistrer / abandonner et rechargement d’état correct en cas d’abandon.
