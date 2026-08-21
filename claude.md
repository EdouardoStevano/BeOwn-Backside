# CLAUDE.md

> Aligné sur *BeOwn — Cahier des charges*, v1.0 (25/04/2026). Les Bounded Contexts et le langage métier ci-dessous reflètent le modèle du domaine réel du projet ; ils ne recopient pas mécaniquement le découpage en 12 modules fonctionnels du cahier des charges — un module de spécification n'est pas un Bounded Context. Voir §3.3 pour le détail des écarts assumés, délibérément.

## 1. Objectif du projet

Cette application doit être construite en appliquant **Domain-Driven Design (DDD)** de manière stricte.

Le projet est **BeOwn**, une plateforme d'investissement immobilier fractionné : des investisseurs souscrivent des obligations émises par des SPV (Special Purpose Vehicles) portant des opérations immobilières, et perçoivent intérêts et capital selon un échéancier contractuel. La plateforme opère sous statut réglementaire **PSFP** (Règlement UE 2020/1503), agréée AMF et supervisée par l'ACPR.

Le **Core Domain** du produit est le **Pré-investissement (Réservations)** : la capacité de verrouiller un engagement financier sur un projet ANNONCÉ mais pas encore PUBLIÉ, avec conversion automatique et rang prioritaire à l'ouverture de la collecte. Le cahier des charges le désigne lui-même comme le différenciateur concurrentiel du produit (§1.2, §4.5) — c'est là que la modélisation doit être la plus soignée, et là où l'effort d'ingénierie (tests, invariants, revue de code) doit être maximal.

L'objectif principal n'est pas simplement de créer une API fonctionnelle.

Le système doit :

- représenter explicitement le métier dans le code ;
- protéger les règles métier et les invariants ;
- maintenir une séparation claire entre les responsabilités ;
- minimiser le couplage entre les différents domaines ;
- permettre à l'application d'évoluer sans créer une architecture monolithique difficile à maintenir ;
- favoriser un langage métier commun entre les développeurs et les experts métier.

Toute décision technique doit respecter le domaine avant de privilégier la simplicité technique ou les détails d'infrastructure.

> Le code doit refléter le métier, et non l'infrastructure.

---

# 2. Principes fondamentaux

## 2.1 Domain First

Le domaine est le cœur du système.

Les concepts métier ne doivent jamais être définis en fonction :

- de la base de données ;
- de l'ORM ;
- du framework ;
- des contrôleurs HTTP ;
- des DTO ;
- de la structure JSON.

Exemple incorrect :

```ts
@Entity()
export class Investment {
  @Column()
  amount: number;
}
```

Une entité métier ne doit pas dépendre directement de l'ORM.

Préférer :

```ts
export class Investment {
  private constructor(
    private readonly id: InvestmentId,
    private amount: Money,
    private status: InvestmentStatus,
  ) {}

  public static create(
    id: InvestmentId,
    amount: Money,
  ): Investment {
    if (amount.isZeroOrNegative()) {
      throw new InvalidInvestmentAmountError();
    }

    return new Investment(
      id,
      amount,
      InvestmentStatus.pending(),
    );
  }
}
```

L'infrastructure adaptera ensuite cette entité à la persistance.

Cet agrégat `Investment` correspond au module Souscription / Investissement standard (M6 du cahier des charges) — voir §3.2 pour la carte complète des Bounded Contexts.

---

# 3. Bounded Contexts — stratégie de découpage

L'application doit être divisée en **Bounded Contexts**.

Un Bounded Context représente une frontière linguistique et métier — **pas** une frontière d'écran, et pas non plus un module de cahier des charges. Le cahier des charges BeOwn découpe le produit en 12 modules fonctionnels (M1 à M12, §4) pour les besoins de la spécification et de la recette ; ce découpage est un excellent point de départ métier, mais il ne doit **pas** être recopié tel quel comme architecture. Certains modules partagent un même concept métier et doivent fusionner, d'autres méritent au contraire d'être isolés parce qu'ils n'évoluent pas au même rythme, et certains modules ne sont pas des capacités métier du tout, mais des vues (back-office) ou des services techniques (notifications).

Ne pas découper les modules uniquement selon :

```text
controllers/
services/
repositories/
entities/
```

Le découpage principal doit être basé sur les capacités métier.

## 3.1 Sous-domaines : Core / Supporting / Generic

Avant de fixer les Bounded Contexts, on classe les capacités métier par valeur stratégique — c'est ce classement qui doit diriger où investir le plus de rigueur de modélisation, de tests, et de développeurs seniors.

| Sous-domaine | Type | Pourquoi |
|---|---|---|
| Pré-investissement (Réservations) | **Core** | Différenciateur explicite du cahier des charges (§1.2) : verrouillage de fonds (HOLD), rang FIFO, conversion automatique sur la fenêtre ANNONCÉ→PUBLIÉ. Aucun concurrent PSFP standard n'a ce mécanisme. |
| Souscription / Investissement | Support, adjacent au Core | Émission obligataire assez standard dans le secteur, mais fortement couplée au Core par la conversion des réservations. |
| Conformité (KYC/KYB + adéquation) | Support critique | Métier réglementé (PSFP art. 21, LCB-FT) ; différenciation faible, mais bloquant — aucune opération financière ne doit pouvoir le contourner. |
| Catalogue de projets & SPV | Support | Cycle de vie commercial d'un projet ; peu différenciant en soi. |
| Trésorerie / Wallets | Support | Orchestration des 5 types de wallets et réconciliation ; la brique de paiement elle-même est déléguée (Generic, voir ci-dessous). |
| Échéancier / Servicing | Support | Calcul des coupons, application de la fiscalité, détection des défauts. |
| Marché secondaire | Support | Fonctionnalité de liquidité, utile mais non cœur de l'offre initiale. |
| Documents & Signature | Support transversal | Utilisé par plusieurs contextes (bulletins, actes de cession, KIIS) — orchestration de Doclift/Universign. |
| Reporting réglementaire / Fiscalité | Support, essentiellement en lecture | Agrégation et mise en forme de données déjà produites par Conformité, Servicing et Marché secondaire. |
| Authentification & comptes | **Generic** | Résolu par des standards (OIDC/OAuth2, 2FA TOTP/WebAuthn) — cf. §6.2 du cahier des charges (Keycloak / Auth.js). |
| Vérification documentaire KYC/KYB | **Generic** | Sous-traitée (Smile Identity / Onfido / Stripe Identity). Ce qui reste propre à BeOwn — statut, catégorisation, gate d'accès — est Support, pas Generic (voir §3.2). |
| Paiement bas niveau, signature électronique, envoi d'email/SMS | **Generic** | Acheté (Stripe, Universign, Brevo, Twilio / Africa's Talking) — à isoler derrière des Anti-Corruption Layers (§20), jamais reconstruit. |

## 3.2 Bounded Contexts retenus

| Bounded Context | Agrégat(s) racine | Module(s) cahier des charges | Rôle |
|---|---|---|---|
| `reservation` | `Reservation`, `ReservationCapacity` | M5 | **Core.** Engagement financier verrouillé, rang, conversion. |
| `subscription` | `Investment` | M6 (+ reçoit la conversion issue de M5) | Souscription signée, échéancier déclenché à la signature. |
| `compliance` | `InvestorComplianceProfile` (entités `KycCase`, `AdequacyAssessment`) | M2 + M3 | Éligibilité réglementaire : KYC/KYB, catégorisation Averti/Non-averti, questionnaire d'adéquation. |
| `catalog` | `RealEstateProject` (référence `Spv`) | M4 | Cycle de vie commercial d'un projet, fiche, cible de collecte. |
| `identity` | `UserAccount` | M1 | Compte, identifiants, sessions, 2FA. |
| `treasury` | `Wallet` | M7 | 5 types de wallets, MoneyIn/MoneyOut/MassPay, réconciliation. |
| `servicing` | `RepaymentSchedule` (entité `Echeance`) | M8 | Échéancier, calcul des coupons, retenue à la source, défauts. |
| `secondary-market` | `SecondaryMarketOrder` | M9 | Cession d'obligations, carnet d'ordres, registre des porteurs. |
| `documents` | `SignableDocument` | transversal (M5, M6, M9, M11) | Génération de documents et signature électronique — capacité partagée, absente en tant que telle du découpage en modules. |
| `regulatory-reporting` | *(surtout des projections en lecture)* | M11 + §2.6/2.7 | Reporting AMF, IFU, gestion extinctive. |

Structure de dossiers correspondante :

