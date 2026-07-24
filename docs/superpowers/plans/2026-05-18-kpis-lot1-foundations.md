# Lot 1 — Foundations (KpiCalculator + statuts + migrations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-domain `KpiCalculator` (IRR, WAL, net fiscal, status derivation, aggregations) with full unit-test coverage, extend `EcheanceStatus` for retard/défaut granularity, add fiscal-regime fields to `UserEntity`, and wire the new `KpiModule` into the app.

**Architecture:** A pure TypeScript domain module (`src/kpi/domains/kpi-calculator.ts`) with zero runtime dependencies — testable in isolation. Two TypeORM migrations extend existing entities. The `KpiModule` is registered in `AppModule` but exposes no endpoints yet (Lot 2 adds them).

**Tech Stack:** NestJS 11, TypeORM 0.3.28, Jest 30, ts-jest. New dependency: `@nestjs/event-emitter` (added but not yet wired in events — Lot 2 will use it).

**Spec reference:** [docs/superpowers/specs/2026-05-18-kpis-crowdlending-design.md](../specs/2026-05-18-kpis-crowdlending-design.md) — sections 4, 8, 9.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| Create | `src/kpi/domains/kpi-calculator.ts` | Pure functions: IRR, WAL, net fiscal, status, aggregations |
| Create | `src/kpi/domains/types.ts` | Shared types: `Cashflow`, `RegimeFiscal`, `EcheanceComputedStatus`, `ComputedEcheance` |
| Create | `src/kpi/domains/kpi-calculator.spec.ts` | Unit tests for the calculator |
| Create | `src/kpi/kpi.module.ts` | NestJS module wiring |
| Modify | `src/investments/domains/enums/investment-status.enum.ts` | Add retard/défaut/perte values |
| Modify | `src/investments/infrastructure/persistences/entities/echeance.entity.ts` | Add `statutChangeLe: Date \| null` |
| Modify | `src/users/infrastructure/persistences/entities/user.entity.ts` | Add `regimeFiscal`, `tauxBaremeMarginal` |
| Create | `database/migrations/1779000000000-AddFiscalRegimeToUser.ts` | Migration 1 |
| Create | `database/migrations/1779000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts` | Migration 2 |
| Modify | `src/app.module.ts` | Register `KpiModule` and `EventEmitterModule` |
| Modify | `package.json` | Add `@nestjs/event-emitter` dependency |

---

## Task 1: Install `@nestjs/event-emitter` and register module

**Files:**
- Modify: `package.json`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Install dependency**

```bash
npm install @nestjs/event-emitter
```

Expected: package added to `dependencies`, lockfile updated.

- [ ] **Step 2: Register `EventEmitterModule` globally in `AppModule`**

In `src/app.module.ts`, add the import near the other NestJS imports:

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
```

In the `@Module({ imports: [...] })` array, add right after `ScheduleModule.forRoot()`:

```typescript
EventEmitterModule.forRoot({
  wildcard: false,
  delimiter: '.',
  maxListeners: 20,
  verboseMemoryLeak: false,
  ignoreErrors: false,
}),
```

- [ ] **Step 3: Verify the app still boots**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app.module.ts
git commit -m "chore(kpi): add @nestjs/event-emitter and register module"
```

---

## Task 2: Create `src/kpi/domains/types.ts`

**Files:**
- Create: `src/kpi/domains/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface Cashflow {
  date: Date;
  amount: number;
}

export type RegimeFiscal = 'PFU' | 'BAREME' | 'DISPENSE';

export type EcheanceComputedStatus =
  | 'a_venir'
  | 'payee'
  | 'retard_leger'
  | 'retard_significatif'
  | 'defaut'
  | 'perte_definitive';

export interface ComputedEcheance {
  montantCapital: number;
  montantInterets: number;
  statut: EcheanceComputedStatus;
}

export interface NetCalculationInput {
  interetsBruts: number;
  regime: RegimeFiscal;
  tauxBaremeMarginal?: number;
}

export interface NetCalculationOutput {
  net: number;
  prelevementIR: number;
  prelevementCSG: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/kpi/domains/types.ts`
Expected: no errors (or no output).

- [ ] **Step 3: Commit**

