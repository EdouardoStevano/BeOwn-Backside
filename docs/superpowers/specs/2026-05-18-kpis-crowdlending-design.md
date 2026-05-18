# Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)

**Date :** 2026-05-18
**Auteur :** Brainstorm assisté Claude (Edouardo Stevano)
**Statut :** Design validé, en attente de plan d'implémentation
**Scope :** Backend NestJS — module `kpi` + module `admin` + migration doc marketing

---

## 1. Contexte et problème

### 1.1 — Situation actuelle

BeOwn est une plateforme de **crowdlending obligataire** : les investisseurs prêtent à des porteurs de projets immobiliers, en échange d'un échéancier d'intérêts à taux fixe (`triCible`). Le modèle de données reflète ce produit (`ProjectEntity`, `InvestmentEntity`, `EcheanceEntity` avec capital + intérêts).

La documentation marketing décrit cependant les indicateurs financiers comme si BeOwn était un **investissement locatif direct** : elle expose ROI, rentabilité locative brute, cashflow, plus-value immobilière, taux d'occupation. Trois de ces cinq formules (rentabilité locative, plus-value, taux d'occupation) **n'ont aucun sens** pour un produit obligataire et ne sont pas implémentées dans le code. La formule de ROI est implémentée mais affichée en brut, sans prise en compte de la fiscalité française (PFU 30%).

### 1.2 — Objectif du design

1. **Aligner la documentation publique** avec la réalité du produit (remplacement total des formules immo par des indicateurs crowdlending standards).
2. **Implémenter les indicateurs crowdlending de référence** (équivalents October, ClubFunding, Anaxago) sur trois surfaces :
   - **Dashboard investisseur** (privé, real-time) : portfolio personnel
   - **Page projet** (publique, cachée) : indicateurs publics d'un projet
   - **Dashboard admin/risk** (privé, snapshot quotidien) : exposition globale plateforme
3. **Crédibilité concurrentielle** : afficher TRI réalisé, capital restant dû, durée résiduelle pondérée, taux de défaut — c'est le langage standard des investisseurs crowdlending.

### 1.3 — Non-objectifs

- Pas de pivot vers l'immobilier locatif direct (resté en option, écarté).
- Pas de refonte du modèle d'investissement existant.
- Pas d'ajout de Redis ou d'event bus distribué (réutilisation de `@nestjs/event-emitter` déjà en place).
- Pas de nouveau système d'auth (réutilisation de `JwtAuthGuard` + `RolesGuard` existants).

---

## 2. Décisions structurantes (validées en brainstorm)

| # | Décision | Justification |
|---|----------|---------------|
| 1 | **Fiscalité** : PFU 30% par défaut (12.8% IR + 17.2% CSG/CRDS), toggle barème optionnel via champ `regimeFiscal` sur `UserEntity` | Standard 99% investisseurs particuliers français ; cohérent avec les taux déjà appliqués dans `pay-echeance.usecase.ts` |
| 2 | **TRI réalisé** : IRR strict (Newton-Raphson) sur flux datés réels | Standard de marché ; rigoureux mathématiquement ; ~30 lignes de code, réutilisable partout |
| 3 | **Statuts retard/défaut** : retard léger J+1 à J+30, retard significatif J+31 à J+90, défaut > J+90, perte définitive (action admin manuelle) | Standard October-like ; granularité utile dès le départ |
| 4 | **Stratégie de calcul** : hybride par couche — investor real-time, project cache mémoire 5 min, admin snapshot quotidien + bouton "refresh" | Compromis optimal perf/fraîcheur par usage ; pas besoin de Redis |
| 5 | **Marketing** : remplacement total de la section "Formules financières" par contenu crowdlending natif | Positionnement clair, pas de demi-mesure |
| 6 | **Durée résiduelle pondérée** : WAL = Σ(t × capital_remboursé_t) / Σ(capital_remboursé), pondéré par capital remboursé | Standard fixed income ; ce que font October et ClubFunding |

---

## 3. Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presenters (HTTP)                          │
│  investor-kpi.controller  project-kpi.controller  admin-kpi.ctl │
└────────────┬──────────────────┬────────────────────┬────────────┘
             │ real-time        │ cached 5 min       │ snapshot
             ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              Application — KPI Services (NestJS)                │
