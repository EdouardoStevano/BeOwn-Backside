# BeOwn — backend

API NestJS + TypeORM + PostgreSQL + Redis, découpée en contextes métier.

## Architecture

Le projet suit **Clean / Hexagonal Architecture, DDD et SOLID**. Ce ne sont pas des
intentions : `src/iam` et `src/users` en sont l'implémentation de référence. Tout code
nouveau s'aligne dessus.

### Les 4 couches, et le sens des dépendances

```
presenters/     → HTTP : contrôleurs, DTOs. Traduit HTTP ↔ application. Aucune logique métier.
applications/   → cas d'usage : commands, queries, handlers, ports, contrats.
domains/        → le métier : agrégats, value objects, enums, erreurs, factories. Zéro dépendance.
infrastructure/ → le monde extérieur : entités TypeORM, repositories, adapters, config, guards.
```

**La règle qui prime sur toutes les autres : les dépendances pointent vers l'intérieur.**
`domains/` n'importe rien — ni NestJS, ni TypeORM, ni un autre contexte. `applications/`
n'importe que `domains/`. `infrastructure/` implémente les interfaces déclarées plus haut.
Un `import` de `infrastructure/` depuis `domains/` ou `applications/` est un bug de
conception, pas un détail à nettoyer plus tard.

### Ports et adapters

Toute sortie vers l'extérieur (base, Redis, mail, SMS, HTTP tiers, crypto) passe par un
**port** : une interface déclarée dans la couche qui en a besoin, plus un symbole
d'injection. L'implémentation vit dans `infrastructure/adapters` (ou
`infrastructure/persistences/repositories`) et est câblée dans le module d'infra.

```ts
// domain/ports/token.service.ts       ← le contrat, exprimé en termes métier
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export interface TokenService { … }

// infrastructure/adapters/jwt-token.service.ts   ← une implémentation parmi d'autres
export class JwtTokenService implements TokenService { … }

// infrastructure/iam-infrastructure.module.ts    ← le câblage
{ provide: TOKEN_SERVICE, useClass: JwtTokenService }
```

Un port se nomme d'après **le besoin**, pas d'après la techno : `TokenService`,
`OneTimeTokenStore`, `OtpService` — jamais `RedisService` ni `JwtHelper`. On doit pouvoir
remplacer l'adapter sans toucher une ligne au-dessus. Le port raisonne en objets du
domaine (`OtpTarget`), pas en clés de cache.

### Frontières entre contextes

Un contexte **n'importe jamais** le domaine ou les repositories d'un autre. Deux passages
autorisés, et deux seulement :

- Le contexte **fournisseur** publie un contrat dans `applications/contracts/`
  (cf. `users/applications/contracts/user-account.contract.ts` et `USER_ACCOUNT_SERVICE`) :
  des vues plates, pas ses agrégats.
- Le contexte **consommateur** déclare son propre port et écrit un **anti-corruption layer**
  qui traduit (cf. `iam/domain/ports/account.gateway.ts` +
  `iam/infrastructure/adapters/users-account.gateway.ts`). IAM a son propre
  `TwoFactorMethod` : c'est voulu, chaque contexte garde son vocabulaire.

### CQRS

Dans `iam` et `users`, un cas d'usage = une commande (ou une query) + son handler, dans
`applications/<feature>/commands|queries/`. La commande porte son type de retour
(`extends Command<Result>`). Le contrôleur ne fait qu'appeler le bus. Les autres contextes
utilisent encore `applications/usecases/` : c'est du legacy, on ne le réécrit pas sans
raison, mais tout nouveau cas d'usage passe en CQRS.

### Le domaine porte les règles

Un agrégat protège ses invariants (`user.verifyEmail()`, `tfaMethod.activate()`), il n'est
pas un sac de setters. Les valeurs contraintes sont des value objects (`UserEmail`,
`OtpTarget` — validation à la construction). Les erreurs métier sont des classes du domaine
qui étendent `DomainError` (`src/common/domain/domain-error.ts`), avec leur code HTTP —
jamais un `HttpException` levé depuis un handler.

Les entités TypeORM sont un détail de persistance : elles restent dans
`infrastructure/persistences/entities/` et sont traduites par un mapper. Le domaine ignore
qu'une base existe.

### SOLID, concrètement ici

- **SRP** — un handler = un cas d'usage. Si un handler orchestre trois choses sans lien,
  il en cache trois.
- **OCP / LSP** — le polymorphisme plutôt que le `switch` sur un type : `TfaMethod` et ses
  sous-classes (`SmsMethod`, `EmailMethod`, `TotpMethod`) avec l'héritage TypeORM (STI).
- **ISP** — des ports étroits, découpés par usage, pas une interface `IUserService` fourre-tout.
- **DIP** — on injecte des interfaces via des symboles, jamais une classe concrète
  d'infrastructure.

## Conventions

- Les DTOs sont de vraies classes avec `class-validator` **et** `@ApiProperty` : la
  `ValidationPipe` globale est en `whitelist: true, forbidNonWhitelisted: true`, donc un
  champ non déclaré est rejeté — et la doc Swagger est un livrable, pas un bonus.
- Un DTO n'est jamais un objet inline dans la signature du contrôleur.
- Les tests unitaires portent sur les handlers et le domaine, avec des ports mockés — pas
  de base dans les tests. `npm test` doit rester vert.
- Dev : `synchronize: true`. Prod : une migration dans `database/migrations/`. Tout
  changement de schéma s'accompagne de sa migration, avec un `down` qui fonctionne.
- Les commentaires expliquent **pourquoi**, jamais **quoi**. En français, comme le reste
  du code.

## Commandes

```bash
npm run start:dev     # dev
npm test              # tests unitaires
npm run lint          # eslint (33 erreurs préexistantes dans iam/infrastructure/strategies)
npx tsc --noEmit      # typecheck (2 erreurs préexistantes dans src/kpi)
npm run migration:generate / migration:run / migration:revert
```