```bash
git add src/kpi/domains/types.ts
git commit -m "feat(kpi): add domain types for calculator"
```

---

## Task 3: TDD — `computeIrr` (Newton-Raphson)

**Files:**
- Create: `src/kpi/domains/kpi-calculator.spec.ts`
- Create: `src/kpi/domains/kpi-calculator.ts`

- [ ] **Step 1: Write failing tests for `computeIrr`**

Create `src/kpi/domains/kpi-calculator.spec.ts`:

```typescript
import { computeIrr } from './kpi-calculator';

describe('computeIrr', () => {
  it('returns 10% for 1000€ invested, 1100€ received one year later', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: -1000 },
      { date: new Date('2026-01-01'), amount: 1100 },
    ];
    const irr = computeIrr(flows);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.10, 3);
  });

  it('returns null when fewer than 2 flows', () => {
    expect(computeIrr([])).toBeNull();
    expect(computeIrr([{ date: new Date(), amount: -100 }])).toBeNull();
  });

  it('returns approximately the nominal rate for monthly amortization over 2 years', () => {
    // 1000€ invested, 24 monthly payments of ~46€ (= principal + interest at ~10% annual nominal)
    // We use a simple linear amortization for the test fixture
    const flows = [{ date: new Date('2025-01-01'), amount: -1000 }];
    const monthly = 46.14; // approx payment that yields ~10% IRR on 24 months
    for (let m = 1; m <= 24; m++) {
      const d = new Date('2025-01-01');
      d.setMonth(d.getMonth() + m);
      flows.push({ date: d, amount: monthly });
    }
    const irr = computeIrr(flows);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.08);
    expect(irr!).toBeLessThan(0.12);
  });

  it('returns null when all flows have the same sign (no convergence possible)', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: 100 },
      { date: new Date('2026-01-01'), amount: 100 },
    ];
    expect(computeIrr(flows)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: All tests fail with "Cannot find module './kpi-calculator'".

- [ ] **Step 3: Implement `computeIrr` minimally to pass**

Create `src/kpi/domains/kpi-calculator.ts`:

```typescript
import { Cashflow } from './types';

const MS_PER_YEAR = 365.25 * 86_400_000;

/**
 * IRR annualisé sur flux datés (Newton-Raphson).
 * Convention: amount négatif = sortie (investissement), positif = entrée.
 * Returns null if fewer than 2 flows, no sign change, or non-convergent.
 */