│                                                                 │
│  ┌─────────────────────┐  ┌────────────────────────────────┐    │
│  │ InvestorKpiService  │  │ ProjectKpiService              │    │
│  │ (per-user, fresh)   │  │ (per-project, in-memory cache) │    │
│  └─────────────────────┘  └────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ AdminKpiService                                        │     │
│  │  • lit kpi_snapshot_admin (table)                      │     │
│  │  • bouton "refresh" → recalcule à la demande           │     │
│  └────────────────────────────────────────────────────────┘     │
└────────────┬────────────────────────────────────────────────────┘
             │ utilise
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Domain — KpiCalculator (pur, testable)             │
│                                                                 │
│  • computeIrr(cashflows[])         → Newton-Raphson             │
│  • computeWal(echeances[])         → durée moy. pondérée        │
│  • computeNetInterests(brut, ...)  → PFU / barème / dispense    │
│  • deriveEcheanceStatus(echeance)  → a_venir / retard / défaut  │
│  • aggregateExposureBy(...)        → group by porteur/type/etc. │
│  • tauxDefaut(echeances)           → taux retard / défaut / perte │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Infrastructure                                     │
│   EcheanceRepository    InvestmentRepository    ProjectRepo     │
│   UserRepository        KpiSnapshotAdminRepository (nouvelle)   │
│                                                                 │
│   Cron : @Cron('0 1 * * *') EcheanceStatusJob                   │
│   Cron : @Cron('0 2 * * *') AdminKpiSnapshotJob                 │
└─────────────────────────────────────────────────────────────────┘
```

**Principes :**

1. **`KpiCalculator` est un domaine pur** : aucune dépendance NestJS/TypeORM, juste des fonctions sur des entrées primitives. Tests unitaires sans setup base.
2. **3 services applicatifs distincts** (un par surface) : partagent le calculator mais ont leur propre stratégie de fraîcheur.
3. **Pas de cache distribué** : cache mémoire NestJS via `CacheModule`, invalidé par events métier (`@nestjs/event-emitter` déjà en place).
4. **Snapshot admin en table dédiée** : `kpi_snapshot_admin` avec une ligne par jour, lue en `SELECT` trivial.
5. **2 crons** à exécution séquentielle :
   - 01:00 — `EcheanceStatusJob` (transitions retard → défaut)
   - 02:00 — `AdminKpiSnapshotJob` (calcule avec les nouveaux statuts)

---

## 4. Domain — `KpiCalculator` (cœur testable)

**Fichier :** `src/kpi/domains/kpi-calculator.ts`

### 4.1 — `computeIrr` (Newton-Raphson)

```typescript
export interface Cashflow {
  date: Date;      // date du flux
  amount: number;  // négatif = investissement, positif = encaissement
}

/**
 * IRR annualisé sur flux datés. Retourne null si insuffisant ou non convergent.
 */
export function computeIrr(flows: Cashflow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0].date.getTime();
  const yearsFromT0 = (d: Date) => (d.getTime() - t0) / (365.25 * 86400_000);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    let npv = 0, dNpv = 0;
    for (const { date, amount } of flows) {
      const t = yearsFromT0(date);
      const denom = Math.pow(1 + rate, t);
      npv += amount / denom;
      dNpv += -t * amount / (denom * (1 + rate));
    }
    if (Math.abs(npv) < 1e-7) return rate;
    if (dNpv === 0) return null;
    const next = rate - npv / dNpv;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return null;
}
```

**Cas particuliers gérés :** aucune échéance payée → `null` ; une seule échéance → `null` ; non-convergence → `null`.

### 4.2 — `computeWal` (Weighted Average Life)

```typescript
/**
 * WAL = Σ(années × capital_remboursé) / Σ(capital_remboursé)
 * Calculé sur échéances futures uniquement.
 */
export function computeWal(
  echeancesFutures: Array<{ datePrevue: Date; montantCapital: number }>,
  referenceDate: Date = new Date(),
): number | null {
  const totalCapital = echeancesFutures.reduce((s, e) => s + e.montantCapital, 0);
  if (totalCapital <= 0) return null;

  const weighted = echeancesFutures.reduce((s, e) => {
    const years = (e.datePrevue.getTime() - referenceDate.getTime()) / (365.25 * 86400_000);
    return s + Math.max(0, years) * e.montantCapital;
  }, 0);

  return weighted / totalCapital;  // en années — front formate en mois si < 1
}
```

### 4.3 — `computeNetInterests` (PFU / barème / dispense)

```typescript
export type RegimeFiscal = 'PFU' | 'BAREME' | 'DISPENSE';

export interface NetCalculationInput {
  interetsBruts: number;
  regime: RegimeFiscal;
  tauxBaremeMarginal?: number;  // requis si BAREME (ex: 0.30)
}

