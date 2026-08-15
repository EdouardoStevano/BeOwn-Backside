# CLAUDE.md

## NestJS · Hexagonal Architecture · DDD · CQRS · Event-Driven

### 🎯 Contexte

Ce fichier fournit à Claude Code (et à toute l'équipe) les règles d'architecture à respecter **systématiquement** dans ce projet NestJS. Il combine :

- **Architecture Hexagonale** (Ports & Adapters) + **Clean Architecture**
- **Domain-Driven Design (DDD)**
- **CQRS** (Command Query Responsibility Segregation)
- **Event-Driven Architecture** (Domain Events + Integration Events)
- **SOLID**
- **REP / CCP / CRP** (principes de cohésion des packages)
- **Design Patterns (GoF)** (Factory, Strategy, Adapter, Observer, etc.)

> 📌 Petite correction au passage : "ERP" dans la demande d'origine est très probablement **REP** (_Reuse-Release Equivalence Principle_), qui forme avec CCP et CRP le trio des "principes de cohésion des packages" de Robert C. Martin. Documenté en §5.

Toute génération de code doit respecter ces règles, sauf exception justifiée explicitement en commentaire dans le code.

---

### 📐 Vue d'ensemble — à quel niveau agit chaque concept

| Concept                        | Niveau d'action      | Répond à la question                                                |
| ------------------------------ | -------------------- | ------------------------------------------------------------------- |
| SOLID                          | Classe               | Comment écrire UNE classe/fonction proprement ?                     |
| Design Patterns (GoF)          | Implémentation       | Comment résoudre un problème récurrent à l'intérieur d'une couche ? |
| REP / CCP / CRP                | Package / Module     | Comment regrouper les classes en modules cohérents ?                |
| DDD (Entity, VO, Aggregate...) | Domaine métier       | Comment modéliser fidèlement le métier ?                            |
| Hexagonal (Ports & Adapters)   | Architecture globale | Comment isoler le métier de la technique ?                          |
| Clean Architecture             | Architecture globale | Variante de l'hexagonale (cercles concentriques, mêmes règles)      |
| CQRS                           | Flux applicatif      | Comment séparer lecture et écriture ?                               |
| Event-Driven                   | Communication        | Comment découpler les réactions à un fait métier ?                  |

Ces couches ne sont pas concurrentes : elles s'empilent. Voir §14 pour un flux complet qui les traverse toutes.

### Table des matières

1. La règle d'or : direction des dépendances
2. Les couches — Domain, Application, Presentation, Infrastructure
3. Structure de dossiers de référence
4. Principes SOLID appliqués à NestJS
5. Cohésion des packages — REP, CCP, CRP
6. Domain-Driven Design — briques tactiques
7. CQRS avec `@nestjs/cqrs`
8. Event-Driven Architecture
9. Design Patterns (GoF) appliqués à ce projet
10. Conventions de nommage
11. Stratégie de tests
12. Interdictions strictes
13. Checklist avant de générer du code
14. Exemple de flux complet
15. Commandes utiles
16. Pour aller plus loin

---

## 1. La règle d'or : direction des dépendances

Le domaine ne dépend **jamais** de rien d'extérieur. Toujours l'inverse.

```
Presentation    ──depends on──▶  Application  ──depends on──▶  Domain
Infrastructure  ──depends on──▶  Application  ──depends on──▶  Domain
 (adapters entrée/sortie)           (use cases)                  (core)
```

`Presentation` et `Infrastructure` sont deux couches **parallèles** (adapters d'entrée vs adapters de sortie) : elles dépendent toutes les deux de `application/`, mais **ne dépendent jamais l'une de l'autre**. Un Controller n'appelle jamais un Repository directement — il passe toujours par une Command/Query.

- `domain/` : **zéro** import NestJS, zéro import TypeORM/Prisma, zéro import HTTP. TypeScript pur.
- `application/` : orchestration, dépend du `domain/`, ne dépend d'aucune techno concrète (seulement des interfaces/ports).
- `presentation/` : point d'entrée (HTTP, GraphQL, WebSocket, CLI) — traduit une requête externe en Command/Query.
- `infrastructure/` : seule couche qui a le droit de connaître Postgres, Kafka, Stripe, Express, etc.

Si tu dois écrire `import { Injectable } from '@nestjs/common'` dans un fichier situé sous `domain/`, c'est un signal que la règle est en train d'être violée.

---

## 2. Les couches — Domain, Application, Presentation, Infrastructure

Ce projet fusionne le vocabulaire hexagonal et Clean Architecture — ce sont les mêmes règles de dépendance, deux façons de les dessiner. **Presentation** et **Infrastructure** sont les deux familles d'_adapters_ du modèle Ports & Adapters : la première regroupe les adapters **d'entrée** (driving), la seconde les adapters **de sortie** (driven).

| Couche         | Nom "Hexagonal"             | Nom "Clean Architecture"                           | Contenu                                                                                    | Dépend de   |
| -------------- | --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| Domain         | Core                        | Entities                                           | Entities, Value Objects, Aggregates, Domain Services, Domain Events                        | —           |
| Application    | Application                 | Use Cases                                          | Command/Query Handlers, Sagas, Ports (interfaces)                                          | Domain      |
| Presentation   | Adapters d'entrée (driving) | Interface Adapters (entrée)                        | Controllers REST, Resolvers GraphQL, Gateways WebSocket, CLI, DTOs, Guards, Pipes, Filters | Application |
| Infrastructure | Adapters de sortie (driven) | Interface Adapters (sortie) + Frameworks & Drivers | Repositories (impl), Mappers ORM, Event Publishers, clients externes, config               | Application |

Presentation et Infrastructure sont au même "niveau" dans l'hexagone — ni l'une ni l'autre n'est plus proche du domaine. Elles ne communiquent **jamais** directement entre elles ; tout passe par `application/` (CommandBus/QueryBus/EventBus).

**Ce qui vit typiquement dans `presentation/`** :

```typescript
// presentation/http/dto/create-order.dto.ts
export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

// presentation/guards/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // vérifie le token — zéro logique métier ici
    return true;
  }
}
```

Validation de DTO, guards, mapping HTTP → Command : tout ça est un souci de **présentation**, pas de métier. Le domaine ne sait même pas que HTTP existe.

---

## 3. Structure de dossiers de référence

```
src/
├── shared/                              # Kernel partagé (voir §5 — CCP/CRP)
│   ├── domain/
│   │   ├── base-entity.ts
│   │   ├── value-object.ts
│   │   └── domain-event.interface.ts
│   └── infrastructure/
│       ├── event-bus/
│       └── outbox/
│
├── modules/                             # 1 module = 1 Bounded Context (DDD)
│   └── order/                           # Bounded Context "Order"
│       ├── domain/                      # 🟢 CORE — zéro dépendance framework
│       │   ├── entities/
│       │   │   └── order.entity.ts
│       │   ├── value-objects/
│       │   │   ├── money.vo.ts
│       │   │   └── order-status.vo.ts
│       │   ├── aggregates/
│       │   │   └── order.aggregate.ts
│       │   ├── events/                  # Domain Events
│       │   │   └── order-placed.domain-event.ts
│       │   ├── services/                # Domain Services
│       │   │   └── pricing.domain-service.ts
│       │   ├── repositories/            # Ports de sortie (interfaces)
│       │   │   └── order.repository.ts
│       │   └── exceptions/
│       │       └── invalid-order.exception.ts
│       │
│       ├── application/                 # 🟡 Use Cases (CQRS)
│       │   ├── commands/
│       │   │   └── create-order/
│       │   │       ├── create-order.command.ts
│       │   │       └── create-order.handler.ts
│       │   ├── queries/
│       │   │   └── get-order-details/
│       │   │       ├── get-order-details.query.ts
│       │   │       └── get-order-details.handler.ts
│       │   ├── events/                  # Domain Event Handlers (internes)
│       │   │   └── order-placed.event-handler.ts
│       │   ├── sagas/
│       │   │   └── order-process.saga.ts
│       │   └── ports/                   # Autres ports de sortie
│       │       ├── payment-gateway.port.ts
│       │       └── event-publisher.port.ts
│       │
│       ├── presentation/                # 🔵 Adapters d'ENTRÉE (driving)
│       │   ├── http/
│       │   │   ├── order.controller.ts
│       │   │   └── dto/
│       │   │       ├── create-order.dto.ts
│       │   │       └── order-response.dto.ts
│       │   └── guards/
│       │       └── auth.guard.ts
│       │
│       ├── infrastructure/              # 🔴 Adapters de SORTIE (driven)
│       │   ├── persistence/
│       │   │   ├── order.orm-entity.ts
│       │   │   ├── order.mapper.ts
│       │   │   └── typeorm-order.repository.ts
│       │   └── messaging/
│       │       └── kafka-order-event.publisher.ts
│       │
│       └── order.module.ts              # Câblage DI — importe presentation/ ET infrastructure/
│
└── main.ts
```

---

## 4. Principes SOLID appliqués à NestJS

| Principe                      | Règle dans ce projet                                                                                                             | Exemple                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **S** — Single Responsibility | 1 Handler = 1 seule raison de changer. Ne jamais mélanger validation, logique métier et persistance dans une même classe.        | `CreateOrderHandler` orchestre uniquement — il délègue la logique au domaine                                                            |
| **O** — Open/Closed           | Étendre via un nouveau port/adapter, jamais en modifiant le domaine existant.                                                    | Ajouter un moyen de paiement = nouvel adapter `PaypalPaymentAdapter implements PaymentGatewayPort`, zéro ligne modifiée dans le domaine |
| **L** — Liskov Substitution   | Toute implémentation d'un port doit être interchangeable sans surprise.                                                          | `InMemoryOrderRepository` (tests) et `TypeOrmOrderRepository` (prod) doivent être 100% substituables                                    |
| **I** — Interface Segregation | Plusieurs ports petits et ciblés valent mieux qu'un `IRepository` générique fourre-tout.                                         | Séparer `OrderReader` / `OrderWriter` si un consommateur n'a besoin que de lire                                                         |
| **D** — Dependency Inversion  | Le **domaine définit** l'interface, l'**infra implémente**. Injection via token, jamais de classe concrète injectée directement. | voir exemple ci-dessous                                                                                                                 |

```typescript
// domain/repositories/order.repository.ts (le PORT — interface)
export interface OrderRepository {
  save(order: OrderAggregate): Promise<void>;
  findById(id: string): Promise<OrderAggregate | null>;
}
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

// order.module.ts, à la racine du Bounded Context (le câblage — DIP en action)
@Module({
  providers: [{ provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository }],
})
export class OrderModule {}

// application/commands/create-order/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository, // ← dépend de l'interface, pas de TypeOrm
  ) {}
}
```

---

## 5. Cohésion des packages — REP, CCP, CRP

Ces trois principes (Robert C. Martin) expliquent **pourquoi** on structure les dossiers par Bounded Context (§3) plutôt que par couche technique.

| Principe                            | Signification                                                                          | Application dans ce projet                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REP** — Reuse/Release Equivalence | L'unité de réutilisation = l'unité de release/version.                                 | `shared/` doit être versionnable comme un tout cohérent — si publié en package interne, chaque partie avance ensemble.                                                                                                 |
| **CCP** — Common Closure            | Les classes qui **changent pour la même raison** doivent être dans le **même module**. | `modules/order/` regroupe domain + application + infra d'Order **ensemble**, plutôt qu'un dossier global `controllers/`, un autre `repositories/`, etc. Un changement métier sur "Order" ne touche qu'un seul dossier. |
| **CRP** — Common Reuse              | Ne pas forcer un consommateur à dépendre de classes qu'il n'utilise pas.               | `shared/` reste petit et réellement transverse. Si seul `order/` utilise une classe, elle **reste dans** `order/` — pas dans `shared/` "au cas où".                                                                    |

⚠️ **Erreur classique à éviter** : structurer par type technique horizontal (`controllers/`, `services/`, `repositories/` au niveau racine). Ça viole CCP — un changement métier oblige à toucher N dossiers différents. Toujours structurer **par Bounded Context d'abord**, par couche hexagonale ensuite (§3).

---

## 6. Domain-Driven Design — briques tactiques

| Brique                     | Rôle                                                                | Règle NestJS                                                                                 |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Entity**                 | Objet avec identité, mutable dans le temps                          | Classe TS pure, **aucun** décorateur (`@Entity` TypeORM va sur une classe séparée, voir §12) |
| **Value Object**           | Objet défini par sa valeur, immutable, sans identité                | `readonly`, égalité par valeur, auto-validant dans son constructeur                          |
| **Aggregate**              | Cluster d'Entities/VOs avec une racine qui garantit la cohérence    | Étend `AggregateRoot` de `@nestjs/cqrs` pour lever des Domain Events (§8)                    |
| **Domain Service**         | Logique métier qui n'appartient à aucune Entity/VO individuellement | Classe pure, injectée dans un Handler applicatif — pas de dépendance framework               |
| **Repository (interface)** | Contrat d'accès à la persistance, vu depuis le domaine              | Interface dans `domain/repositories/` — jamais d'implémentation ici                          |
| **Domain Event**           | Fait métier qui vient de se produire, interne au Bounded Context    | Implémente `IEvent` de `@nestjs/cqrs`, levé via `aggregate.apply()`                          |

```typescript
// domain/value-objects/money.vo.ts
export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {
    if (amount < 0) throw new Error('Money amount cannot be negative');
  }
  static of(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }
  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('Currency mismatch');
    return Money.of(this.amount + other.amount, this.currency);
  }
}

// domain/aggregates/order.aggregate.ts
import { AggregateRoot } from '@nestjs/cqrs';

export class OrderAggregate extends AggregateRoot {
  private constructor(
    public readonly id: string,
    private status: OrderStatus,
  ) {
    super();
  }

  static create(customerId: string, items: OrderItem[]): OrderAggregate {
    const order = new OrderAggregate(crypto.randomUUID(), OrderStatus.PENDING);
    order.apply(new OrderPlacedDomainEvent(order.id, customerId, items));
    return order;
  }
}
```

**Application Service vs Domain Service** — distinction fréquemment confondue :

- **Domain Service** : logique métier pure (ex : calcul de remise) → vit dans `domain/`
- **Application Service** (= Command/Query Handler en CQRS) : orchestration technique (charger l'agrégat, appeler le domaine, sauvegarder, publier les events) → vit dans `application/`

---

## 7. CQRS avec `@nestjs/cqrs`

### Côté Command (écriture)

```typescript
// application/commands/create-order/create-order.command.ts
export class CreateOrderCommand implements ICommand {
  constructor(
    public readonly customerId: string,
    public readonly items: OrderItemDto[],
  ) {}
}

// application/commands/create-order/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    private readonly publisher: EventPublisher, // relie l'aggregate au vrai EventBus
  ) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    const order = this.publisher.mergeObjectContext(
      OrderAggregate.create(command.customerId, command.items),
    );
    await this.orderRepo.save(order);
    order.commit(); // dispatche les Domain Events accumulés par apply()
    return order.id;
  }
}
```

> `mergeObjectContext()` (depuis `EventPublisher`) est nécessaire : sans lui, `apply()` accumule bien les events, mais `commit()` ne sait pas où les publier.

### Côté Query (lecture)

```typescript
// application/queries/get-order-details/get-order-details.query.ts
export class GetOrderDetailsQuery implements IQuery {
  constructor(public readonly orderId: string) {}
}

// application/queries/get-order-details/get-order-details.handler.ts
@QueryHandler(GetOrderDetailsQuery)
export class GetOrderDetailsHandler implements IQueryHandler<GetOrderDetailsQuery> {
  constructor(private readonly readModel: OrderReadModelRepository) {}

  async execute(query: GetOrderDetailsQuery): Promise<OrderDetailsDto> {
    // lecture directe d'une projection — ne passe PAS par l'agrégat du domaine
    return this.readModel.findById(query.orderId);
  }
}
```

### Le Controller ne fait QUE router vers les bus

```typescript
// presentation/http/order.controller.ts
@Controller('orders')
export class OrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.commandBus.execute(
      new CreateOrderCommand(dto.customerId, dto.items),
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetOrderDetailsQuery(id));
  }
}
```

|                                 | Write Model (Command) | Read Model (Query)                                     |
| ------------------------------- | --------------------- | ------------------------------------------------------ |
| Passe par le domaine ?          | ✅ Oui, toujours      | ❌ Non, projection directe                             |
| Structure des données           | Normalisée, cohérente | Dénormalisée, optimisée pour l'affichage               |
| Peut être une base différente ? | —                     | ✅ Oui (ex : MongoDB en lecture, Postgres en écriture) |

---

## 8. Event-Driven Architecture

Rappel de la distinction :

|           | Domain Event                          | Integration Event                           |
| --------- | ------------------------------------- | ------------------------------------------- |
| Portée    | Interne au Bounded Context            | Traverse les services                       |
| Transport | `EventBus` (@nestjs/cqrs), en mémoire | Broker externe (Kafka, RabbitMQ...)         |
| Format    | Objet riche                           | Sérialisé (JSON), versionné, contrat public |

**Règle stricte : on ne publie JAMAIS un Domain Event brut sur le broker.** On le traduit.

```typescript
// application/ports/event-publisher.port.ts
export interface EventPublisherPort {
  publish(event: Record<string, unknown>): Promise<void>;
}
export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');

// domain/events/order-placed.domain-event.ts
export class OrderPlacedDomainEvent implements IEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// application/events/order-placed.event-handler.ts
@EventsHandler(OrderPlacedDomainEvent)
export class OrderPlacedHandler implements IEventHandler<OrderPlacedDomainEvent> {
  constructor(
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly integrationPublisher: EventPublisherPort,
  ) {}

  async handle(event: OrderPlacedDomainEvent): Promise<void> {
    await this.integrationPublisher.publish({
      eventType: 'OrderPlaced',
      eventVersion: '1.0',
      orderId: event.orderId,
      customerId: event.customerId,
      occurredAt: event.occurredAt.toISOString(),
    });
  }
}

// infrastructure/messaging/kafka-order-event.publisher.ts
@Injectable()
export class KafkaOrderEventPublisher implements EventPublisherPort {
  constructor(
    @Inject('ORDER_KAFKA_CLIENT') private readonly client: ClientKafka,
  ) {}

  async publish(event: Record<string, unknown>): Promise<void> {
    this.client.emit(event.eventType as string, JSON.stringify(event));
  }
}
```

**Sagas** (process managers) — réagissent à un event en déclenchant une nouvelle Command :

```typescript
// application/sagas/order-process.saga.ts
@Injectable()
export class OrderProcessSaga {
  @Saga()
  orderPlaced = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(OrderPlacedDomainEvent),
      map((event) => new ReserveStockCommand(event.orderId)),
    );
  };
}
```

**Outbox Pattern** (fiabilité) : pour garantir qu'un Integration Event est bien publié même en cas de crash, on l'écrit dans une table `outbox` **dans la même transaction DB** que l'agrégat, puis un processus séparé (relay/worker) lit cette table et publie vers le broker, en marquant l'entrée comme traitée. Ça évite le scénario "l'agrégat est sauvegardé mais l'event n'est jamais publié parce que l'app a crashé entre les deux". Dis-moi si tu veux l'implémentation complète (§16).

---

## 9. Design Patterns (GoF) appliqués à ce projet

Les couches et principes précédents définissent **où** vivent les choses. Les Design Patterns (Gang of Four) définissent **comment** résoudre un problème récurrent à l'intérieur d'une couche. Plusieurs sont déjà utilisés implicitement dans ce document :

| Pattern                             | Catégorie      | Déjà utilisé ici                                | Rôle                                                                             |
| ----------------------------------- | -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| **Factory** (static factory method) | Créationnel    | `OrderAggregate.create()` (§6)                  | Encapsule création + validation + levée du Domain Event ; constructeur `private` |
| **Adapter**                         | Structurel     | Toute la couche `infrastructure/` (§2)          | Traduit une lib externe (TypeORM, SDK Kafka) vers un port défini par le domaine  |
| **Mediator**                        | Comportemental | `CommandBus` / `QueryBus` / `EventBus` (§7, §8) | Découple l'émetteur (Controller) du récepteur (Handler)                          |
| **Command**                         | Comportemental | `CreateOrderCommand`, etc. (§7)                 | Encapsule une requête et ses données dans un objet exécutable                    |
| **Observer**                        | Comportemental | Domain Events / `@EventsHandler` (§8)           | Un Aggregate notifie des handlers sans les connaître                             |
| **Chain of Responsibility**         | Comportemental | Guards → Pipes → Interceptors → Filters (§2)    | Chaque maillon traite ou délègue à celui d'après                                 |

💡 D'autres patterns sont déjà gérés par NestJS — inutile de les ré-implémenter à la main : **Singleton** (scope par défaut d'un `@Injectable()`), **Dependency Injection** (conteneur IoC de Nest), **Facade** (un Module qui expose une API simple sur un sous-système complexe).

### Patterns à ajouter explicitement quand le besoin apparaît

**Strategy** — variantes d'algorithme métier interchangeables (renforce l'Open/Closed, §4) :

```typescript
// domain/services/pricing-strategy.interface.ts
export interface PricingStrategy {
  calculate(items: OrderItem[]): Money;
}

// domain/services/pricing.domain-service.ts
export class PricingService {
  constructor(private readonly strategy: PricingStrategy) {}
  price(items: OrderItem[]): Money {
    return this.strategy.calculate(items);
  }
}
```

**Specification** — règle métier ou critère de requête comme objet composable (AND/OR/NOT) :

```typescript
// domain/specifications/order-is-cancellable.specification.ts
export class OrderIsCancellableSpecification {
  isSatisfiedBy(order: OrderAggregate): boolean {
    return order.status === OrderStatus.PENDING;
  }
}
```

**Decorator** — ajouter un souci transverse (cache, retry, logging) à un Adapter sans le modifier :

```typescript
// infrastructure/persistence/cached-order.repository.ts
export class CachedOrderRepository implements OrderRepository {
  constructor(
    private readonly inner: OrderRepository, // le vrai TypeOrmOrderRepository
    private readonly cache: CacheService,
  ) {}

  async findById(id: string): Promise<OrderAggregate | null> {
    const cached = await this.cache.get(id);
    if (cached) return cached;
    const order = await this.inner.findById(id);
    if (order) await this.cache.set(id, order);
    return order;
  }

  save(order: OrderAggregate) {
    return this.inner.save(order);
  }
}
```

**Unit of Work** — garantir que l'Aggregate et son event (Outbox, §8) sont sauvegardés dans une seule transaction :

```typescript
// application/ports/unit-of-work.port.ts
export interface UnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>; // wrap dans une transaction DB
}
```

| Couche            | Patterns les plus fréquents                         |
| ----------------- | --------------------------------------------------- |
| `domain/`         | Factory, Strategy, Specification                    |
| `application/`    | Command, Mediator (via les bus)                     |
| `presentation/`   | Chain of Responsibility (Guards/Pipes/Interceptors) |
| `infrastructure/` | Adapter, Decorator, Unit of Work                    |

⚠️ Un pattern n'est pas une fin en soi. Ne pas introduire un Strategy pour une seule implémentation, ni un Decorator pour un souci qu'un Interceptor NestJS gère déjà nativement. Le critère : le pattern doit réduire la complexité, pas la déplacer.

---

## 10. Conventions de nommage

| Élément                           | Convention de fichier                      | Exemple                                 |
| --------------------------------- | ------------------------------------------ | --------------------------------------- |
| Entity (domaine)                  | `*.entity.ts`                              | `order.entity.ts`                       |
| Entity ORM                        | `*.orm-entity.ts`                          | `order.orm-entity.ts`                   |
| Value Object                      | `*.vo.ts`                                  | `money.vo.ts`                           |
| Aggregate                         | `*.aggregate.ts`                           | `order.aggregate.ts`                    |
| Domain Event                      | `*.domain-event.ts`                        | `order-placed.domain-event.ts`          |
| Integration Event                 | `*.integration-event.ts`                   | `order-placed.integration-event.ts`     |
| Domain Service                    | `*.domain-service.ts`                      | `pricing.domain-service.ts`             |
| Strategy                          | `*.strategy.ts`                            | `standard-pricing.strategy.ts`          |
| Specification                     | `*.specification.ts`                       | `order-is-cancellable.specification.ts` |
| Repository (port)                 | `*.repository.ts` (interface)              | `order.repository.ts`                   |
| Repository (adapter)              | `<techno>-*.repository.ts`                 | `typeorm-order.repository.ts`           |
| Command / Handler                 | `*.command.ts` / `*.handler.ts`            | `create-order.command.ts`               |
| Query / Handler                   | `*.query.ts` / `*.handler.ts`              | `get-order.query.ts`                    |
| Saga                              | `*.saga.ts`                                | `order-process.saga.ts`                 |
| Controller (HTTP)                 | `*.controller.ts`                          | `order.controller.ts`                   |
| Resolver (GraphQL)                | `*.resolver.ts`                            | `order.resolver.ts`                     |
| Gateway (WebSocket)               | `*.gateway.ts`                             | `order.gateway.ts`                      |
| Guard / Pipe / Filter             | `*.guard.ts` / `*.pipe.ts` / `*.filter.ts` | `auth.guard.ts`                         |
| Presenter (view-model, optionnel) | `*.presenter.ts`                           | `order.presenter.ts`                    |
| Module                            | `*.module.ts`                              | `order.module.ts`                       |
| DTO                               | `*.dto.ts`                                 | `create-order.dto.ts`                   |
| Mapper                            | `*.mapper.ts`                              | `order.mapper.ts`                       |
| Port (interface générique)        | `*.port.ts`                                | `payment-gateway.port.ts`               |

---

## 11. Stratégie de tests (alignée sur les couches)

| Couche                            | Type de test | Mocks nécessaires                          | Vitesse |
| --------------------------------- | ------------ | ------------------------------------------ | ------- |
| `domain/`                         | Unitaire pur | Aucun — logique pure                       | ⚡⚡⚡  |
| `application/`                    | Unitaire     | Mock des ports (repository, gateway...)    | ⚡⚡    |
| `presentation/`                   | Unitaire     | Mock du CommandBus/QueryBus                | ⚡⚡    |
| `infrastructure/`                 | Intégration  | Testcontainers (vraie DB/broker éphémères) | 🐢      |
| e2e (presentation → infra réelle) | End-to-end   | Environnement complet                      | 🐢🐢    |

Le domaine étant framework-agnostic, il se teste **sans jamais démarrer Nest** (pas besoin de `Test.createTestingModule` pour tester un Aggregate ou un Domain Service).

---

## 12. ❌ Interdictions strictes

1. **Jamais** de décorateur NestJS ou TypeORM (`@Injectable`, `@Entity`, `@Column`...) dans `domain/`.
2. **Jamais** injecter une implémentation concrète directement — toujours via le port + token (`@Inject(ORDER_REPOSITORY)`), jamais `@Inject(TypeOrmOrderRepository)`.
3. **Jamais** accéder à la DB depuis un Handler autrement que via un Repository (port).
4. **Jamais** publier un Domain Event brut sur le broker externe — toujours traduire en Integration Event (§8).
5. **Jamais** de logique métier dans `presentation/` (Controller, Resolver, Gateway) : cette couche valide le DTO, construit la Command/Query, l'envoie au bus, renvoie la réponse. Rien de plus.
6. **Jamais** faire dépendre le côté Query du domaine riche — les lectures interrogent une projection optimisée.
7. **Jamais** confondre l'Entity du domaine et l'Entity ORM — deux classes distinctes reliées par un `mapper.ts`.
8. **Jamais** laisser `shared/` grossir sans discipline — ça viole CRP (§5).
9. **Jamais** faire communiquer `presentation/` et `infrastructure/` directement (ex : un Controller qui injecte un Repository) — elles sont parallèles, tout passe par `application/`.

---

## 13. ✅ Checklist avant de générer du code

- [ ] La logique va dans `domain/` (si pure) ou `application/` (si orchestration) ?
- [ ] Le port (interface) est-il créé **avant** l'adapter (implémentation) ?
- [ ] Le nouveau code respecte-t-il CCP (tout ce qui concerne CE Bounded Context reste groupé) ?
- [ ] Un pattern GoF standard (§9) résout-il déjà ce problème avant d'inventer une solution ad-hoc ?
- [ ] Command (écriture) et Query (lecture) sont-elles bien séparées ?
- [ ] Si un Domain Event est levé, son/ses handler(s) sont-ils prévus ?
- [ ] Si l'event doit sortir du service, l'Integration Event correspondant est-il créé (pas juste renvoyé tel quel) ?
- [ ] Le domaine reste-t-il testable sans mock d'infrastructure ?
- [ ] `presentation/` ne dépend-elle que de `application/` (jamais directement de `infrastructure/`) ?

---

## 14. Exemple de flux complet — "Créer une commande"

```
1. POST /orders                              → OrderController (presentation/http/)
2. commandBus.execute(CreateOrderCommand)     → CQRS
3. CreateOrderHandler.execute()               → application/
4.   → OrderAggregate.create()                → domain/ (lève OrderPlacedDomainEvent via apply())
5.   → orderRepo.save(order)                  → port → TypeOrmOrderRepository (adapter de sortie)
6.   → order.commit()                         → dispatche le Domain Event sur l'EventBus interne
7. OrderPlacedHandler.handle()                → application/events/ (écoute le Domain Event)
8.   → traduit en OrderPlacedIntegrationEvent
9.   → integrationPublisher.publish()         → KafkaOrderEventPublisher (adapter de sortie)
10. Kafka                                     → Service Facturation, Stock, Notification (autres BC)
11. (en parallèle) OrderProcessSaga            → écoute OrderPlacedDomainEvent → déclenche ReserveStockCommand
```

Chaque flèche traverse une frontière de couche précise — c'est ce qui garantit que le domaine reste isolé et testable.

---

## 15. Commandes utiles (exemple générique — à adapter au `package.json` réel)

```bash
nest g module modules/order              # scaffold d'un nouveau Bounded Context
npm run test                             # tests unitaires (domain + application)
npm run test:e2e                         # tests end-to-end
npm run lint
npm run start:dev
```

---

## 16. Pour aller plus loin

- **ADP / SDP / SAP** : le second trio de principes de Robert Martin (couplage des packages, pas cohésion) — à ajouter si utile.
- **Anti-Corruption Layer** : pour isoler le domaine quand un service externe impose un modèle de données différent.
- **Outbox Pattern** : implémentation complète (table outbox + relay worker) — voir §8.