```text
src/
├── identity/
├── compliance/
├── catalog/
├── reservation/
├── subscription/
├── treasury/
├── servicing/
├── secondary-market/
├── documents/
└── regulatory-reporting/
```

Chaque Bounded Context possède :

- son propre modèle métier ;
- son propre langage ;
- ses propres règles ;
- ses propres agrégats ;
- ses propres repositories ;
- ses propres événements.

Deux contextes ne doivent pas partager directement leurs entités métier.

Interdit :

```ts
import { UserAccount } from '../../identity/domain/entities/user-account.entity';
```

dans un autre domaine.

Préférer l'utilisation :

- d'identifiants (`InvestorId`, `ProjectId`, `ReservationId`…) ;
- d'événements ;
- de contrats explicites ;
- d'Anti-Corruption Layers.

## 3.3 Écarts assumés par rapport au découpage en modules du cahier des charges

Le cahier des charges n'est pas la spécification finale de l'architecture — c'est un point de départ métier à challenger, comme le rappelle la consigne d'origine de ce document. Voici les écarts délibérés, et pourquoi :

- **M2 + M3 fusionnés dans `compliance`.** Le cahier des charges les présente comme deux modules, mais RG-KYC-13 indique explicitement que la catégorisation KYC *provient* du questionnaire d'adéquation (M3) — c'est un seul concept métier (« l'investisseur est-il éligible, et pour quoi »), pas deux. Les séparer créerait une dépendance cyclique entre deux Bounded Contexts pour un seul agrégat conceptuel.
- **M5 et M6 restent deux Bounded Contexts distincts** (`reservation` et `subscription`) malgré leur forte proximité fonctionnelle, précisément *parce que* le cahier des charges qualifie M5 de différenciateur stratégique méritant « une attention particulière » (§1.2, §4.5). Isoler `reservation` lui permet d'évoluer à son propre rythme sans faire porter ce risque au module de souscription, plus standard et plus stable. Alternative valable pour une petite équipe : fusionner en un seul contexte avec un agrégat `Commitment` à deux variantes (`PRE_INVESTMENT` / `DIRECT`) — à n'envisager que si le Core Domain cesse d'être une priorité produit.
- **`documents` est un Bounded Context ajouté**, absent du découpage en modules. Le cahier des charges fait référence à trois reprises à de la génération de documents et de la signature électronique (bulletin M5/M6, acte de cession M9, KIIS/IFU M4/M11) sans jamais le regrouper — traité comme un détail d'implémentation dans chaque module. En pratique c'est une capacité récurrente avec ses propres règles (qui signe quoi, avec quel OTP, avec quelle durée d'archivage légal) : elle mérite son propre modèle plutôt que d'être dupliquée trois fois.
- **M10 (Notifications) n'est pas modélisé comme un Bounded Context.** Le catalogue d'emails (§4.10.1, ≈25 templates) est une table déclencheur → template → destinataire sans règle métier propre ; c'est un abonné technique aux événements de domaine des autres contextes, pas une capacité métier avec ses propres agrégats. Le modéliser comme un Bounded Context à part entière produirait l'équivalent, à l'échelle stratégique, d'un Anemic Domain Model (§7).
- **M12 (Back-Office Administrateur) n'est pas un Bounded Context.** C'est une application de présentation interne (rôles/permissions RCCI, Ops, Finance, Compliance, Support — §4.12.2 du cahier des charges) qui orchestre des Commands et Queries à travers `identity`, `compliance`, `catalog`, `reservation`, `subscription`, `treasury`, `servicing`, `secondary-market`, `documents` et `regulatory-reporting`. La logique métier doit rester dans ces contextes ; le back-office n'implémente que du RBAC et de la composition d'écrans.
- **`regulatory-reporting` a volontairement un domaine « fin ».** L'essentiel de M11 (rapports AMF, IFU) est un calcul déjà fait ailleurs — les intérêts et la retenue à la source sont calculés par `servicing` (RG-ECH-04/05) — puis mis en forme et agrégé. Ne pas dupliquer ce calcul : construire ce contexte comme des projections/read models alimentés par les événements des autres contextes (§11, Queries), avec un petit noyau de règles propres réservé à la gestion extinctive (run-off, §2.6), qui a un véritable cycle de vie.
- **Le site public / marketing n'a pas de Bounded Context.** C'est du contenu éditorial (CMS, SEO, blog, FAQ) qui vit en *Separate Ways* : il consomme en lecture seule les données publiques de `catalog`, sans dépendance dans l'autre sens.

## 3.4 Context Map

Relations entre Bounded Contexts, avec le pattern DDD correspondant :

```text
compliance  →  reservation, subscription, secondary-market
            (Customer/Supplier — fournit l'éligibilité de l'investisseur)

catalog  →  reservation, subscription
         (Customer/Supplier — fournit statut du projet et cible de collecte)

reservation  →  subscription
             (événement publié : ReservationConverted)

reservation  →  documents, treasury
             (Customer/Supplier — bulletin pré-rempli, HOLD des fonds)

subscription  →  servicing
              (événement publié : InvestmentSigned)

servicing  →  treasury
           (Customer/Supplier — déclenche MassPay)

secondary-market  →  subscription, servicing
                  (événement publié : BondTransferred)

treasury  →  Stripe
          (Anti-Corruption Layer + Conformist)

documents  →  Universign, Doclift
           (Anti-Corruption Layer)

tous les contextes  →  notifications
                    (Published Language — abonné pur, jamais en amont)

tous les contextes  →  regulatory-reporting
                    (lecture seule — jamais en amont)

back-office  →  *
             (client de tous les contextes : Commands/Queries, aucune logique métier)
```

Remarques :

- `compliance` et `catalog` sont **en amont (upstream/supplier)** de plusieurs contextes : ils publient des faits (`InvestorKycValidated`, `InvestorKycInvalidated`, `ProjectPublished`) que les contextes en aval consomment sans jamais réécrire l'agrégat source.
- La relation `reservation → subscription` est un **Customer/Supplier asynchrone** : `subscription` ne connaît jamais l'agrégat `Reservation`, seulement l'événement `ReservationConverted` et son contrat (Published Language).
- `treasury` est **Conformist** vis-à-vis de Stripe (BeOwn adopte son modèle de wallets/webhooks) mais protège son propre domaine par une **Anti-Corruption Layer** (§20).
- `notifications` et `regulatory-reporting` ne sont **jamais en amont** de quoi que ce soit. Si un jour un contexte métier a besoin de lire une donnée de reporting pour prendre une décision (ce n'est pas le cas aujourd'hui), c'est le signal que la frontière a été mal tracée.

---

# 4. Ubiquitous Language

Tous les noms importants du code doivent provenir du langage métier.

Ne pas utiliser des noms techniques lorsque le métier possède un terme précis.

Incorrect :

```ts
processData()
handleItem()
manageEntity()
updateStatus()
```

Préférer (comportements réels de BeOwn) :

```ts
convertReservation()
holdFunds()
signInvestment()
distributeCoupon()
closeCollection()
validateKycCase()
```

Les noms suivants doivent être cohérents :

- classes ;
- méthodes ;
- événements ;
- commandes ;
- requêtes ;
- erreurs ;
- tests.

Le code doit pouvoir être compris par une personne connaissant le métier — en l'occurrence, le RCCI, l'équipe Ops ou l'auteur du cahier des charges doivent reconnaître le vocabulaire.

## 4.1 Glossaire métier → code (extrait)

Le cahier des charges (§1.5) fournit déjà un glossaire ; en voici la traduction directe vers des identifiants de code, à utiliser tels quels — ne pas franciser à moitié, ne pas inventer de synonymes.

| Terme métier (cahier des charges) | Identifiant de code | Bounded Context |
|---|---|---|
| Réservation / Pré-investissement | `Reservation` | `reservation` |
| HOLD (fonds verrouillés) | `Wallet.hold()` / `HeldFunds` | `treasury` |
| Rang (file d'attente) | `Rank` (Value Object) | `reservation` |
| SPV | `Spv` | `catalog` |
| Obligation | `Bond` (au sein de `Investment`) | `subscription` |
| Bulletin de souscription | `SubscriptionAgreement` (`SignableDocument`) | `documents` |
| KIIS | `Kiis` (`SignableDocument`) | `catalog` / `documents` |
| Échéancier | `RepaymentSchedule` | `servicing` |
| Échéance / Coupon | `Echeance` | `servicing` |
| Wallet | `Wallet` | `treasury` |
| MoneyIn / MoneyOut / MassPay | méthodes de `Wallet` / port `PaymentGateway` | `treasury` |
| Investisseur Averti / Non-averti | `InvestorCategory` (Value Object) | `compliance` |
| Gestion extinctive (Run-off) | `RunOffPlan` | `regulatory-reporting` |
| Marché secondaire | `SecondaryMarketOrder` | `secondary-market` |
| IFU | read model, pas d'agrégat dédié | `regulatory-reporting` |

---

# 5. Architecture générale

Chaque Bounded Context doit suivre la structure suivante (exemple : `reservation/`) :

```text
reservation/
│
├── domain/
│   ├── aggregates/
│   ├── entities/
│   ├── value-objects/
│   ├── domain-services/
│   ├── events/
│   ├── repositories/
│   ├── policies/
│   ├── specifications/
│   └── errors/
│
├── application/
│   ├── commands/
│   ├── queries/
│   ├── handlers/
│   ├── ports/
│   ├── dto/
│   └── services/
│
├── infrastructure/
│   ├── persistence/
│   ├── repositories/
│   ├── messaging/
│   ├── external-services/
│   └── configuration/
│
└── presentation/
    ├── http/
    ├── graphql/
    ├── consumers/
    └── controllers/
```

Les dépendances doivent respecter :

```text
Presentation
      ↓
Application
      ↓
Domain

Infrastructure → Application / Domain
```

Le domaine ne dépend jamais :

- de l'application ;
- de l'infrastructure ;
- du framework ;
- de la base de données.

---

# 6. Agrégats

Les agrégats sont les unités principales de cohérence métier.

Chaque agrégat possède un seul **Aggregate Root**.

### Exemple travaillé : capacité et rang de réservation

RG-RES-05 (plafond global de réservation = 80 % de la cible par projet) et RG-RES-07 (rang = ordre chronologique) sont deux invariants qui portent sur **l'ensemble des réservations d'un même projet**, pas sur une réservation isolée. Les faire vivre entièrement à l'intérieur de l'agrégat `Reservation` obligerait à charger et verrouiller toutes les réservations existantes d'un projet à chaque nouvelle demande — ni petit, ni scalable (règle 6.1, point 5, ci-dessous).

On introduit donc un agrégat dédié, minuscule, propriétaire de ces deux invariants :

```text
ReservationCapacity (1 par Project)
│
├── target: Money              (cible du projet)
├── reserved: Money            (somme déjà verrouillée)
├── nextRank: Rank
│
└── allocate(amount) → Rank    (ou lève ReservationCapacityExceededError)
```

```text
Reservation (Aggregate Root séparé)
│
├── id: ReservationId
├── projectId: ProjectId       (référence, pas d'import d'agrégat)
├── investorId: InvestorId
├── amount: Money
├── rank: Rank                 (obtenu via ReservationCapacity.allocate)
└── status: ReservationStatus
```

`ReservationCapacity` protège l'invariant transactionnellement (une seule ligne à verrouiller par projet) ; `Reservation` reste un agrégat indépendant, à la durée de vie propre (annulation, expiration, conversion), qui référence `ReservationCapacity` uniquement au moment de sa création.

> ⚠️ **Point de vigilance** : le cahier des charges se contredit lui-même sur la nature du rang. RG-RES-07 (§4.5.2) dit « ordre chronologique d'enregistrement (FIFO) », mais le dictionnaire de données (§7.3.3, champ `rang_file`) précise « ordre dans la file d'attente (**FIFO + critère de score**) ». Ne pas coder en dur un tri FIFO strict dans `ReservationCapacity` : exposer l'attribution du rang derrière une **Policy** injectable (§22) pour absorber la clarification à venir sans re-architecturer l'agrégat.

Le code externe ne doit modifier l'état interne qu'à travers l'Aggregate Root.

Incorrect :

```ts
reservation.status = 'CONVERTED';
```

Préférer :

```ts
reservation.convert();
```

Ou, quand l'opération implique l'agrégat de capacité :

```ts
reservationCapacity.release(reservation.id);
```

---

## 6.1 Règles des agrégats

Un agrégat doit :

1. protéger ses invariants ;
2. contrôler les modifications de son état ;
3. exposer des comportements métier ;
4. être chargé et sauvegardé comme une unité de cohérence ;
5. être aussi petit que possible.

Ne jamais créer un agrégat géant uniquement parce que plusieurs entités sont liées dans la base de données.

Une relation SQL ne signifie pas automatiquement une relation d'agrégat.

---

## 6.2 Références entre agrégats

Les agrégats doivent se référencer principalement par leur identité.

Incorrect :

```ts
class Reservation {
  private investor: InvestorComplianceProfile;
}
```

Préférer :

```ts
class Reservation {
  private readonly investorId: InvestorId;
  private readonly projectId: ProjectId;
}
```

Cela évite :

- les agrégats géants ;
- les chargements excessifs ;
- les dépendances fortes ;
- les transactions complexes.

---

# 7. Entities

Une Entity possède une identité stable.

Deux entités peuvent avoir les mêmes propriétés mais rester différentes.

```ts
const investment1 = Investment.create(id1, ...);
const investment2 = Investment.create(id2, ...);
```

Même si les données sont identiques :

```text
investment1 ≠ investment2
```

Les entités doivent contenir du comportement métier.

Incorrect :

```ts
class Investment {
  amount: number;
  status: string;
}
```

Correct :

```ts
class Investment {
  public sign(): void {
    if (!this.canBeSigned()) {
      throw new InvestmentCannotBeSignedError();
    }

    this.status = InvestmentStatus.signed();

    this.addDomainEvent(
      new InvestmentSigned(this.id, this.investorId, this.projectId),
    );
  }

  public cancel(): void {
    // RG-INV-11 : cible de collecte non atteinte → remboursement intégral
    if (!this.canBeCancelled()) {
      throw new InvestmentCannotBeCancelledError();
    }

    this.status = InvestmentStatus.cancelled();
  }
}
```

> Noter `sign()`, pas `approve()` : le cahier des charges (RG-INV-06) décrit une signature électronique en self-service (Universign + OTP), pas une validation manuelle interne. Le pattern « approbation par un tiers » existe bien chez BeOwn, mais côté `compliance`, pour la validation KYC par le RCCI (RG-KYC-07) — voir §9.

Éviter les **Anemic Domain Models**.

---

# 8. Value Objects

Un Value Object :

- n'a pas d'identité ;
- est défini par sa valeur ;
- doit être immutable ;
- doit encapsuler ses règles de validation.

Exemple :

```ts
export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {}

  public static create(
    amount: number,
    currency: Currency,
  ): Money {
    if (amount < 0) {
      throw new InvalidMoneyError();
    }

    return new Money(amount, currency);
  }

  public add(other: Money): Money {
    this.ensureSameCurrency(other);

    return Money.create(
      this.amount + other.amount,
      this.currency,
    );
  }
}
```

Ne pas utiliser :

```ts
number
string
boolean
```

lorsqu'un concept métier important mérite son propre type.

Exemples (BeOwn) :

```text
Money
Email
PhoneNumber
InvestorId
ProjectId
ReservationId
WalletId
Rank
Percentage
KycStatus
InvestorCategory
ProjectStatus
BondQuantity
```

> `BondQuantity`, pas `ShareQuantity` : BeOwn est exclusivement obligataire, le modèle equity/actions est explicitement hors périmètre (§1.4.3 du cahier des charges). Un Value Object nommé « Share » introduirait un contresens métier dans le code.

---

# 9. Domain Services

Un Domain Service doit être utilisé lorsqu'une logique métier :

- n'appartient naturellement à aucune Entity ;
- n'appartient naturellement à aucun Value Object ;
- implique plusieurs concepts métier.

Exemple :

```ts
class CouponDistributionService {
  distribute(
    schedule: RepaymentSchedule,
    treasury: PaymentGateway,
  ): CouponDistribution {
    // calcul du net après retenue à la source (RG-ECH-04/05),
    // puis déclenchement du MassPay via treasury
  }
}
```

> Nommé `CouponDistributionService`, pas `DividendDistributionService` : BeOwn distribue des coupons d'obligations, pas des dividendes d'actions. C'est exactement le genre de glissement de vocabulaire équity/obligataire qu'un Domain Service mal nommé finit par introduire silencieusement dans le reste du code.

Un Domain Service ne doit pas devenir un simple conteneur de logique.

Incorrect :

```ts
class ReservationService {
  create() {}
  update() {}
  delete() {}
}
```

Ce type de service est généralement un signe d'un modèle de domaine anémique.

---

# 10. Repositories

Un Repository représente une collection d'agrégats.

Il ne doit pas être une abstraction générique de la base de données.

Incorrect :

```ts
interface IRepository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T>;
  create(data: T): Promise<T>;
  update(data: T): Promise<T>;
  delete(id: string): Promise<void>;
}
```

Préférer des repositories orientés métier :

```ts
interface InvestmentRepository {
  findById(
    id: InvestmentId,
  ): Promise<Investment | null>;

  save(
    investment: Investment,
  ): Promise<void>;
}

interface ReservationRepository {
  findById(
    id: ReservationId,
  ): Promise<Reservation | null>;

  findActiveByProject(
    projectId: ProjectId,
  ): Promise<Reservation[]>;

  save(
    reservation: Reservation,
  ): Promise<void>;
}
```

Le Repository travaille principalement avec les Aggregate Roots.

---

# 11. CQRS

L'application utilise CQRS lorsque cela apporte une séparation claire entre :

- les intentions qui modifient l'état ;
- les opérations de lecture.

## Commands

Une Command représente une intention métier.

Exemple :

```text
SignInvestmentCommand
CreateReservationCommand
ConvertReservationCommand
PublishProjectCommand
```

Une Command ne retourne généralement pas le modèle métier complet.

Structure :

```text
application/
└── commands/
    └── sign-investment/
        ├── sign-investment.command.ts
        └── sign-investment.handler.ts
```

Le handler :

1. récupère l'agrégat ;
2. appelle son comportement métier ;
3. persiste les changements ;
4. publie les événements nécessaires.

---

## Queries

Une Query représente une demande de lecture.

Exemple :

```text
GetInvestmentByIdQuery
ListInvestorInvestmentsQuery
GetReservationRankQuery
GetProjectFundingSummaryQuery
```

Les Queries ne doivent pas modifier l'état métier.

Les Queries peuvent utiliser :

- projections ;
- SQL optimisé ;
- read models ;
- vues matérialisées.

Une Query n'a pas besoin de reconstruire un Aggregate complet. C'est précisément ainsi que doit être construit `regulatory-reporting` (§3.3) : entièrement en Queries/projections plutôt qu'en agrégats dupliquant des calculs déjà faits ailleurs.

---

# 12. Domain Events

Un événement représente un fait métier déjà arrivé.

Les événements doivent être nommés au passé.

Incorrect :

```text
ConvertReservation
SignInvestment
```

Correct :

```text
ReservationConverted
InvestmentSigned
ProjectPublished
EcheanceDisbursed
```

Un événement doit être déclenché par le domaine.

Exemple :

```ts
public convert(): void {
  if (!this.canBeConverted()) {
    throw new ReservationCannotBeConvertedError();
  }

  this.status = ReservationStatus.converted();

  this.addDomainEvent(
    new ReservationConverted(
      this.id,
      this.investorId,
      this.projectId,
      this.amount,
    ),
  );
}
```

---

# 13. Communication entre Bounded Contexts

Un Bounded Context ne doit pas appeler directement les entités internes d'un autre contexte.

Préférer :

```text
Domain Event
      ↓
Event Handler
      ↓
Application Service
      ↓
Autre Bounded Context
```

Exemple (BeOwn) :

```text
ReservationConverted
        ↓
subscription Context
        ↓
CreateInvestmentFromReservation
```

Lorsque deux modèles utilisent des concepts différents, utiliser une **Anti-Corruption Layer**.

```text
External Context
       ↓
Anti-Corruption Layer
       ↓
Internal Domain Model
```

Ne jamais laisser un modèle externe contaminer directement le domaine interne.

---

# 14. Application Layer

La couche Application orchestre les cas d'utilisation.

Elle ne doit pas contenir la logique métier fondamentale.

Responsabilités :

- recevoir une Command ou Query ;
- charger les agrégats ;
- appeler les comportements métier ;
- gérer les transactions ;
- persister les agrégats ;
- déclencher l'intégration nécessaire.

Incorrect :

```ts
async execute(command) {
  if (investment.status !== 'PENDING_SIGNATURE') {
    throw new Error();
  }

  investment.status = 'SIGNED';
}
```

Correct :

```ts
async execute(command: SignInvestmentCommand) {
  const investment =
    await this.repository.findById(command.investmentId);

  if (!investment) {
    throw new InvestmentNotFoundError();
  }

  investment.sign();

  await this.repository.save(investment);
}
```

La règle métier reste dans :

```text
investment.sign()
```

---

# 15. Infrastructure Layer

L'infrastructure contient les détails techniques.

Stack retenue par le cahier des charges (§6.2) :

```text
PostgreSQL 16
Prisma 5 ou TypeORM
Redis 7
RabbitMQ ou Kafka
MinIO (driver S3-compatible) — Scaleway / OVHcloud Object Storage en prod, instance auto-hébergée en dev/test
Stripe (paiements, wallets)
Universign (signature électronique eIDAS)
Doclift (génération de documents)
Brevo (email transactionnel)
Keycloak ou Auth.js (identité)
JWT
```

> ⚠️ Ne pas utiliser AWS (S3 ou autre service) : le cahier des charges impose un hébergement exclusivement européen (§2.5 RGPD — « pas de transfert hors UE ») et recommande explicitement Scaleway/OVHcloud (§10.2.1). Un `import` du AWS SDK dans le code serait à lui seul un signal de non-conformité.
>
> Le driver de stockage retenu est le client `minio` (SDK officiel MinIO, protocole S3), pas le SDK AWS — les deux savent parler à un endpoint S3-compatible, mais seul le premier évite une dépendance directe à l'écosystème Amazon. En développement/test, ce même driver pointe vers une instance MinIO auto-hébergée (ex. conteneur Docker local) ; en production, il pointe vers Scaleway ou OVHcloud Object Storage (§10.2.1) — c'est exactement la portabilité que le protocole S3 est censé offrir, à condition que le code applicatif ne dépende que du driver, jamais de l'un des deux fournisseurs en particulier (cf. §20).

L'infrastructure implémente les abstractions définies par le cœur de l'application.

Exemple :

```text
Domain/Application
        ↓
InvestmentRepository
        ↑
Infrastructure
        ↓
PostgresInvestmentRepository
```

L'infrastructure ne doit pas définir le modèle métier.

---

# 16. ORM

L'ORM est un détail d'infrastructure.

Les modèles ORM ne doivent pas être automatiquement considérés comme des Domain Entities.

Créer des mappers lorsque nécessaire :

```text
Persistence Model
        ↓
Mapper
        ↓
Domain Aggregate
```

et :

```text
Domain Aggregate
        ↓
Mapper
        ↓
Persistence Model
```

---

# 17. Transactions

Une transaction doit principalement correspondre à la modification d'un Aggregate.

Éviter :

```text
Transaction
├── UserAccount
├── RealEstateProject
├── Reservation
├── Wallet
└── RepaymentSchedule
```

Préférer :

```text
Transaction
└── Reservation Aggregate
```

Les interactions avec d'autres agrégats ou contextes doivent utiliser, lorsque nécessaire :

- Domain Events ;
- Integration Events ;
- Saga ;
- Process Manager ;
- Outbox Pattern.

---

# 18. Eventual Consistency

Ne pas forcer une transaction ACID globale lorsque plusieurs Bounded Contexts sont impliqués.

Exemple (BeOwn) :

```text
reservation Context
        │
        │ ReservationConverted
        ▼
subscription Context
        │
        │ InvestmentSigned
        ▼
servicing Context
        │
        │ RepaymentScheduleGenerated
        ▼
notifications (abonné technique, pas un Bounded Context — cf. §3.3)
```

Le système peut être éventuellement cohérent entre différents Bounded Contexts.

Cependant, les invariants critiques (RG-RES-05, RG-RES-07) doivent rester cohérents à l'intérieur d'un même Aggregate — c'est précisément le rôle de `ReservationCapacity` (§6).

---

# 19. Outbox Pattern

Lorsqu'un événement doit être publié après une modification transactionnelle :

```text
Database Transaction
│
├── Aggregate Updated
│
└── Outbox Event Saved
        ↓
Transaction Commit
        ↓
Background Publisher
        ↓
Message Broker
```

Ne jamais faire :

```ts
await repository.save(reservation);

await messageBroker.publish(new ReservationConverted(...));
```

si la fiabilité transactionnelle est critique — et sur `reservation`, elle l'est toujours : un `ReservationConverted` perdu signifie un investisseur qui a payé sans jamais recevoir son obligation.

Utiliser l'Outbox Pattern.

---

# 20. Anti-Corruption Layer

Toute intégration avec un système externe doit passer par une couche d'adaptation.

Exemple (BeOwn) :

```text
Stripe API
        ↓
StripeGatewayAdapter
        ↓
PaymentGateway Port
        ↓
treasury (Application / Domain)
```

Même logique pour le stockage de fichiers, utilisé par plusieurs contextes (`documents` pour les documents signés, `compliance` pour les pièces KYC/KYB, `catalog` pour les photos/vidéos et le KIIS) :

```text
MinIO (driver S3)
        ↓
MinioStorageAdapter
        ↓
FileStoragePort
        ↓
documents / compliance / catalog (Application / Domain)
```

> Chaque contexte définit son **propre** port, à son propre niveau métier — `DocumentStoragePort` dans `documents`, potentiellement `KycDocumentStoragePort` dans `compliance` avec ses propres règles de rétention (RG-KYC-10 : 5 ans pour les pièces KYC ; RG-Q-07 : 10 ans pour le questionnaire d'adéquation signé). `MinioStorageAdapter`, lui, est un détail purement technique — stocker et lire des octets à une clé, sans aucune notion métier — et peut donc être partagé entre les infrastructures de plusieurs contextes sans violer les frontières du §3, à condition que chaque contexte y accède via son propre port et jamais directement. Ne pas confondre ce partage d'un adaptateur technique avec le Shared Kernel du §25, qui est un partage de concepts de *modélisation du domaine* (`AggregateRoot`, `DomainEvent`…) — deux choses de nature différente, même si les deux sont « partagés ».

Le domaine ne doit jamais connaître directement :

```text
Stripe
Universign
Doclift
Brevo
MinIO
PostgreSQL
NestJS
TypeORM / Prisma
```

---

# 21. Domain Errors

Les erreurs métier doivent être explicites.

Incorrect :

```ts
throw new Error('Invalid');
```

Correct :

```ts
throw new ReservationCapacityExceededError();
```

Le cahier des charges définit déjà les codes d'erreur HTTP exposés côté API (Annexe B) — les erreurs de domaine doivent s'y mapper 1:1 dans la couche presentation, sans que le domaine lui-même ne connaisse ces codes (§20, même logique qu'une Anti-Corruption Layer, mais en sortie) :

| Domain Error | Bounded Context | Code Annexe B |
|---|---|---|
| `ReservationCapacityExceededError` | `reservation` | `RESERVATION_FULL` |
| `ProjectNotOpenForReservationError` | `reservation` / `catalog` | `PROJECT_NOT_OPEN` |
| `InvestorNotEligibleError` | `compliance` | `KYC_PENDING` / `ADEQUATION_REQUIRED` |
| `InvalidInvestmentAmountError` | `subscription` | `TICKET_BELOW_MIN` / `TICKET_ABOVE_MAX` |
| `InsufficientWalletBalanceError` | `treasury` | `WALLET_INSUFFICIENT` |
| `WalletFrozenError` | `treasury` | `WALLET_FROZEN` |
| `InvestmentAlreadySignedError` | `subscription` | — (absent de l'annexe actuelle : à faire ajouter côté cahier des charges) |

Les erreurs techniques doivent rester séparées des erreurs métier.

---

# 22. Specifications et Policies

Utiliser une **Specification** lorsqu'une règle métier représente un critère réutilisable.

Exemple :

```ts
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}
```

Exemple (BeOwn) :

```text
EligibleInvestorSpecification            (KYC_VALIDATED + adéquation valide + catégorie compatible — RG-RES-03 et RG-INV-01, même règle des deux côtés)
ProjectOpenForReservationSpecification   (statut ANNONCE + estPreInvestissable = true)
ProjectOpenForSubscriptionSpecification  (statut PUBLIE — RG-INV : « investir sur un projet PUBLIE en cours de collecte »)
TicketWithinBoundsSpecification          (RG-INV-02 / RG-INV-03)
```

> Renommée `EligibleInvestorSpecification` (et non `EligibleForReservationSpecification`) : RG-RES-03 (`reservation`) et RG-INV-01 (`subscription`) imposent exactement la même condition d'éligibilité — un nom scopé à un seul contexte aurait invité à la dupliquer plutôt qu'à la réutiliser.

Utiliser une **Policy** lorsqu'une règle métier peut varier selon :

- le contexte ;
- la configuration métier ;
- une stratégie métier.

### Exemple à retenir en priorité : `ReservationRankingPolicy`

C'est le cas d'école du chapitre. RG-RES-07 dit « FIFO », mais le dictionnaire de données (§7.3.3) mentionne un critère de score additionnel — deux sources internes au même cahier des charges se contredisent (voir aussi la remarque en §6). Plutôt que de figer un tri dans `ReservationCapacity.allocate()`, extraire :

```ts
interface ReservationRankingPolicy {
  rank(
    pending: ReservationRequest,
    existing: ReservationSummary[],
  ): Rank;
}
```

avec une implémentation `FifoRankingPolicy` par défaut, remplaçable sans toucher à l'agrégat `ReservationCapacity` le jour où le critère de score est clarifié avec le client.

---

# 23. Factories

Utiliser une Factory lorsque la création d'un Aggregate ou d'une Entity devient complexe.

Exemple (BeOwn) :

```text
ReservationFactory        (alloue le rang via ReservationCapacity, pose le HOLD sur le Wallet)
InvestmentFactory         (depuis une Reservation convertie, ou une souscription directe)
RepaymentScheduleFactory  (génère l'échéancier selon IN_FINE / AMORTISSABLE à la signature)
```

Ne pas créer une Factory uniquement pour encapsuler :

```ts
new Entity()
```

Une Factory doit représenter une logique de création significative.

---

# 24. Modules

Chaque module doit avoir une responsabilité métier claire.

Éviter les modules techniques comme :

```text
common/
shared/
utils/
helpers/
services/
```

pour stocker des concepts métier.

Un concept métier doit appartenir à un contexte explicite.

Un dossier `shared` ne doit contenir que des éléments réellement génériques et non liés à un domaine particulier.

---

# 25. Shared Kernel

Un Shared Kernel doit être extrêmement limité.

Ne pas partager des entités métier entre tous les contextes.

Le Shared Kernel peut contenir :

```text
Result
DomainEvent
AggregateRoot
Entity
ValueObject
DomainError
```

Il ne doit pas devenir un second domaine global.

---

# 26. Tests

Les tests doivent suivre la structure du domaine.

Priorité :

### Domain Tests

Tester :

- les invariants ;
- les comportements ;
- les transitions d'état ;
- les Value Objects ;
- les Domain Services.

Exemple :

```ts
describe('Investment', () => {
  it('should sign a pending investment', () => {
    const investment = createPendingInvestment();

    investment.sign();

    expect(investment.isSigned()).toBe(true);
  });

  it('should reject signing an already signed investment', () => {
    const investment = createSignedInvestment();

    expect(() => investment.sign())
      .toThrow(InvestmentAlreadySignedError);
  });
});
```

Éviter de dépendre de la base de données pour tester la logique métier.

---

# 27. Règles de dépendances

Les règles suivantes sont obligatoires :

```text
Domain
❌ Infrastructure
❌ Framework
❌ HTTP
❌ Database
❌ ORM
```

```text
Application
→ Domain
```

```text
Infrastructure
→ Domain
→ Application
```

```text
Presentation
→ Application
```

---

# 28. Checklist avant d'ajouter une fonctionnalité

Avant de créer une nouvelle fonctionnalité, analyser :

### 1. Quel problème métier est résolu ?

### 2. À quel Bounded Context appartient-il ?

### 3. Quel est le Ubiquitous Language ?

### 4. Existe-t-il déjà un Aggregate concerné ?

### 5. Quelle est la frontière transactionnelle ?

### 6. Quels invariants doivent être protégés ?

### 7. Quels Value Objects représentent les concepts métier ?

### 8. La logique appartient-elle à :

- Entity ?
- Aggregate Root ?
- Value Object ?
- Domain Service ?
- Application Service ?

### 9. Quels Domain Events peuvent être produits ?

### 10. La fonctionnalité nécessite-t-elle une communication avec un autre Bounded Context ?

---

# 29. Processus obligatoire pour Claude

Avant d'implémenter une nouvelle fonctionnalité :

1. Identifier le Bounded Context.
2. Identifier le langage métier.
3. Identifier les Aggregate Roots.
4. Identifier les Entities internes.
5. Identifier les Value Objects.
6. Identifier les invariants.
7. Identifier les Domain Events.
8. Déterminer les frontières transactionnelles.
9. Déterminer les dépendances entre contextes.
10. Concevoir les Commands et Queries.
11. Définir les Ports nécessaires.
12. Implémenter les Adapters d'infrastructure.
13. Ajouter les tests du domaine.

Claude ne doit pas commencer directement par :

```text
Controller
→ Service
→ Repository
→ Database
```

La conception doit commencer par :

```text
Business Capability
        ↓
Bounded Context
        ↓
Ubiquitous Language
        ↓
Domain Model
        ↓
Aggregate
        ↓
Invariant
        ↓
Behavior
        ↓
Domain Event
        ↓
Application Use Case
        ↓
Infrastructure
```

---

# 30. Règle finale

En cas de doute, privilégier :

> Le comportement métier plutôt que la structure technique.

Toujours se demander :

> Où cette règle appartient-elle réellement ?

Puis choisir entre :

```text
Aggregate
Entity
Value Object
Domain Service
Application Layer
Infrastructure
```

Ne jamais déplacer une règle métier dans l'Application Layer uniquement pour simplifier l'implémentation.

Ne jamais créer une abstraction sans responsabilité claire.

Ne jamais introduire une dépendance entre Bounded Contexts sans analyser son impact sur le modèle de domaine.

L'objectif final est de construire un système où :

```text
Le code
≈
Le modèle métier
≈
Le langage des experts métier
```

Toute nouvelle fonctionnalité doit préserver cette cohérence.

> Rappel BeOwn : en cas d'arbitrage entre rapidité et rigueur, privilégier la rigueur sur `reservation` (§1, §3.1). C'est le Core Domain — le seul endroit où une erreur de modélisation coûte directement l'avantage concurrentiel du produit.

---

# 31. Clean Architecture — Robert C. Martin

L'application doit appliquer les principes de la **Clean Architecture**.

L'objectif principal est de garantir que les règles métier ne dépendent pas des détails techniques.

La règle fondamentale est :

> Les dépendances du code source doivent toujours pointer vers l'intérieur.

Architecture conceptuelle :

```text
┌───────────────────────────────────────────────┐
│          Frameworks & Drivers                 │
│                                               │
│  HTTP / Database / ORM / Message Broker       │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │          Interface Adapters             │  │
│  │                                         │  │
│  │ Controllers / Presenters / Gateways     │  │
│  │                                         │  │
│  │  ┌───────────────────────────────────┐  │  │
│  │  │           Application             │  │  │
│  │  │                                   │  │  │
│  │  │ Commands / Queries / Use Cases    │  │  │
│  │  │                                   │  │  │
│  │  │  ┌─────────────────────────────┐  │  │  │
│  │  │  │           Domain            │  │  │  │
│  │  │  │                             │  │  │  │
│  │  │  │ Entities / Aggregates / VO  │  │  │  │
│  │  │  └─────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────┘  │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

La direction des dépendances est :

```text
Infrastructure
      │
      ▼
Interface Adapters
      │
      ▼
Application
      │
      ▼
Domain
```

Le `Domain` ne doit connaître aucune couche externe.

Ce schéma s'applique **à l'intérieur de chaque Bounded Context** défini en §3 — `reservation`, `subscription`, `compliance`, etc. possèdent chacun leurs quatre anneaux ; il n'y a pas un anneau `Domain` unique partagé par toute l'application (ce serait un Shared Kernel géant, proscrit en §25).

---

# 32. Règle de dépendance

La règle suivante est obligatoire :

> Aucun élément d'une couche interne ne doit connaître un élément concret d'une couche externe.

Par exemple :

```text
Domain
❌ NestJS
❌ TypeORM
❌ Prisma
❌ PostgreSQL
❌ Redis
❌ HTTP
❌ RabbitMQ
```

Cette liste reprend exactement la stack retenue en §15 — c'est la même contrainte, formulée du point de vue du Domain plutôt que de l'Infrastructure. Elle s'applique également aux partenaires externes listés en §20 (Stripe, Universign, Doclift, Brevo) : aucun d'eux ne doit apparaître dans un `import` du dossier `domain/`.

Le domaine doit rester indépendant de l'infrastructure.

Incorrect :

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class Investment {
}
```

Correct :

```ts
export class Investment {
}
```

L'adaptateur externe peut dépendre du domaine :

```text
NestJS Controller
        ↓
Command Handler
        ↓
Domain Aggregate
```

Mais l'inverse est interdit.

---

# 33. Ports and Adapters

L'application doit utiliser le principe **Dependency Inversion**.

Les couches internes définissent les abstractions dont elles ont besoin.

Les couches externes les implémentent.

Exemple :

```text
Application
    │
    │ définit
    ▼
InvestmentRepository
    ▲
    │ implémente
    │
Infrastructure
    │
    ▼
PostgresInvestmentRepository
```

Exemple :

```ts
export interface InvestmentRepository {
  findById(
    id: InvestmentId,
  ): Promise<Investment | null>;

  save(
    investment: Investment,
  ): Promise<void>;
}
```

Puis :

```ts
export class PostgresInvestmentRepository
  implements InvestmentRepository {

  async findById(
    id: InvestmentId,
  ): Promise<Investment | null> {
    // PostgreSQL / ORM
  }

  async save(
    investment: Investment,
  ): Promise<void> {
    // PostgreSQL / ORM
  }
}
```

Le domaine et l'application ne doivent jamais dépendre directement de :

```text
PostgresInvestmentRepository
```

Ils dépendent de :

```text
InvestmentRepository
```

---

# 34. Différence entre DDD et Clean Architecture

Ne pas confondre les deux.

DDD définit principalement :

```text
Quel est le modèle métier ?
```

Clean Architecture définit principalement :

```text
Comment les dépendances sont-elles organisées ?
```

Exemple (BeOwn, contexte `reservation`) :

```text
DDD
│
├── Reservation
├── ReservationCapacity
├── InvestorId
├── Money
└── ReservationConverted
```

> Noter `InvestorId`, pas `Investor` : `reservation` référence l'investisseur par identifiant, il ne possède pas d'agrégat `Investor` en propre — celui-ci n'existe nulle part comme entité unique, chaque contexte n'en connaît que la portion qui le concerne (`UserAccount` dans `identity`, `InvestorComplianceProfile` dans `compliance`). Écrire un agrégat `Investor` générique ici referait exactement l'erreur que §3 corrige.

Clean Architecture décide où ces éléments vivent :

```text
domain/
    Reservation
    ReservationCapacity
    Money

application/
    ConvertReservationCommand

infrastructure/
    PostgresReservationRepository

presentation/
    ReservationController
```

DDD et Clean Architecture sont complémentaires.

---

# 35. Design Patterns — Gang of Four

Les Design Patterns GoF ne doivent jamais être utilisés simplement parce qu'ils existent.

Avant d'introduire un pattern, toujours identifier le problème de conception.

La règle est :

> Le problème doit justifier le pattern, jamais l'inverse.

Ne jamais faire :

```text
"Nous avons besoin d'un Strategy parce que Strategy est un bon pattern."
```

Toujours faire :

```text
"Nous avons plusieurs comportements interchangeables qui varient selon une règle métier."
```

Puis envisager :

```text
Strategy Pattern
```

---

# 36. Creational Patterns

## 36.1 Factory Method

Utiliser une Factory lorsque la création d'un objet implique une logique significative.

Exemple :

```ts
export class InvestmentFactory {
  public create(
    investorId: InvestorId,
    amount: Money,
  ): Investment {
    return Investment.create(
      InvestmentId.generate(),
      investorId,
      amount,
    );
  }
}
```

Cette Factory couvre la souscription directe ; la variante « depuis une Reservation convertie » (§23) est une seconde méthode de fabrication sur la même classe, pas une classe séparée — les deux produisent le même agrégat `Investment`.

Ne pas créer une Factory pour chaque objet simple.

Incorrect :

```ts
UserAccountFactory.create();
```

si cela fait uniquement :

```ts
return new UserAccount();
```

---

## 36.2 Abstract Factory

Utiliser lorsque plusieurs familles d'objets compatibles doivent être créées.

Exemple (BeOwn, contexte `treasury`) — RG-PAY-02 impose plusieurs rails de paiement, et le cahier des charges (§6.1) cite un agrégateur Mobile Money (CinetPay / FedaPay / Paydunya / Hub2) en plus des opérateurs en direct :

```text
PaymentProviderFactory
├── MobileMoneyProvider   (Orange / MTN / Wave / Moov, via agrégateur)
├── BankTransferProvider  (virement IBAN)
└── CardPaymentProvider   (CB, 3DS — Stripe)
```

Utiliser uniquement si la création de familles d'objets doit être abstraite.

---

## 36.3 Builder

Utiliser lorsqu'un objet possède une construction complexe avec plusieurs paramètres optionnels.

Exemple (BeOwn, contexte `catalog`) — les champs obligatoires d'une fiche projet sont énumérés en RG-PROJ04 :

```ts
const project = new RealEstateProjectBuilder()
  .withName(name)
  .withFundingTarget(target)
  .withInterestRate(rate)
  .withRepaymentType(RepaymentType.inFine())
  .withKiis(kiisDocument)
  .build();
```

Le Builder peut être particulièrement utile pour :

* tests ;
* objets complexes ;
* configuration progressive.

Ne pas l'utiliser pour un simple objet avec deux propriétés.

---

## 36.4 Singleton

Éviter autant que possible le Singleton manuel.

Ne pas faire :

```ts
class Database {
  private static instance;
}
```

si le framework possède déjà un système de Dependency Injection.

Préférer le conteneur DI du framework (NestJS) pour gérer les instances partagées.

---

# 37. Structural Patterns

## 37.1 Adapter

Utiliser un Adapter pour adapter une interface externe à une interface interne.

Exemple :

```text
Stripe API
     │
     ▼
StripeGatewayAdapter
     │
     ▼
PaymentGateway
```

Le domaine ou l'application dépend de :

```ts
interface PaymentGateway {
  charge(command: PaymentCommand): Promise<PaymentResult>;
}
```

L'infrastructure fournit :

```ts
class StripeGatewayAdapter
  implements PaymentGateway {
}
```

Même Adapter qu'en §20 — inutile d'en écrire un second sous un autre nom pour la même intégration. Le stockage de fichiers (MinIO → `MinioStorageAdapter` → `FileStoragePort`, §20) suit exactement le même schéma.

---

## 37.2 Facade

Utiliser une Facade pour simplifier l'accès à un sous-système complexe.

Exemple (BeOwn) — un écran du back-office (§3.3) qui a besoin de plusieurs lectures à la fois, sans que la Facade elle-même ne porte de règle métier :

```text
Complexe :
reservation   (lecture)
compliance    (lecture)
treasury      (lecture)

        ↓

ReservationOversightFacade
```

Attention :

Une Facade ne doit pas devenir un `God Service`. Ici en particulier : `ReservationOversightFacade` ne fait que composer des Queries de trois contextes pour un écran d'administration — si elle commence à décider quoi que ce soit (annuler une réservation, débloquer un HOLD), cette décision appartient à `reservation` ou `treasury`, pas à la Facade.

---

## 37.3 Decorator

Utiliser lorsque des responsabilités doivent être ajoutées dynamiquement sans modifier l'implémentation originale.

Exemples :

```text
Repository
    │
    ├── CachedRepository
    │
    ├── LoggingRepository
    │
    └── MetricsRepository
```

Exemple :

```ts
class CachedInvestmentRepository
  implements InvestmentRepository {

  constructor(
    private readonly repository: InvestmentRepository,
    private readonly cache: Cache,
  ) {}

  async findById(
    id: InvestmentId,
  ): Promise<Investment | null> {

    // chercher dans le cache

    return this.repository.findById(id);
  }
}
```

---

## 37.4 Composite

Utiliser lorsqu'un ensemble d'objets doit être traité de manière uniforme.

Ce pattern s'applique naturellement à la **composition de Specifications** déjà introduites en §22, plutôt qu'à une hiérarchie parallèle : pas la peine d'inventer une seconde interface de règles quand `Specification<T>` existe déjà.

Exemple (BeOwn, contexte `subscription`) :

```text
InvestmentEligibilitySpecification (composite)
├── TicketWithinBoundsSpecification          (§22)
├── EligibleInvestorSpecification             (§22)
└── ProjectOpenForSubscriptionSpecification   (§22)
```

Toutes implémentent la même interface qu'en §22 :

```ts
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}
```

---

# 38. Behavioral Patterns

## 38.1 Strategy

Utiliser lorsque plusieurs algorithmes ou comportements sont interchangeables.

Exemple (BeOwn, contexte `servicing`) — RG-ECH-02 énumère explicitement plusieurs modes de remboursement :

```text
CouponCalculationStrategy
├── InFineStrategy
├── AmortissableConstantStrategy
└── BulletTrimestrielStrategy
```

Interface :

```ts
export interface CouponCalculationStrategy {
  calculate(
    schedule: RepaymentSchedule,
  ): Echeance[];
}
```

> Différence avec la Policy du §22 : structurellement, c'est le même pattern (un algorithme interchangeable derrière une interface commune). Le nom **Policy** est réservé, dans ce document, aux règles qui encodent une décision métier volatile ou externe (ex. `ReservationRankingPolicy`, dont le critère exact reste à clarifier avec le client). Le nom **Strategy** convient à un choix connu et figé à la création de l'agrégat (le mode de remboursement d'un `Investment`, fixé à la signature). Les deux se codent de façon identique — ne pas chercher une distinction technique là où il n'y en a pas.

Éviter :

```ts
if (type === 'A') {
}

if (type === 'B') {
}

if (type === 'C') {
}
```

lorsque les comportements deviennent nombreux et évolutifs.

---

## 38.2 State

Utiliser lorsque le comportement d'un objet dépend fortement de son état.

Exemple (BeOwn) :

```text
Investment
│
├── PendingSignature
├── Signed
├── Repaid
├── Defaulted
└── Cancelled
```

`Repaid` et `Defaulted` proviennent de RG-ECH-11 (détection de défaut de paiement) ; `Cancelled` couvre le cas RG-INV-11 (cible de collecte non atteinte → remboursement intégral).

Si chaque état possède beaucoup de comportements différents, utiliser :

```text
InvestmentState
├── PendingSignatureInvestmentState
├── SignedInvestmentState
├── RepaidInvestmentState
├── DefaultedInvestmentState
└── CancelledInvestmentState
```

Ne pas utiliser State uniquement pour remplacer un simple enum.

---

## 38.3 Observer

Le pattern Observer est naturellement lié aux événements.

Exemple (BeOwn) :

```text
InvestmentSigned
        │
        ├── GenerateRepaymentSchedule    (servicing, §18)
        │
        ├── NotifyInvestor               (notifications, §3.3)
        │
        └── UpdateFundingProjection      (regulatory-reporting, §11)
```

Dans une architecture DDD :

```text
Domain Event
```

peut être considéré comme une application moderne du principe Observer — c'est exactement la chaîne déjà décrite en §18, relue ici sous l'angle du pattern plutôt que de la cohérence éventuelle entre Bounded Contexts.

---

## 38.4 Command

Le Command Pattern est utilisé pour représenter une intention.

Exemple :

```text
SignInvestmentCommand
```

Le CQRS peut utiliser ce pattern :

```text
Command
    ↓
Command Handler
    ↓
Aggregate
```

Une Command doit représenter une intention claire.

Incorrect :

```text
UpdateInvestmentCommand
```

si elle contient 30 propriétés modifiables.

Préférer :

```text
SignInvestmentCommand
CancelInvestmentCommand
ConvertReservationCommand
```

lorsque ces actions possèdent des règles métier différentes.

---

## 38.5 Chain of Responsibility

Utiliser lorsqu'une requête doit passer par plusieurs traitements indépendants.

Exemple (BeOwn, contexte `subscription`) :

```text
Investment Request
        ↓
Check Investor Eligibility            (EligibleInvestorSpecification, §22)
        ↓
Check Ticket Bounds                   (TicketWithinBoundsSpecification, §22)
        ↓
Check Project Open for Subscription   (ProjectOpenForSubscriptionSpecification, §22)
        ↓
Check Wallet Balance
        ↓
Accept / Reject
```

Chaque étape doit être indépendante.

Ne pas utiliser ce pattern pour masquer une logique métier qui devrait appartenir directement à un Aggregate.

---

# 39. Correspondance entre DDD et GoF Patterns

Les concepts suivants peuvent naturellement fonctionner ensemble.

| DDD                          | GoF Pattern potentiel               |
| ----------------------------- | ------------------------------------ |
| Aggregate complexe            | Factory / Builder                    |
| Domain Policy                 | Strategy                             |
| Domain Event                  | Observer                             |
| External Service Integration  | Adapter                              |
| Complex subsystem             | Facade                               |
| Behavior by lifecycle state   | State                                |
| Multiple validation rules     | Chain of Responsibility / Composite  |
| Repository avec cache         | Decorator                            |
| Object construction           | Factory Method                       |

Cette correspondance n'est pas obligatoire.

DDD ne nécessite pas automatiquement l'utilisation des patterns GoF.

---

# 40. SOLID

Le code doit respecter les principes SOLID lorsque cela améliore réellement la conception.

## Single Responsibility Principle

Une classe doit avoir une responsabilité cohérente.

Ne pas confondre SRP avec :

> Une classe doit contenir une seule méthode.

Une Aggregate Root peut posséder plusieurs méthodes si elles appartiennent à la même responsabilité métier.

---

## Open/Closed Principle

Le système doit être extensible sans modifier constamment le code existant.

Exemple (BeOwn, contexte `treasury`) — même variabilité métier qu'en §36.2 (RG-PAY-02), vue ici sous l'angle de l'extensibilité plutôt que de la création :

```text
PaymentStrategy
├── MobileMoneyStrategy
├── BankTransferStrategy
└── CardPaymentStrategy
```

Ajouter un nouveau comportement (un nouvel opérateur Mobile Money, par exemple) doit idéalement se faire par extension, sans toucher au code des stratégies existantes.

---

## Liskov Substitution Principle

Toute implémentation d'une abstraction doit respecter son contrat.

Une implémentation ne doit pas modifier arbitrairement les attentes du client.

---

## Interface Segregation Principle

Préférer :

```ts
interface InvestmentReader {
  findById(id: InvestmentId): Promise<Investment | null>;
}
```

et :

```ts
interface InvestmentWriter {
  save(investment: Investment): Promise<void>;
}
```

plutôt qu'une interface énorme :

```ts
interface InvestmentRepository {
  findAll();
  findById();
  save();
  delete();
  search();
  export();
  synchronize();
}
```

lorsque les clients n'ont pas besoin de toutes ces méthodes.

---

## Dependency Inversion Principle

Les politiques métier ne doivent pas dépendre des détails techniques.

Correct :

```text
Application
      ↓
PaymentGateway
      ↑
      │
StripeGatewayAdapter
```

Incorrect :

```text
Application
      ↓
StripeService
```

---

# 41. Architecture cible

Chaque Bounded Context doit respecter l'organisation suivante. Vue d'ensemble, avec la place du Shared Kernel (§25) :

```text
src/
│
├── shared/
│   └── kernel/
│       ├── domain/
│       │   ├── AggregateRoot.ts
│       │   ├── Entity.ts
│       │   ├── ValueObject.ts
│       │   ├── DomainEvent.ts
│       │   └── DomainError.ts
│
├── identity/
├── compliance/
├── catalog/
├── reservation/            (structure interne détaillée : §5)
├── subscription/
├── treasury/
├── servicing/
├── secondary-market/
├── documents/
├── regulatory-reporting/
│
└── main.ts
```

La structure interne de chaque Bounded Context (`domain/`, `application/`, `infrastructure/`, `presentation/`) est celle définie en §5 — ne pas la re-décliner différemment d'un contexte à l'autre.

---

# 42. Processus de conception obligatoire

Pour toute nouvelle fonctionnalité, suivre cet ordre.

Ce processus étend celui du §29 en insérant une étape explicite de sélection de patterns (Étape 5 ci-dessous) entre l'identification des invariants et la conception des cas d'utilisation. Dans la pratique, les deux se lisent comme un seul processus fusionné : suivre §29, et insérer l'Étape 5 après son point 7 (Domain Events) et avant son point 10 (Commands et Queries).

## Étape 1 — Comprendre le métier

Identifier :

```text
Acteurs
Objectifs métier
Événements métier
Règles métier
Contraintes
```

---

## Étape 2 — Identifier le Bounded Context

Déterminer :

```text
À quel modèle métier appartient cette fonctionnalité ?
```

Ne pas créer un nouveau Bounded Context simplement parce qu'un nouveau module technique est nécessaire — se référer d'abord à §3.1/§3.2 : le Bounded Context existe peut-être déjà.

---

## Étape 3 — Identifier les concepts DDD

Déterminer :

```text
Aggregate Root
Entities
Value Objects
Domain Services
Policies
Specifications
Domain Events
```

---

## Étape 4 — Identifier les invariants

Pour chaque Aggregate :

```text
Qu'est-ce qui doit toujours rester vrai ?
```

Exemple :

```text
Un Investment déjà signé ne peut pas être signé une deuxième fois.
```

Cette règle doit être protégée par l'Aggregate.

---

## Étape 5 — Identifier les patterns nécessaires

Uniquement après avoir compris le problème.

Exemple :

```text
Plusieurs algorithmes interchangeables
        ↓
Strategy
```

```text
Création complexe
        ↓
Factory / Builder
```

```text
Comportement dépendant fortement de l'état
        ↓
State
```

```text
Intégration externe
        ↓
Adapter
```

---

## Étape 6 — Concevoir les cas d'utilisation

Identifier :

```text
Commands
Queries
Handlers
Ports
```

---

## Étape 7 — Ajouter l'infrastructure

Seulement après avoir défini :

```text
Domain Model
↓
Application Contracts
↓
Ports
```

Ensuite seulement :

```text
Database
ORM
Message Broker
HTTP
External APIs
```

---

# 43. Règle d'or finale

Avant de créer une nouvelle classe, Claude doit se poser les questions suivantes. Les questions 1 à 5 recoupent largement la checklist du §28 (à l'échelle d'une fonctionnalité) ; celle-ci s'applique à l'échelle d'une classe, et les questions 6 à 9 lui sont propres (patterns, Clean Architecture) :

```text
1. Quel problème résout cette classe ?

2. Est-ce un concept métier ou technique ?

3. À quel Bounded Context appartient-elle ?

4. Quelle couche doit la posséder ?

5. Cette logique appartient-elle à :
   - Aggregate ?
   - Entity ?
   - Value Object ?
   - Domain Service ?
   - Application Service ?
   - Infrastructure Adapter ?

6. Existe-t-il réellement un problème nécessitant un Design Pattern ?

7. Le pattern simplifie-t-il le système ou le complexifie-t-il ?

8. Les dépendances respectent-elles la Dependency Rule ?

9. Les invariants métier sont-ils protégés ?

10. Le code utilise-t-il le langage métier ?
```

---

# 44. Architecture philosophique du projet

L'ordre de priorité est :

```text
1. Métier
        ↓
2. DDD
        ↓
3. Bounded Context
        ↓
4. Domain Model
        ↓
5. Aggregates et Invariants
        ↓
6. Clean Architecture
        ↓
7. Application Use Cases / CQRS
        ↓
8. Design Patterns lorsque nécessaire
        ↓
9. Infrastructure
        ↓
10. Framework
```

Le framework est un détail.

L'ORM est un détail.

La base de données est un détail.

Le protocole HTTP est un détail.

Le cœur du système est le modèle métier.

```text
┌───────────────────────────────────────┐
│           DOMAIN / BUSINESS           │
│                                       │
│  Aggregates                           │
│  Entities                             │
│  Value Objects                        │
│  Domain Events                        │
│  Domain Services                      │
│  Policies                             │
└───────────────────▲───────────────────┘
                    │
                    │ Dependency Rule
                    │
┌───────────────────┴───────────────────┐
│            APPLICATION                │
│                                       │
│ Commands / Queries                    │
│ Handlers                              │
│ Ports                                 │
└───────────────────▲───────────────────┘
                    │
┌───────────────────┴───────────────────┐
│          ADAPTERS                     │
│                                       │
│ Controllers                           │
│ Presenters                            │
│ Repository Adapters                   │
│ External API Adapters                 │
└───────────────────▲───────────────────┘
                    │
┌───────────────────┴───────────────────┐
│       FRAMEWORKS & INFRASTRUCTURE     │
│                                       │
│ NestJS                                │
│ PostgreSQL                            │
│ Prisma / TypeORM                      │
│ Redis                                 │
│ RabbitMQ / Kafka                      │
└───────────────────────────────────────┘
```

> DDD décide comment modéliser le métier.
> Clean Architecture décide comment protéger ce modèle.
> Les Design Patterns fournissent des solutions ciblées aux problèmes de conception.
> Aucun pattern ne doit être utilisé sans problème concret à résoudre.

> Pour BeOwn : ce triptyque s'applique à tous les Bounded Contexts du §3, mais le seuil de rigueur n'est pas le même partout. `reservation` (Core Domain, §1, §3.1) mérite l'application la plus stricte des trois. `regulatory-reporting`, en grande partie un ensemble de projections en lecture (§3.3), n'a besoin ni d'Aggregates riches ni de Patterns GoF sophistiqués — y appliquer la même rigueur que sur `reservation` serait du temps d'ingénierie mal investi.