export function computeNetInterests(input: NetCalculationInput): {
  net: number;
  prelevementIR: number;
  prelevementCSG: number;
} {
  const { interetsBruts, regime, tauxBaremeMarginal } = input;
  const csg = round2(interetsBruts * 0.172);

  if (regime === 'DISPENSE') {
    return { net: round2(interetsBruts - csg), prelevementIR: 0, prelevementCSG: csg };
  }
  if (regime === 'BAREME') {
    if (tauxBaremeMarginal === undefined) {
      throw new Error('tauxBaremeMarginal required for BAREME');
    }
    const ir = round2(interetsBruts * tauxBaremeMarginal);
    return { net: round2(interetsBruts - ir - csg), prelevementIR: ir, prelevementCSG: csg };
  }
  // PFU 30% par défaut
  const ir = round2(interetsBruts * 0.128);
  return { net: round2(interetsBruts - ir - csg), prelevementIR: ir, prelevementCSG: csg };
}
```

### 4.4 — `deriveEcheanceStatus`

```typescript
export type EcheanceComputedStatus =
  | 'a_venir' | 'payee'
  | 'retard_leger'         // J+1 à J+30
  | 'retard_significatif'  // J+31 à J+90
  | 'defaut'               // > J+90
  | 'perte_definitive';    // décision admin

export function deriveEcheanceStatus(
  echeance: { datePrevue: Date; payeLe: Date | null; statut: string },
  now: Date = new Date(),
): EcheanceComputedStatus {
  if (echeance.statut === 'perte_definitive') return 'perte_definitive';
  if (echeance.payeLe) return 'payee';
  const joursRetard = Math.floor((now.getTime() - echeance.datePrevue.getTime()) / 86400_000);
  if (joursRetard <= 0) return 'a_venir';
  if (joursRetard <= 30) return 'retard_leger';
  if (joursRetard <= 90) return 'retard_significatif';
  return 'defaut';
}
```

### 4.5 — Agrégations

```typescript
export interface ComputedEcheance {
  montantCapital: number;
  montantInterets: number;
  statut: EcheanceComputedStatus;  // dérivé via deriveEcheanceStatus
}

export function aggregateExposureBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
  amountFn: (item: T) => number,
): Record<K, number>;

export function tauxDefaut(echeances: ComputedEcheance[]): {
  tauxRetard: number;        // % retard / encours total
  tauxDefaut: number;        // % défaut / encours total
  tauxPerteDefinitive: number;  // % perte / capital prêté total
};
```

---

## 5. Application — Investor KPI Service (real-time)

**Fichiers :**
- `src/kpi/applications/investor-kpi.service.ts`
- `src/kpi/presenters/http/investor-kpi.controller.ts`

**Endpoints :**

| Route | Méthode | Auth | Description |
|---|---|---|---|
| `GET /me/portfolio/kpis` | GET | user authentifié | Retourne `InvestorPortfolioKpis` |
| `PATCH /me/regime-fiscal` | PATCH | user authentifié | Mise à jour du régime fiscal du user (body : `{ regimeFiscal: 'PFU' \| 'BAREME' \| 'DISPENSE', tauxBaremeMarginal?: number }`) |

### 5.1 — Forme de la réponse

```typescript
export interface InvestorPortfolioKpis {
  // Globaux
  capitalInvestiTotal: number;
  capitalRestantDu: number;
  interetsBrutsCumules: number;
  interetsNetsCumules: number;
  prelevementsFiscauxCumules: number;
  triRealise: number | null;          // null si insuffisant
  triPondereCible: number;            // moyenne pondérée des triCible
  walMois: number | null;

  // Prochaine échéance
  prochaineEcheance: {
    date: Date;
    montantBrut: number;
    montantNet: number;
    projetId: string;
    projetTitre: string;
  } | null;

  // Drill-down par projet (truncated: true si > 200 projets)
  parProjet: Array<{
    projetId: string;
    projetTitre: string;
    statut: ProjectStatus;
    capitalInvesti: number;
    capitalRestantDu: number;
    interetsBrutsRecus: number;
    interetsNetsRecus: number;
    triCible: number;
    triRealise: number | null;
    walMois: number | null;
    prochaineEcheanceDate: Date | null;
    nbEcheancesEnRetard: number;
    aEnDefaut: boolean;
  }>;

