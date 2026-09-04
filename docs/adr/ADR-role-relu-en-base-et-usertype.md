# ADR — Autorisation : rôle relu en base au refresh, invalidation de session, `userType` hors agrégat

**Date** : 2026-09-04 · **Statut** : accepté · **Contexte** : vague 1 du chantier porteur/PP-PM/accès porteur (`.claude/plans/porteur-pp-pm-acces.md`, dépôt Frontside), lot 2 — correctif de sécurité. Branche `fix/role-claim-security`.

## Contexte

Avant ce correctif, `TokenService.refreshTokens` recopiait le claim `role` de l'ancien refresh token dans le nouveau couple, sans jamais relire la base. Comme `JwtAuthGuard` et `PermissionsGuard` lisent le rôle dans le token, un changement de rôle par l'admin restait sans effet tant que l'utilisateur enchaînait les rotations — et une rétrogradation ou révocation d'admin était contournable indéfiniment. Par ailleurs, `UserMapper.toEntity` ne mappait ni `role` ni `userType` : toute écriture via `UserRepository.update()` les perdait, ce qui rendait `PATCH /users/me/type` inopérant.

## Décisions

### 1. Le claim entrant identifie, il n'autorise jamais

`refreshTokens` est remplacée par `consumeRefreshToken`, qui éprouve et consomme le tour de rotation puis ne rend que `{ sub, email }` (`RefreshSessionIdentity`, volontairement **sans** `role`). La relecture du compte appartient au use case (`RefreshTokenUsecase`), seul à connaître le repository : le couple émis porte le rôle **en base**. L'état illégal — resservir le claim comme autorisation — est rendu inexprimable par le type, pas seulement interdit par un commentaire.

`POST /auth/refresh-tokens` étant `@Public()`, `AccountStatusGuard` ne s'y applique pas : le use case oppose lui-même les statuts sanctionnés (`ACCOUNT_SUSPENDED` / `ACCOUNT_CLOSED`). Un compte suspendu, clos ou supprimé n'obtient plus aucun token.

### 2. Un changement de rôle invalide la session de la cible

`PATCH /admin/investors/:userId/role` révoque le refresh token courant de la cible (`SessionCacheService.invalidateRefreshTokenId`) : reconnexion obligatoire, avec les nouveaux droits. Entrée d'audit métier `user.role.change` avec `{ ancienRole, nouveauRole, sessionInvalidee }` — l'`AuditInterceptor` global ne connaît que le corps reçu, donc pas l'ancien rôle, la seule information qui permette de relire une rétrogradation.

**Dette assumée** : l'access token déjà émis reste valide jusqu'à son expiration (`JWT_ACCESS_TOKEN_TTL`, 1 h par défaut). Le refermer exigerait une liste de révocation par jeton consultée à chaque requête — coût permanent pour un risque borné à une heure, différé sciemment. Toute copie qui promet un effet « immédiat » doit dire « au plus tard dans l'heure ».

### 3. `userType` (PP/PM) vit hors de l'agrégat `User`

La **source de vérité du type de compte est la présence d'un profil** `profil_personne_physique` ou `profil_personne_morale` — c'est ce que `GET /users/me` déduit (`inferredType`). La colonne `users.userType` n'est qu'une annotation d'onboarding (le choix déclaré à l'étape 0, avant la création du profil) : aucune règle métier ne l'oppose, elle n'entre donc pas dans le modèle de domaine. Elle est écrite par une méthode de port dédiée, `UserRepository.updateUserType` (update partiel ciblé, sans passer par l'agrégat ni toucher la cascade `user_emails`). Ajouter le champ à l'agrégat aurait créé une deuxième source de vérité à désynchroniser — le bug d'origine, en pire.

Conséquence pour le lot 8 (bascule PP→PM) : basculer le type, c'est créer/activer le bon **profil**, pas éditer une colonne.

### 4. Prérequis d'exploitation : Redis

`SessionCacheService` est fail-closed : sans Redis, `validateRefreshToken` répond `false` et **toute session meurt à l'expiration de l'access token**, sans reprise possible. Ce n'est pas une dégradation douce (« cache et OTP dégradés » du runbook est en dessous de la réalité) : Redis est un prérequis d'exploitation du rafraîchissement de session. Sonde de disponibilité et alerte à poser (suivi S4, devops). En local, l'absence de Redis fait passer les tests de révocation « au vert » pour la mauvaise raison — les recettes de session exigent un Redis actif.

### 5. Couplage assumé : `src/common/audit/statut-erreur-metier.ts` dépend des modules métier

Ce module transverse importe une famille d'erreurs et sa fonction de statut depuis chaque module métier concerné (`iam`, `porteur-access`, `payments`, signature) : c'est une dépendance **transverse → métier**, à contre-sens de la règle habituelle, assumée pour que l'`AuditInterceptor` journalise le statut RÉELLEMENT renvoyé au client — la seule alternative, poser un `statutHttp` sur les classes d'erreurs, remettrait HTTP dans le domaine, exactement ce que ces hiérarchies évitent.

Le garde-fou est l'exhaustivité, pas la discipline : `statut-erreur-metier.spec.ts` rejoue chaque filtre réel et **échoue si une famille couverte par un filtre est absente de l'aiguillage** — un module métier qui ajoute sa propre famille d'erreurs sans la déclarer ici casse la suite avant la revue.

## Alternatives écartées

- **Relire le rôle à chaque requête** (guard qui interroge la base) : ferme la fenêtre d'une heure mais ajoute une lecture par requête sur tout le trafic authentifié ; disproportionné tant que la rotation du refresh borne l'exposition.
- **Liste de révocation par jeton** : même arbitrage — à reconsidérer si un rôle à privilèges élevés doit être coupé en secondes, pas en minutes.
- **`userType` dans l'agrégat** : rejeté, voir § 3.