export function computeIrr(flows: Cashflow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  const t0 = flows[0].date.getTime();
  const yearsFromT0 = (d: Date) => (d.getTime() - t0) / MS_PER_YEAR;

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dNpv = 0;
    for (const { date, amount } of flows) {
      const t = yearsFromT0(date);
      const denom = Math.pow(1 + rate, t);
      npv += amount / denom;
      dNpv += (-t * amount) / (denom * (1 + rate));
    }
    if (Math.abs(npv) < 1e-7) return rate;
    if (dNpv === 0) return null;
    const next = rate - npv / dNpv;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return null;
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/domains/kpi-calculator.ts src/kpi/domains/kpi-calculator.spec.ts
git commit -m "feat(kpi): add computeIrr with Newton-Raphson"
```

---

## Task 4: TDD — `computeWal`

**Files:**
- Modify: `src/kpi/domains/kpi-calculator.spec.ts`
- Modify: `src/kpi/domains/kpi-calculator.ts`

- [ ] **Step 1: Append failing tests for `computeWal`**

At the bottom of `src/kpi/domains/kpi-calculator.spec.ts`, append:

```typescript
import { computeWal } from './kpi-calculator';

describe('computeWal', () => {
  const ref = new Date('2025-01-01');

  it('returns null when no future capital to repay', () => {
    expect(computeWal([], ref)).toBeNull();
    expect(computeWal([{ datePrevue: new Date('2026-01-01'), montantCapital: 0 }], ref)).toBeNull();
  });

  it('returns 2 years for a single in-fine repayment at 24 months', () => {
    const wal = computeWal(
      [{ datePrevue: new Date('2027-01-01'), montantCapital: 1000 }],
      ref,
    );
    expect(wal).toBeCloseTo(2.0, 2);
  });

  it('returns ~1 year for linear monthly amortization over 24 months', () => {
    const futures = [];
    for (let m = 1; m <= 24; m++) {
      const d = new Date('2025-01-01');
      d.setMonth(d.getMonth() + m);
      futures.push({ datePrevue: d, montantCapital: 1000 / 24 });
    }
    const wal = computeWal(futures, ref);
    expect(wal).not.toBeNull();
    // mean position of 24 equal monthly payments ≈ 12.5 months = 1.04 years
    expect(wal!).toBeGreaterThan(1.0);
    expect(wal!).toBeLessThan(1.1);
  });

  it('clamps past-dated échéances to 0 contribution', () => {
    const wal = computeWal(
      [
        { datePrevue: new Date('2024-01-01'), montantCapital: 500 },
        { datePrevue: new Date('2026-01-01'), montantCapital: 500 },
      ],
      ref,
    );
    expect(wal).not.toBeNull();
    // half (past) contributes 0, half contributes 1 year × 500 / 1000 = 0.5 year
    expect(wal!).toBeCloseTo(0.5, 2);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: `computeWal` tests fail with "computeWal is not a function" (the `computeIrr` tests still pass).

- [ ] **Step 3: Implement `computeWal`**

Append to `src/kpi/domains/kpi-calculator.ts`:

```typescript
/**
 * Weighted Average Life: Σ(years × capitalRepaid) / Σ(capitalRepaid).
 * Returns null if total capital ≤ 0. Past-dated échéances contribute 0.
 */
export function computeWal(
  echeancesFutures: Array<{ datePrevue: Date; montantCapital: number }>,
  referenceDate: Date = new Date(),
): number | null {
  const totalCapital = echeancesFutures.reduce((s, e) => s + e.montantCapital, 0);
  if (totalCapital <= 0) return null;

  const weighted = echeancesFutures.reduce((s, e) => {
    const years = (e.datePrevue.getTime() - referenceDate.getTime()) / MS_PER_YEAR;
    return s + Math.max(0, years) * e.montantCapital;
  }, 0);

  return weighted / totalCapital;
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: All `computeIrr` + `computeWal` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/domains/kpi-calculator.ts src/kpi/domains/kpi-calculator.spec.ts
git commit -m "feat(kpi): add computeWal (Weighted Average Life)"
```

---

## Task 5: TDD — `computeNetInterests`

**Files:**
- Modify: `src/kpi/domains/kpi-calculator.spec.ts`
- Modify: `src/kpi/domains/kpi-calculator.ts`

- [ ] **Step 1: Append failing tests**

At the bottom of the spec file:

```typescript
import { computeNetInterests } from './kpi-calculator';

describe('computeNetInterests', () => {
  it('PFU 30%: 100€ brut → 70€ net (12.80 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({ interetsBruts: 100, regime: 'PFU' });
    expect(r.prelevementIR).toBeCloseTo(12.8, 2);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(70.0, 2);
  });

  it('BAREME TMI 30%: 100€ brut → 52.80€ net (30 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({
      interetsBruts: 100,
      regime: 'BAREME',
      tauxBaremeMarginal: 0.30,
    });
    expect(r.prelevementIR).toBeCloseTo(30.0, 2);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(52.8, 2);
  });

  it('DISPENSE: 100€ brut → 82.80€ net (0 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({ interetsBruts: 100, regime: 'DISPENSE' });
    expect(r.prelevementIR).toBe(0);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(82.8, 2);
  });

  it('throws if BAREME without tauxBaremeMarginal', () => {
    expect(() =>
      computeNetInterests({ interetsBruts: 100, regime: 'BAREME' }),
    ).toThrow('tauxBaremeMarginal required for BAREME');
  });

  it('rounds to 2 decimals (no floating point weirdness)', () => {
    const r = computeNetInterests({ interetsBruts: 33.33, regime: 'PFU' });
    expect(Number.isFinite(r.net)).toBe(true);
    expect(r.net.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: `computeNetInterests` tests fail.

- [ ] **Step 3: Implement `computeNetInterests`**

Append to `src/kpi/domains/kpi-calculator.ts`:

```typescript
import { NetCalculationInput, NetCalculationOutput } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeNetInterests(input: NetCalculationInput): NetCalculationOutput {
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
  // PFU 30% default
  const ir = round2(interetsBruts * 0.128);
  return { net: round2(interetsBruts - ir - csg), prelevementIR: ir, prelevementCSG: csg };
}
```

Also update the top of `kpi-calculator.ts` so the `Cashflow` import becomes a combined import:

```typescript
import { Cashflow, NetCalculationInput, NetCalculationOutput } from './types';
```

(Replace the existing single-type import.)

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/domains/kpi-calculator.ts src/kpi/domains/kpi-calculator.spec.ts
git commit -m "feat(kpi): add computeNetInterests (PFU/barème/dispense)"
```

---

## Task 6: TDD — `deriveEcheanceStatus`

**Files:**
- Modify: `src/kpi/domains/kpi-calculator.spec.ts`
- Modify: `src/kpi/domains/kpi-calculator.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import { deriveEcheanceStatus } from './kpi-calculator';

describe('deriveEcheanceStatus', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  const make = (datePrevue: string, payeLe: string | null = null, statut = 'a_venir') => ({
    datePrevue: new Date(datePrevue),
    payeLe: payeLe ? new Date(payeLe) : null,
    statut,
  });

  it('returns "payee" when payeLe is set', () => {
    expect(deriveEcheanceStatus(make('2025-05-15', '2025-05-16'), now)).toBe('payee');
  });

  it('returns "perte_definitive" if marked manually', () => {
    expect(
      deriveEcheanceStatus(make('2025-01-01', null, 'perte_definitive'), now),
    ).toBe('perte_definitive');
  });

  it('returns "a_venir" when datePrevue is today or future', () => {
    expect(deriveEcheanceStatus(make('2025-06-01'), now)).toBe('a_venir');
    expect(deriveEcheanceStatus(make('2025-07-01'), now)).toBe('a_venir');
  });

  it('returns "retard_leger" at J+1 to J+30', () => {
    expect(deriveEcheanceStatus(make('2025-05-31'), now)).toBe('retard_leger');
    expect(deriveEcheanceStatus(make('2025-05-02'), now)).toBe('retard_leger');
  });

  it('returns "retard_significatif" at J+31 to J+90', () => {
    expect(deriveEcheanceStatus(make('2025-05-01'), now)).toBe('retard_significatif'); // 31 jours
    expect(deriveEcheanceStatus(make('2025-03-03'), now)).toBe('retard_significatif'); // 90 jours
  });

  it('returns "defaut" beyond J+90', () => {
    expect(deriveEcheanceStatus(make('2025-03-02'), now)).toBe('defaut'); // 91 jours
    expect(deriveEcheanceStatus(make('2024-01-01'), now)).toBe('defaut');
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`

- [ ] **Step 3: Implement `deriveEcheanceStatus`**

Append to `src/kpi/domains/kpi-calculator.ts`:

```typescript
import { EcheanceComputedStatus } from './types';

const MS_PER_DAY = 86_400_000;

export function deriveEcheanceStatus(
  echeance: { datePrevue: Date; payeLe: Date | null; statut: string },
  now: Date = new Date(),
): EcheanceComputedStatus {
  if (echeance.statut === 'perte_definitive') return 'perte_definitive';
  if (echeance.payeLe) return 'payee';
  const joursRetard = Math.floor((now.getTime() - echeance.datePrevue.getTime()) / MS_PER_DAY);
  if (joursRetard <= 0) return 'a_venir';
  if (joursRetard <= 30) return 'retard_leger';
  if (joursRetard <= 90) return 'retard_significatif';
  return 'defaut';
}
```

Combine the type imports at top:

```typescript
import {
  Cashflow,
  EcheanceComputedStatus,
  NetCalculationInput,
  NetCalculationOutput,
} from './types';
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: all `deriveEcheanceStatus` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/domains/kpi-calculator.ts src/kpi/domains/kpi-calculator.spec.ts
git commit -m "feat(kpi): add deriveEcheanceStatus with October-like thresholds"
```

---

## Task 7: TDD — `aggregateExposureBy` and `tauxDefaut`

**Files:**
- Modify: `src/kpi/domains/kpi-calculator.spec.ts`
- Modify: `src/kpi/domains/kpi-calculator.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import { aggregateExposureBy, tauxDefaut } from './kpi-calculator';
import type { ComputedEcheance } from './types';

describe('aggregateExposureBy', () => {
  it('groups and sums by key', () => {
    const items = [
      { porteur: 'A', montant: 100 },
      { porteur: 'B', montant: 50 },
      { porteur: 'A', montant: 25 },
    ];
    const result = aggregateExposureBy(items, (i) => i.porteur, (i) => i.montant);
    expect(result).toEqual({ A: 125, B: 50 });
  });

  it('returns empty object for empty input', () => {
    expect(aggregateExposureBy<unknown, string>([], () => 'x', () => 0)).toEqual({});
  });
});

describe('tauxDefaut', () => {
  const e = (statut: ComputedEcheance['statut'], capital = 100): ComputedEcheance => ({
    montantCapital: capital,
    montantInterets: 10,
    statut,
  });

  it('computes 0% rates when everything is healthy', () => {
    const r = tauxDefaut([e('a_venir'), e('a_venir'), e('payee')]);
    expect(r.tauxRetard).toBe(0);
    expect(r.tauxDefaut).toBe(0);
    expect(r.tauxPerteDefinitive).toBe(0);
  });

  it('computes retard and défaut rates on capital basis', () => {
    // encours total (non-paid, non-loss) = 4 × 100 = 400
    // en retard (leger + significatif) = 2 × 100 = 200 → 50%
    // en défaut = 1 × 100 = 100 → 25%
    const echeances = [
      e('a_venir'),
      e('retard_leger'),
      e('retard_significatif'),
      e('defaut'),
      e('payee', 100), // exclu de l'encours
    ];
    const r = tauxDefaut(echeances);
    expect(r.tauxRetard).toBeCloseTo(50, 2);
    expect(r.tauxDefaut).toBeCloseTo(25, 2);
  });

  it('computes perte definitive rate on total lent capital', () => {
    // total lent = somme de tout sauf payee (= 4 × 100 = 400)
    // perte = 1 × 100 = 100 → 25%
    const r = tauxDefaut([
      e('a_venir'),
      e('retard_leger'),
      e('defaut'),
      e('perte_definitive'),
    ]);
    expect(r.tauxPerteDefinitive).toBeCloseTo(25, 2);
  });

  it('returns 0 (not NaN) when encours total is zero', () => {
    const r = tauxDefaut([e('payee')]);
    expect(r.tauxRetard).toBe(0);
    expect(r.tauxDefaut).toBe(0);
    expect(r.tauxPerteDefinitive).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`

- [ ] **Step 3: Implement both functions**

Append to `src/kpi/domains/kpi-calculator.ts`:

```typescript
import { ComputedEcheance } from './types';

export function aggregateExposureBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
  amountFn: (item: T) => number,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const item of items) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + amountFn(item);
  }
  return out;
}

export function tauxDefaut(echeances: ComputedEcheance[]): {
  tauxRetard: number;
  tauxDefaut: number;
  tauxPerteDefinitive: number;
} {
  // Encours = capital non encore remboursé (exclut "payee" et "perte_definitive")
  const encoursStatuts: ComputedEcheance['statut'][] = [
    'a_venir',
    'retard_leger',
    'retard_significatif',
    'defaut',
  ];
  const encoursTotal = echeances
    .filter((e) => encoursStatuts.includes(e.statut))
    .reduce((s, e) => s + e.montantCapital, 0);

  const capitalRetard = echeances
    .filter((e) => e.statut === 'retard_leger' || e.statut === 'retard_significatif')
    .reduce((s, e) => s + e.montantCapital, 0);
  const capitalDefaut = echeances
    .filter((e) => e.statut === 'defaut')
    .reduce((s, e) => s + e.montantCapital, 0);

  const capitalPreteTotal = echeances
    .filter((e) => e.statut !== 'payee')
    .reduce((s, e) => s + e.montantCapital, 0);
  const capitalPerte = echeances
    .filter((e) => e.statut === 'perte_definitive')
    .reduce((s, e) => s + e.montantCapital, 0);

  return {
    tauxRetard: encoursTotal > 0 ? (capitalRetard / encoursTotal) * 100 : 0,
    tauxDefaut: encoursTotal > 0 ? (capitalDefaut / encoursTotal) * 100 : 0,
    tauxPerteDefinitive: capitalPreteTotal > 0 ? (capitalPerte / capitalPreteTotal) * 100 : 0,
  };
}
```

Update the type imports at top to include `ComputedEcheance`:

```typescript
import {
  Cashflow,
  ComputedEcheance,
  EcheanceComputedStatus,
  NetCalculationInput,
  NetCalculationOutput,
} from './types';
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/domains/kpi-calculator.spec.ts --no-coverage`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/domains/kpi-calculator.ts src/kpi/domains/kpi-calculator.spec.ts
git commit -m "feat(kpi): add aggregateExposureBy and tauxDefaut"
```

---

## Task 8: Extend `EcheanceStatus` enum

**Files:**
- Modify: `src/investments/domains/enums/investment-status.enum.ts`

- [ ] **Step 1: Add new enum values**

Replace the `EcheanceStatus` enum body in `src/investments/domains/enums/investment-status.enum.ts` so it reads:

```typescript
export enum EcheanceStatus {
  A_VENIR = 'a_venir',
  EN_ATTENTE_PAIEMENT = 'en_attente_paiement',
  PAYE = 'paye',
  RETARD = 'retard',                         // legacy, replaced by RETARD_LEGER (kept for migration window)
  RETARD_LEGER = 'retard_leger',             // J+1 à J+30
  RETARD_SIGNIFICATIF = 'retard_significatif', // J+31 à J+90
  DEFAUT = 'defaut',                         // > J+90
  PERTE_DEFINITIVE = 'perte_definitive',     // décision admin
  IMPAYE = 'impaye',
  ANNULE = 'annule',
}
```

> **Note:** `RETARD` is kept temporarily for safety. Migration 2 (next tasks) will reassign existing rows from `RETARD` to `RETARD_LEGER`. The `RETARD` value can be removed in a follow-up cleanup once verified that no code still references it.

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/investments/domains/enums/investment-status.enum.ts
git commit -m "feat(kpi): extend EcheanceStatus with retard granularity and défaut"
```

---

## Task 9: Add `statutChangeLe` to `EcheanceEntity`

**Files:**
- Modify: `src/investments/infrastructure/persistences/entities/echeance.entity.ts`

- [ ] **Step 1: Add the column**

In `src/investments/infrastructure/persistences/entities/echeance.entity.ts`, just after the `payeLe` column block (around line 50), insert:

```typescript
  @Column({ type: 'timestamptz', nullable: true })
  statutChangeLe: Date | null;
```

So the relevant section reads:

```typescript
  @Column({ type: 'timestamptz', nullable: true })
  payeLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  statutChangeLe: Date | null;

  @Column({ type: 'boolean', default: false })
  rappelJ7Envoye: boolean;
```

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/investments/infrastructure/persistences/entities/echeance.entity.ts
git commit -m "feat(kpi): add statutChangeLe column to EcheanceEntity"
```

---

## Task 10: Add fiscal regime fields to `UserEntity`

**Files:**
- Modify: `src/users/infrastructure/persistences/entities/user.entity.ts`

- [ ] **Step 1: Add `RegimeFiscal` enum and columns**

In `src/users/infrastructure/persistences/entities/user.entity.ts`, just before the `@Entity('users')` line, add:

```typescript
export enum RegimeFiscal {
  PFU = 'PFU',
  BAREME = 'BAREME',
  DISPENSE = 'DISPENSE',
}
```

Then inside the `UserEntity` class, just after the `userType` column (around line 71), add:

```typescript
  @Column({ type: 'varchar', default: RegimeFiscal.PFU })
  regimeFiscal: RegimeFiscal;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  tauxBaremeMarginal: number | null;
```

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/users/infrastructure/persistences/entities/user.entity.ts
git commit -m "feat(kpi): add regimeFiscal and tauxBaremeMarginal to UserEntity"
```

---

## Task 11: Migration 1 — `AddFiscalRegimeToUser`

**Files:**
- Create: `database/migrations/1779000000000-AddFiscalRegimeToUser.ts`

- [ ] **Step 1: Write the migration**

Create `database/migrations/1779000000000-AddFiscalRegimeToUser.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFiscalRegimeToUser1779000000000 implements MigrationInterface {
  name = 'AddFiscalRegimeToUser1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "regimeFiscal" varchar NOT NULL DEFAULT 'PFU'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "tauxBaremeMarginal" decimal(4,3) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tauxBaremeMarginal"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "regimeFiscal"`);
  }
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit database/migrations/1779000000000-AddFiscalRegimeToUser.ts`
Expected: no errors (or no output).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/1779000000000-AddFiscalRegimeToUser.ts
git commit -m "feat(kpi): add migration for fiscal regime fields on users"
```

---

## Task 12: Migration 2 — `ExtendEcheanceStatusAndAddChangeTimestamp`

**Files:**
- Create: `database/migrations/1779000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts`

- [ ] **Step 1: Write the migration**

Create `database/migrations/1779000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendEcheanceStatusAndAddChangeTimestamp1779000000001
  implements MigrationInterface
{
  name = 'ExtendEcheanceStatusAndAddChangeTimestamp1779000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Migrate legacy "retard" rows to "retard_leger" (cron will re-classify next run)
    await queryRunner.query(
      `UPDATE "echeance" SET "statut" = 'retard_leger' WHERE "statut" = 'retard'`,
    );

    // 2. Add timestamp column to detect status transitions
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN "statutChangeLe" timestamptz NULL`,
    );

    // 3. Helpful indexes for cron filtering
    await queryRunner.query(
      `CREATE INDEX "IDX_echeance_statut" ON "echeance" ("statut")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_echeance_datePrevue_statut" ON "echeance" ("datePrevue", "statut")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_echeance_datePrevue_statut"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_echeance_statut"`);
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN "statutChangeLe"`);
    await queryRunner.query(
      `UPDATE "echeance" SET "statut" = 'retard'
        WHERE "statut" IN ('retard_leger', 'retard_significatif', 'defaut', 'perte_definitive')`,
    );
  }
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit database/migrations/1779000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts`

- [ ] **Step 3: Commit**

```bash
git add database/migrations/1779000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts
git commit -m "feat(kpi): add migration for echeance status extension"
```

---

## Task 13: Create `KpiModule` skeleton and wire into `AppModule`

**Files:**
- Create: `src/kpi/kpi.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create the module file**

Create `src/kpi/kpi.module.ts`:

```typescript
import { Module } from '@nestjs/common';

/**
 * Lot 1: module skeleton only. Services and controllers are added in Lot 2 and Lot 3.
 * KpiCalculator is a pure module imported directly by services (no DI needed).
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class KpiModule {}
```

- [ ] **Step 2: Register in `AppModule`**

In `src/app.module.ts`, add the import:

```typescript
import { KpiModule } from './kpi/kpi.module';
```

And add `KpiModule` to the `imports` array (alongside the other feature modules, e.g. right after `NewsModule`):

```typescript
NewsModule,
KpiModule,
AdminModule,
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/kpi/kpi.module.ts src/app.module.ts
git commit -m "feat(kpi): scaffold KpiModule and wire into AppModule"
```

---

## Task 14: Run the full test suite

- [ ] **Step 1: Run all tests**

Run: `npm test -- --testPathPattern=kpi`
Expected: all KPI tests pass (Task 3-7 tests, ~25 cases).

- [ ] **Step 2: Run the full suite (regression check)**

Run: `npm test`
Expected: pre-existing tests still pass (or fail with the same pre-existing failures as before this Lot — no new regressions).

- [ ] **Step 3: If everything is green, no commit needed.**

If unexpected failures: do not commit anything new; investigate which existing tests broke. The most likely culprit is the `EcheanceStatus` enum addition — fix any TypeScript narrowing issues in callers before moving on.

---

## Lot 1 Done

At this point:
- `src/kpi/domains/kpi-calculator.ts` is a pure, fully tested domain module.
- `EcheanceStatus` is extended with retard granularity (data not yet migrated — run `npm run migration:run` in a dev env to verify the migrations actually apply cleanly before moving to Lot 2).
- `UserEntity` has `regimeFiscal` and `tauxBaremeMarginal`.
- `KpiModule` is wired in, ready for Lot 2 services.
- No new public endpoints, no behavior change visible to users yet.

**Next:** Plan 2 — `2026-05-18-kpis-lot2-investor-project.md`.