  regimeFiscal: RegimeFiscal;
  truncated?: boolean;
}
```

### 5.2 — Logique

1. Charge `InvestmentEntity[]` du user avec `relations: ['echeances', 'projet']` (1 requête, pas de N+1).
2. Lit `regimeFiscal` + `tauxBaremeMarginal` sur `UserEntity` (PFU par défaut).
3. Pour chaque investment, construit la liste de `Cashflow` :
   - `t0` : `inv.createdAt`, montant = `-Number(inv.montant)`
   - Pour chaque échéance payée : `t = payeLe`, montant = `net(montantInterets) + montantCapital`
4. Appelle `computeIrr` et `computeWal` du calculator.
5. Agrège globalement.

### 5.3 — Garde-fous

- **Volumétrie** : si > 200 investissements actifs, on tronque `parProjet` aux 50 premiers et on retourne `truncated: true`.
- **Pas d'investissement** : retourne `emptyPortfolio()` (champs à 0/null, pas d'erreur).
- **Endpoint nouveau** : pas de risque de breaking change.

---

## 6. Application — Project KPI Service (cache 5 min)

**Fichiers :**
- `src/kpi/applications/project-kpi.service.ts`
- `src/kpi/presenters/http/project-kpi.controller.ts`

**Endpoint :** `GET /projects/:id/kpis` (public)

### 6.1 — Forme de la réponse

```typescript
export interface ProjectPublicKpis {
  // Statiques
  triCible: number;
  dureeMois: number;
  capitalCible: number;
  instrument: ProjectInstrument;

  // Collecte
  capitalCollecte: number;
  pctCollecte: number;
  nbInvestisseurs: number;

  // Vie du projet
  capitalRestantDuGlobal: number;
  capitalRembourse: number;
  pctCapitalRembourse: number;
  interetsVersesTotaux: number;        // bruts, tous investisseurs confondus
  walMois: number | null;

  // Risque public
  echeancesEnRetard: number;
  echeancesEnDefaut: number;
  statutSante: 'sain' | 'retard_leger' | 'retard_significatif' | 'defaut' | 'perte';

  // Échéancier prévisionnel (vue agrégée)
  echeancierPrevisionnel: Array<{
    numero: number;
    datePrevue: Date;
    montantCapital: number;
    montantInterets: number;
    montantTotal: number;
    statut: 'a_venir' | 'payee' | 'retard' | 'defaut';
  }>;
}
```

### 6.2 — Stratégie de cache

- **TTL 5 minutes** via `@nestjs/cache-manager` (in-memory).
- **Clé** : `project-kpi:${projetId}`.
- **Invalidation événementielle** sur :
  - `echeance.paid` (existant)
  - `investment.created` (existant)
  - `investment.cancelled` (existant)
- Le TTL sert de filet de sécurité si un event est manqué (crash process).

### 6.3 — Garde-fous

- Projet `BROUILLON` ou non publié : `404`.
- `capitalCible = 0` : `pctCollecte = 0` (pas de division par zéro).
- Aucune échéance : `walMois = null`, échéancier vide, `statutSante = 'sain'`.

---

## 7. Application — Admin KPI Service (snapshot quotidien)

**Fichiers :**
- `src/kpi/applications/admin-kpi.service.ts`
- `src/kpi/infrastructure/persistences/entities/kpi-snapshot-admin.entity.ts`
- `src/admin/admin-kpi.controller.ts`

**Endpoints :**

| Route | Méthode | Auth | Description |
|---|---|---|---|
| `GET /admin/kpis` | GET | `@Roles('admin', 'compliance')` | Snapshot du jour + flag `stale` |
| `POST /admin/kpis/refresh` | POST | `@Roles('admin', 'compliance')` | Recalcul à la demande (synchrone, 10-30s) |
| `GET /admin/kpis/history?days=30` | GET | `@Roles('admin', 'compliance')` | Historique pour graphes |

### 7.1 — Table `kpi_snapshot_admin`

```typescript
@Entity('kpi_snapshot_admin')
export class KpiSnapshotAdminEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'date', unique: true }) @Index() snapshotDate: string;
  @Column({ type: 'jsonb' }) data: AdminKpiSnapshotData;
  @Column({ type: 'integer' }) computeDurationMs: number;
  @CreateDateColumn() createdAt: Date;
}
```

Upsert sur `snapshotDate` : un cron qui re-run écrase la ligne du jour. Historique conservé sur 90 jours (purge par `AdminKpiSnapshotJob`).

### 7.2 — Forme du snapshot

```typescript
export interface AdminKpiSnapshotData {
  // Globaux plateforme
  encoursTotal: number;
  capitalInvestiCumule: number;
  capitalRembourseCumule: number;
  interetsVersesCumules: number;
  fraisPlateformeCumules: number;
  nbInvestisseursActifs: number;
  nbProjetsActifs: number;
  nbProjetsCloturesAvecSucces: number;
  nbProjetsEnPerte: number;

