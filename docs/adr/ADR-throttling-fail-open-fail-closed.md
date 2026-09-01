# ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé

**Date** : 2026-08-31 · **Statut** : accepté · **Décideur** : chantier post-audit, validé chef-de-projet

## Contexte

Le stockage des compteurs de débit vit dans Redis. Question : que fait l'API quand Redis est en panne ?

- **Tout fail-open** (comportement d'origine) : une panne Redis supprime toute limitation, y compris sur `POST /auth/sign-in` — le bourrage d'identifiants devient gratuit pendant l'incident.
- **Tout fail-closed** : une panne Redis ferme l'API entière. Constaté lors de la première mise en service du fail-closed : les trois paliers (`short`, `medium`, `auth`) s'appliquent à toutes les routes, donc fermer sur le nom `auth` répondait 429 partout, `/health` excepté. Un composant d'infrastructure devenait un point de panne totale.

## Décision

Le refus sur panne Redis (`RedisThrottlerStorage`) n'est prononcé que si **quatre conditions** se cumulent :

1. palier `auth` (jamais les paliers de trafic `short`/`medium`) ;
2. limite **explicitement resserrée** par la route (`limit < AUTH_GLOBAL_LIMIT = 500`, constante partagée avec `app.module.ts`) — resserrer l'axe `auth` d'une route **vaut déclaration** « sensible au bourrage d'identifiants » et emporte le fail-closed ;
3. environnement non-développement (`NODE_ENV` absent = développement : les postes locaux n'ont pas de Redis) ;
4. au moins 3 échecs Redis consécutifs **sur ce palier** (compteur par palier : le seuil signifie trois requêtes, pas une).

Corollaires : ne PAS surcharger l'axe `auth` sur une route qui n'est pas de l'ordre des identifiants (avis, désinscription — cette dernière est l'exercice d'un droit, art. L. 34-5 CPCE / art. 21 RGPD, et ne doit jamais fermer). Les specs `redis-throttler.storage.spec.ts` figent les quatre conditions.

## Conséquences assumées

- Pendant une panne Redis prolongée en production : connexion, OTP, réinitialisation, dépôt, retrait et souscription refusent (protection > disponibilité sur ces routes) ; tout le reste fonctionne sans limitation (disponibilité > protection sur le trafic).
- La surveillance de Redis est donc un sujet de production à part entière (jauge `beown_dependency_up`, alerte).
