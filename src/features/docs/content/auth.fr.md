# Authentification et accès

## Connexion

Après une connexion réussie, l’application enregistre les jetons et ouvre les sections protégées. Si l’utilisateur venait d’une route protégée, il y est renvoyé ; sinon la page d’accueil s’affiche. En cas d’échec, un message d’erreur s’affiche.

## Inscription

Après une inscription réussie, une session est créée et l’application affiche l’accueil. Les sections protégées restent accessibles sans se reconnecter tant que la session est valide.

## Rôles

- **USER** — ressources personnelles et partagées.
- **ADMIN** — fonctions d’administration (utilisateurs, ressources supprimées).

## Protection des routes

- Sans session active, les pages protégées sont inaccessibles.
- Une route protégée ouverte sans authentification redirige vers la connexion.
- Les routes admin vérifient les droits (`ADMIN_PANEL:VIEW`) via la politique d’autorisation.

## Rafraîchissement de session

À l’expiration du jeton d’accès, le client tente un rafraîchissement. En cas d’échec, la session est effacée et une nouvelle connexion est nécessaire.

## Déconnexion

La déconnexion efface l’état local de session et repasse l’application en mode non authentifié.