  // Risque
  tauxRetardGlobal: number;
  tauxDefautGlobal: number;
  tauxPerteDefinitive: number;

  // Cashflow prévisionnel (12 prochains mois)
  cashflowPrevisionnel: Array<{
    mois: string;  // 'YYYY-MM'
    capitalAttendu: number;
    interetsAttendus: number;
    totalAttendu: number;
  }>;

  // Expositions
  expositionParPorteur: Array<{
    porteurId: number;
    nbProjets: number;
    encours: number;
    pctEncoursTotal: number;
    nbEcheancesEnRetard: number;
    aEnDefaut: boolean;
  }>;
  expositionParTypeProjet: Array<{
    type: ProjectType;
    nbProjets: number;
    encours: number;
    pctEncoursTotal: number;
  }>;

  // Liste actionnable
  projetsEnAlerte: Array<{
    projetId: string;
    titre: string;
    porteurId: number;
    statutSante: 'retard_leger' | 'retard_significatif' | 'defaut';
    nbEcheancesEnRetard: number;
    capitalRestantDu: number;
    joursRetardMax: number;
  }>;
}
```

### 7.3 — Garde-fous

- **`getLatestSnapshot` sans aucune ligne** : appel `recompute()` automatique avec **mutex applicatif** (drapeau en mémoire) pour éviter le thundering herd.
- **Snapshot > 36h** : flag `stale: true` dans la réponse, front affiche bandeau warning.
- **`POST /admin/kpis/refresh` synchrone** : bloque 10-30s, alerte logger si > 30s.

---

## 8. Statuts & crons

### 8.1 — Évolution de `EcheanceStatus`

Extension de l'enum existante :

```typescript
export enum EcheanceStatus {
  A_VENIR = 'a_venir',
  EN_PAIEMENT = 'en_paiement',
  PAYEE = 'payee',
  RETARD_LEGER = 'retard_leger',           // remplace RETARD (J+1 à J+30)
  RETARD_SIGNIFICATIF = 'retard_significatif', // J+31 à J+90
  DEFAUT = 'defaut',                       // > J+90
  PERTE_DEFINITIVE = 'perte_definitive',   // décision admin
}
```

### 8.2 — `EcheanceStatusJob`

**Fichier :** `src/kpi/applications/echeance-status.job.ts`
**Cron :** `@Cron('0 1 * * *', { timeZone: 'Europe/Paris' })`

Transitions séquentielles en 3 updates SQL :
1. `A_VENIR` / `EN_PAIEMENT` → `RETARD_LEGER` si `datePrevue < now` et `payeLe null`
2. `RETARD_LEGER` → `RETARD_SIGNIFICATIF` si `datePrevue < now - 30j`
3. `RETARD_SIGNIFICATIF` → `DEFAUT` si `datePrevue < now - 90j`

Pour chaque échéance basculée en `DEFAUT`, émission de `echeance.defaulted` (consommé par `NotificationService` pour alerte mail admin + `ProjectKpiService` pour invalidation cache).

**Détection des transitions** : champ `EcheanceEntity.statutChangeLe: timestamptz` mis à jour à chaque transition (`UPDATE ... SET statut = ..., statutChangeLe = NOW()`).

### 8.3 — `AdminKpiSnapshotJob`

**Fichier :** `src/kpi/applications/admin-kpi-snapshot.job.ts`
**Cron :** `@Cron('0 2 * * *', { timeZone: 'Europe/Paris' })`

Appelle `adminKpiService.recompute()`, logue la durée. Pas de retry auto : si échec, admin voit `stale: true` au matin et peut cliquer refresh.

**Purge** : à la fin de chaque run réussi, `DELETE FROM kpi_snapshot_admin WHERE snapshotDate < NOW() - INTERVAL '90 days'`.

### 8.4 — Events émis

| Event | Émetteur | Consommateurs |
|---|---|---|
| `echeance.paid` | `pay-echeance.usecase.ts` (existant) | `ProjectKpiService` (invalide cache), `NotificationService` (existant) |
| `echeance.defaulted` | `EcheanceStatusJob` | `NotificationService` (mail admin), `ProjectKpiService` (invalide cache) |
| `investment.created` | flow create investment (existant) | `ProjectKpiService` |
| `investment.cancelled` | flow rétractation/annulation | `ProjectKpiService` |

### 8.5 — Perte définitive (action manuelle admin)

**Endpoint :** `POST /admin/projects/:projetId/declare-loss`
**Body :** `{ motif: string, dateClotureLoss: string }`

Met toutes les échéances en `DEFAUT` du projet à `PERTE_DEFINITIVE`, écrit un audit log, déclenche une notification investisseurs.

---

## 9. Migrations TypeORM

> **Note** : les timestamps de fichiers ci-dessous sont **illustratifs**. À l'implémentation, ils seront générés via `npm run migration:generate` pour matcher l'instant t (l'ordre relatif entre les 3 migrations est ce qui compte).

### 9.1 — `1715000000000-AddFiscalRegimeToUser.ts`

```sql
-- UP
ALTER TABLE "user" ADD COLUMN "regimeFiscal" varchar NOT NULL DEFAULT 'PFU';
ALTER TABLE "user" ADD COLUMN "tauxBaremeMarginal" decimal(4,3) NULL;

-- DOWN
ALTER TABLE "user" DROP COLUMN "tauxBaremeMarginal";
ALTER TABLE "user" DROP COLUMN "regimeFiscal";
```

### 9.2 — `1715000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts`

```sql
-- UP
UPDATE "echeance" SET "statut" = 'retard_leger' WHERE "statut" = 'retard';
ALTER TABLE "echeance" ADD COLUMN "statutChangeLe" timestamptz NULL;
CREATE INDEX "IDX_echeance_statut" ON "echeance" ("statut");
CREATE INDEX "IDX_echeance_datePrevue_statut" ON "echeance" ("datePrevue", "statut");

-- DOWN
DROP INDEX "IDX_echeance_datePrevue_statut";
DROP INDEX "IDX_echeance_statut";
ALTER TABLE "echeance" DROP COLUMN "statutChangeLe";
UPDATE "echeance" SET "statut" = 'retard'
  WHERE "statut" IN ('retard_leger', 'retard_significatif', 'defaut', 'perte_definitive');
```

### 9.3 — `1715000000002-CreateKpiSnapshotAdmin.ts`

```sql
-- UP
CREATE TABLE "kpi_snapshot_admin" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshotDate" date NOT NULL UNIQUE,
  "data" jsonb NOT NULL,
  "computeDurationMs" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "IDX_kpi_snapshot_date" ON "kpi_snapshot_admin" ("snapshotDate" DESC);

-- DOWN
DROP TABLE "kpi_snapshot_admin";
```

Toutes les migrations sont **réversibles** (down complet).

---

## 10. Structure du module `kpi`

```
src/kpi/
├── domains/
│   ├── kpi-calculator.ts                    (fonctions pures)
│   └── enums/
│       └── echeance-status.enum.ts          (extension de l'existant)
├── applications/
│   ├── investor-kpi.service.ts
│   ├── project-kpi.service.ts
│   ├── admin-kpi.service.ts
│   ├── echeance-status.job.ts               (cron 01:00)
│   └── admin-kpi-snapshot.job.ts            (cron 02:00)
├── infrastructure/
│   └── persistences/
│       └── entities/
│           └── kpi-snapshot-admin.entity.ts
├── presenters/
│   └── http/
│       ├── investor-kpi.controller.ts       (GET /me/portfolio/kpis)
│       └── project-kpi.controller.ts        (GET /projects/:id/kpis)
└── kpi.module.ts
```

Les endpoints admin vivent dans le module `admin` existant (`src/admin/admin-kpi.controller.ts`) pour matcher la structure actuelle.

---

## 11. Stratégie de tests

| Type | Cible | Outil | Volume |
|---|---|---|---|
| **Unit (P1)** | `KpiCalculator` (IRR, WAL, net fiscal, statuts, agrégations) | Jest pur, fixtures statiques | ~30 tests |
| **Unit (P2)** | Services KPI avec repos mockés | Jest + jest.Mocked | ~15 tests |
| **Integration** | `EcheanceStatusJob` sur base de test | Jest + test-containers PG | ~6 tests |
| **E2E** | 3 endpoints publics + 3 admin | supertest, base seedée | ~9 tests |

**Approche TDD sur `KpiCalculator`** : tests écrits avant l'implémentation. Les autres couches en code + tests parallèles.

**Tests critiques du calculator :**

- `computeIrr` :
  - 1000 € investi, 1100 € reçu un an plus tard → IRR = 10%
  - Flux mensuels constants 2 ans → IRR ≈ taux nominal annualisé
  - Aucune échéance payée → `null`
  - Une seule échéance partielle → `null`
  - Non-convergence → `null` (pas d'infinite loop)
- `computeWal` :
  - In fine 24 mois → 24 mois
  - Linéaire mensuel 24 mois → ≈ 12.5 mois
- `deriveEcheanceStatus` aux bornes : J+0, J+1, J+30, J+31, J+90, J+91
- `computeNetInterests` :
  - PFU 30% sur 100 € → net 70 € (IR 12.80, CSG 17.20)
  - BAREME TMI 30% sur 100 € → net 53 € (IR 30, CSG 17.20)
  - DISPENSE sur 100 € → net 82.80 € (CSG 17.20 seul)

---

## 12. Error handling

| Scénario | Comportement |
|---|---|
| IRR non convergent | `null` ; front affiche TRI cible ou tiret |
| WAL sur portfolio sans CRD | `null` ; front affiche "—" |
| Snapshot admin absent (1er démarrage) | Calcul à la volée + insert, avec mutex anti-thundering-herd |
| Snapshot stale > 36h | Flag `stale: true`, front affiche bandeau warning |
| Échec cron `EcheanceStatusJob` | Logué erreur, alerte Sentry si configuré, pas de retry auto |
| User sans investissement | `emptyPortfolio()` (tous champs 0/null, pas d'erreur) |
| Projet `BROUILLON` non publié | `404` sur `GET /projects/:id/kpis` |
| Division par zéro | `0` ou `null` selon le sens, jamais `NaN`/`Infinity` |
| `BAREME` sans `tauxBaremeMarginal` | `throw` côté calculator, capturé en validation user-side |

---

## 13. Performance & monitoring

**Métriques à logger** (via `Logger` NestJS, enrichies Sentry si dispo) :

- `computeDurationMs` du snapshot admin (alerte si > 30s)
- Durée des appels `GET /me/portfolio/kpis` (alerte si > 2s)
- Compteur des transitions par cron run (`+N retard_leger, +M defaut`)

**Alertes :**

- Snapshot stale > 36h
- Cron jobs en échec
- Endpoint investor > 2s sur cas normaux

Pas de monitoring tooling à ajouter — `Logger` NestJS suffit. Si Sentry est branché, on enrichit naturellement.

---

## 14. Plan de déploiement (3 lots)

| Lot | Contenu | Indépendant |
|---|---|---|
| **Lot 1 — Fondations** | `KpiCalculator` pur + tests + migrations user + statuts étendus | ✅ Aucune surface publique impactée |
| **Lot 2 — Investor + Project** | `InvestorKpiService`, `ProjectKpiService`, controllers, cache events, champ `regimeFiscal` user editable | ✅ Endpoints nouveaux, pas de breaking change |
| **Lot 3 — Admin + Crons + Marketing** | `AdminKpiService`, table snapshot, 2 crons, endpoint `declare-loss`, remplacement doc marketing | ✅ Endpoints admin nouveaux + remplacement doc |

Le plan d'implémentation (étape suivante du workflow) détaillera ces lots en étapes commitables.

---

## 15. Contenu marketing à remplacer

### 15.1 — Localisation

À identifier au moment de l'implémentation (frontend repo séparé probable, ou fichier MD dans le présent repo `docs/`). Le spec définit le **contenu cible** ; l'implémentation l'injecte à l'endroit pertinent.

### 15.2 — Section cible (remplace les 5 formules immo)

#### **6. Indicateurs financiers BeOwn**

Le crowdlending obligataire suit des standards spécifiques, distincts de l'immobilier locatif classique. Voici les indicateurs sur votre tableau de bord et sur la page de chaque projet.

---

**A. TRI cible (Taux de Rendement Interne cible)**

Le rendement annualisé visé par le projet, défini à l'avance.

> Formule : `TRI cible = (taux d'intérêt nominal du prêt)`

> Exemple : projet à TRI cible 9% sur 24 mois — vous investissez 1 000 €, vous percevez environ 90 € d'intérêts bruts par an.

---

**B. TRI réalisé**

Le rendement annualisé effectivement perçu sur les flux déjà encaissés, calculé selon la méthode IRR (Internal Rate of Return).

> Formule : taux qui annule `NPV = Σ (Fluxᵢ / (1 + TRI)^tᵢ)`, où Fluxᵢ inclut l'investissement initial (négatif) et chaque échéance reçue (positive).

> Si tous les remboursements sont à l'heure, **TRI réalisé ≈ TRI cible**. Un retard fait baisser le TRI réalisé.

---

**C. ROI net cumulé**

Le gain net (après fiscalité) rapporté au capital investi, en pourcentage.

> Formule : `ROI net = (Intérêts nets cumulés / Capital investi) × 100`

> Fiscalité par défaut : **PFU 30%** (12.8% IR + 17.2% prélèvements sociaux). Toggle barème progressif possible depuis le profil.

> Exemple : 1 000 € investi, 180 € d'intérêts bruts, PFU 30% (−54 €) → ROI net = 12.6%.

---

**D. Capital restant dû (CRD)**

Capital encore à rembourser sur les investissements en cours.

> Formule : `CRD = Σ (capital_échéance) pour échéances non payées`

> Diminue à chaque échéance versée. À 0 = projet remboursé.

---

**E. Durée résiduelle moyenne pondérée (WAL)**

Durée moyenne avant remboursement intégral, pondérée par les montants de capital.

> Formule : `WAL = Σ (temps × capital_remboursé_t) / Σ (capital_remboursé_total)`

> Exemple : in fine 24 mois → WAL = 24 mois. Linéaire mensuel 24 mois → WAL ≈ 12 mois.

---

**F. Cashflow net**

Flux financiers nets encaissés sur une période.

> Formule : `Cashflow net = Σ (échéances perçues) − Σ (prélèvements fiscaux)`

> Indicateur clé pour le rendement mensuel réel.

---

**G. Taux de retard et taux de défaut**

Indicateurs de risque, visibles au niveau projet et plateforme.

> **Retard léger** : J+1 à J+30
> **Retard significatif** : J+31 à J+90
> **Défaut** : > J+90 (capital à risque)
> **Perte définitive** : décision officielle (liquidation, accord transactionnel défavorable)

> Formules globales :
> - `Taux de retard = (capital en retard / encours total) × 100`
> - `Taux de défaut = (capital en défaut / encours total) × 100`
> - `Taux de perte = (capital perdu définitivement / capital prêté cumulé) × 100`

---

### 15.3 — Mention de transition (optionnelle, en haut de page)

> **Note** : BeOwn est une plateforme de crowdlending obligataire (prêt avec intérêts), pas d'investissement locatif direct. Les indicateurs sont adaptés à ce type de produit : pas de loyer, pas de plus-value de revente, pas de taux d'occupation. Le rendement est connu à l'avance (TRI cible) et se matérialise par des intérêts versés selon un échéancier contractualisé.

### 15.4 — Cohérence terminologique (libellés front ↔ API)

| Concept | Libellé affiché | Champ API |
|---|---|---|
| TRI cible | "TRI cible" | `triCible` |
| TRI réalisé | "TRI réalisé" | `triRealise` |
| ROI net | "ROI net" | (dérivé) |
| Capital restant dû | "Capital restant dû" / "CRD" | `capitalRestantDu` |
| Durée résiduelle pondérée | "Durée résiduelle pondérée" / "WAL" | `walMois` |
| Cashflow net | "Cashflow net cumulé" | `cashflowNetCumule` |

---

## 16. Hors scope (explicitement)

- Pas de pivot vers l'immobilier locatif direct.
- Pas de refonte de l'authentification.
- Pas d'ajout de Redis ni d'event bus distribué.
- Pas de migration des projets existants vers un nouvel instrument financier.
- Pas de gestion multi-devises (€ uniquement).
- Pas de calcul fiscal pour investisseurs non-résidents fiscaux français (V2 éventuelle).
- Pas de tests de charge spécifiques (les garde-fous volumétrie sont prévus mais non load-testés).

---

## 17. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| IRR non convergent sur cas atypique (flux très irréguliers) | Faible | Moyen | Retourne `null`, front affiche fallback |
| Cron `EcheanceStatusJob` qui échoue silencieusement | Moyen | Élevé | Logging strict + alerte Sentry + flag `stale` sur snapshot |
| Performance dashboard investor sur user avec >200 projets | Faible | Moyen | Garde-fou `truncated` à 50 dans la réponse |
| Migration `retard` → `retard_leger` qui casse des consommateurs | Moyen | Élevé | Migration accompagnée d'un audit du front (grep `'retard'` literal) avant déploiement |
| Calcul snapshot admin qui dépasse 30s en prod | Moyen | Faible | Logging `computeDurationMs` + flag pour alerter, requêtes optimisables a posteriori |
| Différence de calcul TRI vs concurrents (rounding, conventions) | Élevé | Faible | Documentation publique de la méthode (NPV Newton-Raphson, base 365.25j) |
