# Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the admin/risk dashboard via a daily-refreshed snapshot table, two scheduled cron jobs (status transitions + snapshot generation), a manual loss-declaration endpoint, and the public marketing-doc replacement that aligns BeOwn's communication with its actual crowdlending product.

**Architecture:** A new `KpiSnapshotAdminEntity` stores one row per day with a JSONB `data` field. `AdminKpiService` reads it for fast admin reads, recomputes on-demand for the "refresh" button, and runs at 02:00 every day via `AdminKpiSnapshotJob`. A separate `EcheanceStatusJob` at 01:00 transitions échéances through `retard_leger → retard_significatif → defaut` via cheap SQL `UPDATE`s. A `PostDeclareLossUseCase` lets admins mark a project's outstanding échéances as `PERTE_DEFINITIVE`.

**Tech Stack:** Same as Lots 1 and 2. Cron via `@nestjs/schedule` (already installed and registered globally).

**Spec reference:** [docs/superpowers/specs/2026-05-18-kpis-crowdlending-design.md](../specs/2026-05-18-kpis-crowdlending-design.md) — sections 7, 8, 9.3, 15.

**Prerequisite:** Plans 1 and 2 are fully implemented and committed.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| Create | `src/kpi/infrastructure/persistences/entities/kpi-snapshot-admin.entity.ts` | TypeORM entity for snapshot rows |
| Create | `database/migrations/1779000000002-CreateKpiSnapshotAdmin.ts` | Migration 3 |
| Modify | `src/kpi/domains/types.ts` | `AdminKpiSnapshotData` shape |
| Create | `src/kpi/applications/admin-kpi.service.ts` | Snapshot read + recompute |
| Create | `src/kpi/applications/admin-kpi.service.spec.ts` | Unit tests |
| Create | `src/kpi/applications/echeance-status.job.ts` | Cron 01:00 — status transitions |
| Create | `src/kpi/applications/echeance-status.job.spec.ts` | Tests for the transition logic |
| Create | `src/kpi/applications/admin-kpi-snapshot.job.ts` | Cron 02:00 — snapshot writer |
| Create | `src/kpi/applications/declare-loss.usecase.ts` | Manual perte définitive |
| Create | `src/admin/admin-kpi.controller.ts` | `GET /admin/kpis`, `POST /admin/kpis/refresh`, `GET /admin/kpis/history`, `POST /admin/projects/:projetId/declare-loss` |
| Modify | `src/kpi/kpi.module.ts` | Register entity + service + jobs + use case |
| Modify | `src/admin/admin.module.ts` | Register `AdminKpiController` |
| Create | `docs/marketing/indicateurs-financiers.md` | Replacement marketing content (text only; injected to website CMS by ops) |

---

## Task 1: Define `AdminKpiSnapshotData` type and `KpiSnapshotAdminEntity`

**Files:**
- Modify: `src/kpi/domains/types.ts`
- Create: `src/kpi/infrastructure/persistences/entities/kpi-snapshot-admin.entity.ts`

- [ ] **Step 1: Append the snapshot type**

Append to `src/kpi/domains/types.ts`:

```typescript
import type { ProjectType } from 'src/projects/domains/enums/project-status.enum';

export interface CashflowPrevisionnelMois {
  mois: string; // 'YYYY-MM'
  capitalAttendu: number;
  interetsAttendus: number;
  totalAttendu: number;
}

export interface ExpositionPorteur {
  porteurId: number;
  nbProjets: number;
  encours: number;
  pctEncoursTotal: number;
  nbEcheancesEnRetard: number;
  aEnDefaut: boolean;
}

export interface ExpositionTypeProjet {
  type: ProjectType;
  nbProjets: number;
  encours: number;
  pctEncoursTotal: number;
}

export interface ProjetEnAlerte {
  projetId: string;
  titre: string;
  porteurId: number | null;
  statutSante: 'retard_leger' | 'retard_significatif' | 'defaut';
  nbEcheancesEnRetard: number;
  capitalRestantDu: number;
  joursRetardMax: number;
}

export interface AdminKpiSnapshotData {
  encoursTotal: number;
  capitalInvestiCumule: number;
  capitalRembourseCumule: number;
  interetsVersesCumules: number;
  fraisPlateformeCumules: number;
  nbInvestisseursActifs: number;
  nbProjetsActifs: number;
  nbProjetsCloturesAvecSucces: number;
  nbProjetsEnPerte: number;
  tauxRetardGlobal: number;
  tauxDefautGlobal: number;
  tauxPerteDefinitive: number;
  cashflowPrevisionnel: CashflowPrevisionnelMois[];
  expositionParPorteur: ExpositionPorteur[];
  expositionParTypeProjet: ExpositionTypeProjet[];
  projetsEnAlerte: ProjetEnAlerte[];
}

export interface AdminKpiSnapshotResult {
  data: AdminKpiSnapshotData;
  snapshotDate: string; // 'YYYY-MM-DD'
  stale: boolean;
}
```

- [ ] **Step 2: Create the entity**

Create `src/kpi/infrastructure/persistences/entities/kpi-snapshot-admin.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdminKpiSnapshotData } from 'src/kpi/domains/types';

@Entity('kpi_snapshot_admin')
export class KpiSnapshotAdminEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  @Index()
  snapshotDate: string;

  @Column({ type: 'jsonb' })
  data: AdminKpiSnapshotData;

  @Column({ type: 'integer' })
  computeDurationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/kpi/domains/types.ts src/kpi/infrastructure/persistences/entities/kpi-snapshot-admin.entity.ts
git commit -m "feat(kpi): add admin snapshot entity and types"
```

---

## Task 2: Migration 3 — `CreateKpiSnapshotAdmin`

**Files:**
- Create: `database/migrations/1779000000002-CreateKpiSnapshotAdmin.ts`

- [ ] **Step 1: Write the migration**

Create `database/migrations/1779000000002-CreateKpiSnapshotAdmin.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKpiSnapshotAdmin1779000000002 implements MigrationInterface {
  name = 'CreateKpiSnapshotAdmin1779000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "kpi_snapshot_admin" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "snapshotDate" date NOT NULL,
        "data" jsonb NOT NULL,
        "computeDurationMs" integer NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_kpi_snapshot_date" UNIQUE ("snapshotDate")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kpi_snapshot_date" ON "kpi_snapshot_admin" ("snapshotDate" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kpi_snapshot_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_snapshot_admin"`);
  }
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit database/migrations/1779000000002-CreateKpiSnapshotAdmin.ts`

- [ ] **Step 3: Commit**

```bash
git add database/migrations/1779000000002-CreateKpiSnapshotAdmin.ts
git commit -m "feat(kpi): add migration for kpi_snapshot_admin table"
```

---

## Task 3: TDD — `AdminKpiService.recompute` (compute-from-scratch logic)

**Files:**
- Create: `src/kpi/applications/admin-kpi.service.ts`
- Create: `src/kpi/applications/admin-kpi.service.spec.ts`

- [ ] **Step 1: Write failing tests for `recompute`**

Create `src/kpi/applications/admin-kpi.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminKpiService } from './admin-kpi.service';
import { KpiSnapshotAdminEntity } from '../infrastructure/persistences/entities/kpi-snapshot-admin.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceStatus, InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

describe('AdminKpiService', () => {
  let service: AdminKpiService;

  const mockSnapRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    upsert: jest.fn(),
  };
  const mockProjRepo = { find: jest.fn() };
  const mockInvRepo = { find: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminKpiService,
        { provide: getRepositoryToken(KpiSnapshotAdminEntity), useValue: mockSnapRepo },
        { provide: getRepositoryToken(ProjectEntity), useValue: mockProjRepo },
        { provide: getRepositoryToken(InvestmentEntity), useValue: mockInvRepo },
      ],
    }).compile();

    service = moduleRef.get(AdminKpiService);
    jest.clearAllMocks();
  });

  describe('recompute', () => {
    it('computes a snapshot from project + investment data and upserts it', async () => {
      mockProjRepo.find.mockResolvedValueOnce([
        {
          id: 'p1',
          titre: 'Projet 1',
          porteurId: 100,
          type: 'marchand',
          statut: ProjectStatus.FINANCE,
        },
      ]);
      mockInvRepo.find.mockResolvedValueOnce([
        {
          id: 'i1',
          projetId: 'p1',
          utilisateurId: 1,
          montant: 1000,
          statut: InvestmentStatus.CONFIRME,
          projet: {
            id: 'p1',
            titre: 'Projet 1',
            porteurId: 100,
            type: 'marchand',
            statut: ProjectStatus.FINANCE,
          },
          echeances: [
            {
              numero: 1,
              datePrevue: new Date('2025-02-01'),
              montantCapital: 0,
              montantInterets: 100,
              montantTotal: 100,
              payeLe: new Date('2025-02-02'),
              statut: EcheanceStatus.PAYE,
            },
            {
              numero: 2,
              datePrevue: new Date('2025-03-01'),
              montantCapital: 1000,
              montantInterets: 100,
              montantTotal: 1100,
              payeLe: null,
              statut: EcheanceStatus.A_VENIR,
            },
          ],
        },
      ]);

      const r = await service.recompute();

      expect(r.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.stale).toBe(false);
      expect(r.data.encoursTotal).toBe(1000);
      expect(r.data.capitalInvestiCumule).toBe(1000);
      expect(r.data.interetsVersesCumules).toBe(100);
      expect(r.data.nbInvestisseursActifs).toBe(1);
      expect(r.data.nbProjetsActifs).toBe(1);
      expect(mockSnapRepo.upsert).toHaveBeenCalled();
    });

    it('flags projects with échéances en retard as alerte', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 jours = retard_significatif

      mockProjRepo.find.mockResolvedValueOnce([
        { id: 'p2', titre: 'Late', porteurId: 200, type: 'marchand', statut: ProjectStatus.FINANCE },
      ]);
      mockInvRepo.find.mockResolvedValueOnce([
        {
          id: 'i2',
          projetId: 'p2',
          utilisateurId: 2,
          montant: 500,
          statut: InvestmentStatus.CONFIRME,
          projet: {
            id: 'p2',
            titre: 'Late',
            porteurId: 200,
            type: 'marchand',
            statut: ProjectStatus.FINANCE,
          },
          echeances: [
            {
              numero: 1,
              datePrevue: oldDate,
              montantCapital: 500,
              montantInterets: 40,
              montantTotal: 540,
              payeLe: null,
              statut: EcheanceStatus.RETARD_SIGNIFICATIF,
            },
          ],
        },
      ]);

      const r = await service.recompute();

      expect(r.data.projetsEnAlerte).toHaveLength(1);
      expect(r.data.projetsEnAlerte[0].statutSante).toBe('retard_significatif');
      expect(r.data.projetsEnAlerte[0].joursRetardMax).toBeGreaterThanOrEqual(59);
      expect(r.data.tauxRetardGlobal).toBeGreaterThan(0);
    });
  });

  describe('getLatestSnapshot', () => {
    it('returns stored snapshot when one exists', async () => {
      const today = new Date().toISOString().slice(0, 10);
      mockSnapRepo.findOne.mockResolvedValueOnce({
        snapshotDate: today,
        data: { encoursTotal: 42 },
      });

      const r = await service.getLatestSnapshot();

      expect(r.snapshotDate).toBe(today);
      expect(r.data.encoursTotal).toBe(42);
      expect(r.stale).toBe(false);
    });

    it('flags stale when snapshot is older than 36h', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48);
      const oldStr = oldDate.toISOString().slice(0, 10);
      mockSnapRepo.findOne.mockResolvedValueOnce({
        snapshotDate: oldStr,
        data: { encoursTotal: 42 },
      });

      const r = await service.getLatestSnapshot();

      expect(r.stale).toBe(true);
    });

    it('falls through to recompute when no snapshot exists', async () => {
      mockSnapRepo.findOne.mockResolvedValueOnce(null);
      mockProjRepo.find.mockResolvedValueOnce([]);
      mockInvRepo.find.mockResolvedValueOnce([]);

      const r = await service.getLatestSnapshot();

      expect(r.stale).toBe(false);
      expect(mockSnapRepo.upsert).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns up to N most recent snapshots', async () => {
      mockSnapRepo.find.mockResolvedValueOnce([{ snapshotDate: '2025-01-02' }]);
      const r = await service.getHistory(7);
      expect(r).toHaveLength(1);
      expect(mockSnapRepo.find).toHaveBeenCalledWith({
        order: { snapshotDate: 'DESC' },
        take: 7,
      });
    });
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/applications/admin-kpi.service.spec.ts --no-coverage`

- [ ] **Step 3: Implement the service**

Create `src/kpi/applications/admin-kpi.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { KpiSnapshotAdminEntity } from '../infrastructure/persistences/entities/kpi-snapshot-admin.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus, ProjectType } from 'src/projects/domains/enums/project-status.enum';
import {
  aggregateExposureBy,
  deriveEcheanceStatus,
  tauxDefaut,
} from 'src/kpi/domains/kpi-calculator';
import {
  AdminKpiSnapshotData,
  AdminKpiSnapshotResult,
  CashflowPrevisionnelMois,
  ComputedEcheance,
  ExpositionPorteur,
  ExpositionTypeProjet,
  ProjetEnAlerte,
} from 'src/kpi/domains/types';

const STALE_THRESHOLD_MS = 36 * 3600 * 1000;

@Injectable()
export class AdminKpiService {
  private readonly logger = new Logger(AdminKpiService.name);
  private recomputeInFlight: Promise<AdminKpiSnapshotResult> | null = null;

  constructor(
    @InjectRepository(KpiSnapshotAdminEntity)
    private readonly snapRepo: Repository<KpiSnapshotAdminEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly invRepo: Repository<InvestmentEntity>,
  ) {}

  async getLatestSnapshot(): Promise<AdminKpiSnapshotResult> {
    const latest = await this.snapRepo.findOne({
      where: {},
      order: { snapshotDate: 'DESC' },
    });
    if (!latest) {
      return this.recompute();
    }
    const stale = this.isStale(latest.snapshotDate);
    return { data: latest.data, snapshotDate: latest.snapshotDate, stale };
  }

  async recompute(): Promise<AdminKpiSnapshotResult> {
    // Mutex anti-thundering-herd: réutilise la promesse en cours si déjà un recompute lancé
    if (this.recomputeInFlight) return this.recomputeInFlight;

    this.recomputeInFlight = this.doRecompute().finally(() => {
      this.recomputeInFlight = null;
    });
    return this.recomputeInFlight;
  }

  async getHistory(days = 30): Promise<KpiSnapshotAdminEntity[]> {
    return this.snapRepo.find({
      order: { snapshotDate: 'DESC' },
      take: days,
    });
  }

  async purgeOlderThan(days = 90): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    await this.snapRepo
      .createQueryBuilder()
      .delete()
      .where('"snapshotDate" < :cutoff', { cutoff: cutoffStr })
      .execute();
  }

  private async doRecompute(): Promise<AdminKpiSnapshotResult> {
    const start = Date.now();
    const data = await this.computeFromScratch();
    const today = new Date().toISOString().slice(0, 10);
    const computeDurationMs = Date.now() - start;

    await this.snapRepo.upsert(
      { snapshotDate: today, data, computeDurationMs },
      ['snapshotDate'],
    );

    if (computeDurationMs > 30_000) {
      this.logger.warn(`Snapshot KPI admin lent: ${computeDurationMs}ms`);
    } else {
      this.logger.log(`Snapshot KPI admin créé en ${computeDurationMs}ms`);
    }

    return { data, snapshotDate: today, stale: false };
  }

  private async computeFromScratch(): Promise<AdminKpiSnapshotData> {
    const now = new Date();

    const projects = await this.projRepo.find();
    const investments = await this.invRepo.find({
      where: { statut: Not(InvestmentStatus.ANNULE) },
      relations: ['echeances', 'projet'],
    });

    // Globaux
    const capitalInvestiCumule = investments.reduce(
      (s, i) => s + Number(i.montant),
      0,
    );
    const allEcheances = investments.flatMap((i) => i.echeances ?? []);
    const capitalRembourseCumule = allEcheances
      .filter((e) => !!e.payeLe)
      .reduce((s, e) => s + Number(e.montantCapital), 0);
    const interetsVersesCumules = allEcheances
      .filter((e) => !!e.payeLe)
      .reduce((s, e) => s + Number(e.montantInterets), 0);
    const encoursTotal = allEcheances
      .filter((e) => !e.payeLe)
      .reduce((s, e) => s + Number(e.montantCapital), 0);

    const fraisPlateformeCumules = 0; // si vous ajoutez un champ "fraisPlateforme" payé, calculer ici

    const nbInvestisseursActifs = new Set(
      investments.map((i) => i.utilisateurId),
    ).size;
    const nbProjetsActifs = projects.filter((p) =>
      [
        ProjectStatus.FINANCE,
        ProjectStatus.EN_REMBOURSEMENT,
        ProjectStatus.EN_COLLECTE,
      ].includes(p.statut as ProjectStatus),
    ).length;
    const nbProjetsCloturesAvecSucces = projects.filter(
      (p) => p.statut === ProjectStatus.CLOTURE,
    ).length;
    const nbProjetsEnPerte = projects.filter(
      (p) => p.statut === ProjectStatus.PERTE,
    ).length;

    // Taux retard/défaut/perte
    const computedEcheances: ComputedEcheance[] = allEcheances.map((e) => {
      const s = deriveEcheanceStatus(
        { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
        now,
      );
      return {
        montantCapital: Number(e.montantCapital),
        montantInterets: Number(e.montantInterets),
        statut: s,
      };
    });
    const { tauxRetard, tauxDefaut: tdef, tauxPerteDefinitive } =
      tauxDefaut(computedEcheances);

    // Cashflow prévisionnel — 12 prochains mois
    const cashflowPrevisionnel = this.computeForecast(allEcheances, now);

    // Expositions
    const expositionParPorteur = this.computeExpoPorteur(investments, encoursTotal, now);
    const expositionParTypeProjet = this.computeExpoType(investments, encoursTotal);

    // Projets en alerte
    const projetsEnAlerte = this.computeProjetsEnAlerte(investments, now);

    return {
      encoursTotal,
      capitalInvestiCumule,
      capitalRembourseCumule,
      interetsVersesCumules,
      fraisPlateformeCumules,
      nbInvestisseursActifs,
      nbProjetsActifs,
      nbProjetsCloturesAvecSucces,
      nbProjetsEnPerte,
      tauxRetardGlobal: tauxRetard,
      tauxDefautGlobal: tdef,
      tauxPerteDefinitive,
      cashflowPrevisionnel,
      expositionParPorteur,
      expositionParTypeProjet,
      projetsEnAlerte,
    };
  }

  private computeForecast(
    allEcheances: Array<{
      datePrevue: Date;
      montantCapital: number | string;
      montantInterets: number | string;
      payeLe: Date | null;
    }>,
    now: Date,
  ): CashflowPrevisionnelMois[] {
    const horizon = new Date(now);
    horizon.setMonth(horizon.getMonth() + 12);

    const buckets: Record<string, CashflowPrevisionnelMois> = {};
    for (const e of allEcheances) {
      if (e.payeLe) continue;
      if (e.datePrevue < now || e.datePrevue > horizon) continue;
      const mois = e.datePrevue.toISOString().slice(0, 7);
      const b = (buckets[mois] ??= {
        mois,
        capitalAttendu: 0,
        interetsAttendus: 0,
        totalAttendu: 0,
      });
      b.capitalAttendu += Number(e.montantCapital);
      b.interetsAttendus += Number(e.montantInterets);
      b.totalAttendu += Number(e.montantCapital) + Number(e.montantInterets);
    }
    return Object.values(buckets).sort((a, b) => a.mois.localeCompare(b.mois));
  }

  private computeExpoPorteur(
    investments: InvestmentEntity[],
    encoursTotal: number,
    now: Date,
  ): ExpositionPorteur[] {
    const byPorteur = new Map<number, ExpositionPorteur>();
    for (const inv of investments) {
      const porteurId = (inv.projet as ProjectEntity)?.porteurId ?? 0;
      const encoursInv = (inv.echeances ?? [])
        .filter((e) => !e.payeLe)
        .reduce((s, e) => s + Number(e.montantCapital), 0);

      const retardCount = (inv.echeances ?? []).filter((e) => {
        if (e.payeLe) return false;
        const s = deriveEcheanceStatus(
          { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
          now,
        );
        return s === 'retard_leger' || s === 'retard_significatif';
      }).length;

      const aEnDefaut = (inv.echeances ?? []).some((e) => {
        if (e.payeLe) return false;
        const s = deriveEcheanceStatus(
          { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
          now,
        );
        return s === 'defaut' || s === 'perte_definitive';
      });

      const existing = byPorteur.get(porteurId);
      if (existing) {
        if (!new Set([inv.projetId]).has(inv.projetId)) {
          // unreachable; placeholder for clarity
        }
        existing.encours += encoursInv;
        existing.nbEcheancesEnRetard += retardCount;
        existing.aEnDefaut = existing.aEnDefaut || aEnDefaut;
      } else {
        byPorteur.set(porteurId, {
          porteurId,
          nbProjets: 1,
          encours: encoursInv,
          pctEncoursTotal: 0,
          nbEcheancesEnRetard: retardCount,
          aEnDefaut,
        });
      }
    }
    // Compter les projets uniques par porteur (pas les investissements)
    const projetsByPorteur = new Map<number, Set<string>>();
    for (const inv of investments) {
      const porteurId = (inv.projet as ProjectEntity)?.porteurId ?? 0;
      const s = projetsByPorteur.get(porteurId) ?? new Set<string>();
      s.add(inv.projetId);
      projetsByPorteur.set(porteurId, s);
    }
    for (const [porteurId, set] of projetsByPorteur) {
      const e = byPorteur.get(porteurId);
      if (e) e.nbProjets = set.size;
    }
    // Remplir pctEncoursTotal
    for (const e of byPorteur.values()) {
      e.pctEncoursTotal = encoursTotal > 0 ? (e.encours / encoursTotal) * 100 : 0;
    }
    return Array.from(byPorteur.values()).sort((a, b) => b.encours - a.encours);
  }

  private computeExpoType(
    investments: InvestmentEntity[],
    encoursTotal: number,
  ): ExpositionTypeProjet[] {
    const byType = new Map<ProjectType, ExpositionTypeProjet>();
    const projetsByType = new Map<ProjectType, Set<string>>();
    for (const inv of investments) {
      const type = (inv.projet as ProjectEntity)?.type as ProjectType;
      if (!type) continue;
      const encoursInv = (inv.echeances ?? [])
        .filter((e) => !e.payeLe)
        .reduce((s, e) => s + Number(e.montantCapital), 0);
      const existing = byType.get(type);
      if (existing) {
        existing.encours += encoursInv;
      } else {
        byType.set(type, {
          type,
          nbProjets: 0,
          encours: encoursInv,
          pctEncoursTotal: 0,
        });
      }
      const s = projetsByType.get(type) ?? new Set<string>();
      s.add(inv.projetId);
      projetsByType.set(type, s);
    }
    for (const [type, set] of projetsByType) {
      const e = byType.get(type);
      if (e) e.nbProjets = set.size;
    }
    for (const e of byType.values()) {
      e.pctEncoursTotal = encoursTotal > 0 ? (e.encours / encoursTotal) * 100 : 0;
    }
    return Array.from(byType.values()).sort((a, b) => b.encours - a.encours);
  }

  private computeProjetsEnAlerte(
    investments: InvestmentEntity[],
    now: Date,
  ): ProjetEnAlerte[] {
    const byProjet = new Map<string, ProjetEnAlerte>();
    const rank: Record<ProjetEnAlerte['statutSante'], number> = {
      retard_leger: 1,
      retard_significatif: 2,
      defaut: 3,
    };
    const MS_PER_DAY = 86_400_000;

    for (const inv of investments) {
      for (const e of inv.echeances ?? []) {
        if (e.payeLe) continue;
        const s = deriveEcheanceStatus(
          { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
          now,
        );
        if (s !== 'retard_leger' && s !== 'retard_significatif' && s !== 'defaut') {
          continue;
        }
        const days = Math.max(
          0,
          Math.floor((now.getTime() - e.datePrevue.getTime()) / MS_PER_DAY),
        );

        const existing = byProjet.get(inv.projetId);
        if (existing) {
          existing.nbEcheancesEnRetard++;
          existing.capitalRestantDu += Number(e.montantCapital);
          existing.joursRetardMax = Math.max(existing.joursRetardMax, days);
          if (rank[s] > rank[existing.statutSante]) existing.statutSante = s;
        } else {
          byProjet.set(inv.projetId, {
            projetId: inv.projetId,
            titre: (inv.projet as ProjectEntity)?.titre ?? '',
            porteurId: (inv.projet as ProjectEntity)?.porteurId ?? null,
            statutSante: s,
            nbEcheancesEnRetard: 1,
            capitalRestantDu: Number(e.montantCapital),
            joursRetardMax: days,
          });
        }
      }
    }
    return Array.from(byProjet.values()).sort(
      (a, b) => b.joursRetardMax - a.joursRetardMax,
    );
  }

  private isStale(snapshotDateStr: string): boolean {
    const ts = new Date(snapshotDateStr + 'T00:00:00Z').getTime();
    return Date.now() - ts > STALE_THRESHOLD_MS;
  }
}
```

> **Note:** `ProjectStatus.PERTE` and `ProjectStatus.EN_REMBOURSEMENT` are referenced — if your `ProjectStatus` enum doesn't have those values, either add them in a separate small task or adapt the filter to whatever you do have. The compute won't blow up — those filters will just return 0.

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/applications/admin-kpi.service.spec.ts --no-coverage`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/applications/admin-kpi.service.ts src/kpi/applications/admin-kpi.service.spec.ts
git commit -m "feat(kpi): add AdminKpiService with snapshot + recompute"
```

---

## Task 4: `EcheanceStatusJob` (cron 01:00)

**Files:**
- Create: `src/kpi/applications/echeance-status.job.ts`
- Create: `src/kpi/applications/echeance-status.job.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/kpi/applications/echeance-status.job.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EcheanceStatusJob } from './echeance-status.job';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';

describe('EcheanceStatusJob', () => {
  let job: EcheanceStatusJob;
  const mockRepo = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
  const mockEvents = { emit: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EcheanceStatusJob,
        { provide: getRepositoryToken(EcheanceEntity), useValue: mockRepo },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    job = moduleRef.get(EcheanceStatusJob);
    jest.clearAllMocks();
  });

  function buildQb(affected: number) {
    return {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
  }

  it('runs three SQL updates in retard → défaut order and emits one event per new défaut', async () => {
    const qb1 = buildQb(3);
    const qb2 = buildQb(2);
    const qb3 = buildQb(1);
    mockRepo.createQueryBuilder
      .mockReturnValueOnce(qb1)
      .mockReturnValueOnce(qb2)
      .mockReturnValueOnce(qb3);

    mockRepo.find.mockResolvedValueOnce([
      { id: 'e-1', investissementId: 'i1', statut: 'defaut' },
    ]);

    await job.transitionLatePayments();

    expect(qb1.execute).toHaveBeenCalled();
    expect(qb2.execute).toHaveBeenCalled();
    expect(qb3.execute).toHaveBeenCalled();
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'echeance.defaulted',
      expect.objectContaining({ echeanceId: 'e-1' }),
    );
  });

  it('does not query for new défauts when zero transitions to défaut', async () => {
    const qb1 = buildQb(0);
    const qb2 = buildQb(0);
    const qb3 = buildQb(0);
    mockRepo.createQueryBuilder
      .mockReturnValueOnce(qb1)
      .mockReturnValueOnce(qb2)
      .mockReturnValueOnce(qb3);

    await job.transitionLatePayments();

    expect(mockRepo.find).not.toHaveBeenCalled();
    expect(mockEvents.emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/applications/echeance-status.job.spec.ts --no-coverage`

- [ ] **Step 3: Implement the job**

Create `src/kpi/applications/echeance-status.job.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';

@Injectable()
export class EcheanceStatusJob {
  private readonly logger = new Logger(EcheanceStatusJob.name);

  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly repo: Repository<EcheanceEntity>,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Europe/Paris' })
  async transitionLatePayments(): Promise<void> {
    const start = Date.now();
    const now = new Date();
    const j30 = new Date(now);
    j30.setDate(j30.getDate() - 30);
    const j90 = new Date(now);
    j90.setDate(j90.getDate() - 90);

    // 1) a_venir / en_attente_paiement → retard_leger
    const r1 = await this.repo
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ statut: EcheanceStatus.RETARD_LEGER, statutChangeLe: now })
      .where('statut IN (:...statuts)', {
        statuts: [EcheanceStatus.A_VENIR, EcheanceStatus.EN_ATTENTE_PAIEMENT],
      })
      .andWhere('"payeLe" IS NULL')
      .andWhere('"datePrevue" < :now', { now })
      .execute();

    // 2) retard_leger → retard_significatif (> J+30)
    const r2 = await this.repo
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ statut: EcheanceStatus.RETARD_SIGNIFICATIF, statutChangeLe: now })
      .where('statut = :statut', { statut: EcheanceStatus.RETARD_LEGER })
      .andWhere('"datePrevue" < :j30', { j30 })
      .execute();

    // 3) retard_significatif → defaut (> J+90)
    const r3 = await this.repo
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ statut: EcheanceStatus.DEFAUT, statutChangeLe: now })
      .where('statut = :statut', { statut: EcheanceStatus.RETARD_SIGNIFICATIF })
      .andWhere('"datePrevue" < :j90', { j90 })
      .execute();

    if ((r3.affected ?? 0) > 0) {
      // Récupère les échéances qui viennent juste de basculer en défaut
      // (statutChangeLe est égal à `now` à 1s près).
      // On charge la relation investissement pour exposer projetId dans le payload
      // (consommé par ProjectKpiService pour invalider son cache).
      const cutoff = new Date(now.getTime() - 5_000);
      const newDefaults = await this.repo.find({
        where: { statut: EcheanceStatus.DEFAUT },
        relations: ['investissement'],
      });
      const fresh = newDefaults.filter(
        (e) => e.statutChangeLe && e.statutChangeLe >= cutoff,
      );
      for (const e of fresh) {
        this.events.emit('echeance.defaulted', {
          echeanceId: e.id,
          investissementId: e.investissementId,
          projetId: (e as any).investissement?.projetId,
        });
      }
    }

    this.logger.log(
      `Transitions: +${r1.affected ?? 0} retard_leger, +${r2.affected ?? 0} retard_significatif, +${r3.affected ?? 0} defaut (${Date.now() - start}ms)`,
    );
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/applications/echeance-status.job.spec.ts --no-coverage`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/applications/echeance-status.job.ts src/kpi/applications/echeance-status.job.spec.ts
git commit -m "feat(kpi): add EcheanceStatusJob (cron 01:00 retard/défaut transitions)"
```

---

## Task 5: `AdminKpiSnapshotJob` (cron 02:00)

**Files:**
- Create: `src/kpi/applications/admin-kpi-snapshot.job.ts`

- [ ] **Step 1: Create the job**

Create `src/kpi/applications/admin-kpi-snapshot.job.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminKpiService } from './admin-kpi.service';

@Injectable()
export class AdminKpiSnapshotJob {
  private readonly logger = new Logger(AdminKpiSnapshotJob.name);

  constructor(private readonly service: AdminKpiService) {}

  @Cron('0 2 * * *', { timeZone: 'Europe/Paris' })
  async snapshot(): Promise<void> {
    try {
      const { snapshotDate } = await this.service.recompute();
      this.logger.log(`Snapshot ${snapshotDate} créé.`);
      await this.service.purgeOlderThan(90);
    } catch (err) {
      this.logger.error('Échec snapshot KPI admin', err as Error);
    }
  }
}
```

- [ ] **Step 2: Quick smoke test (no spec — already covered by AdminKpiService tests)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/kpi/applications/admin-kpi-snapshot.job.ts
git commit -m "feat(kpi): add AdminKpiSnapshotJob (cron 02:00)"
```

---

## Task 6: `DeclareLossUseCase`

**Files:**
- Create: `src/kpi/applications/declare-loss.usecase.ts`

- [ ] **Step 1: Create the use case**

Create `src/kpi/applications/declare-loss.usecase.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';

export interface DeclareLossInput {
  projetId: string;
  motif: string;
  dateClotureLoss: Date;
}

@Injectable()
export class DeclareLossUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echRepo: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly invRepo: Repository<InvestmentEntity>,
    private readonly events: EventEmitter2,
  ) {}

  async execute(input: DeclareLossInput): Promise<{ affected: number }> {
    const investments = await this.invRepo.find({
      where: { projetId: input.projetId },
      select: ['id'],
    });
    if (investments.length === 0) {
      throw new NotFoundException('Aucun investissement pour ce projet');
    }
    const invIds = investments.map((i) => i.id);

    // Marque toutes les échéances non payées et en défaut comme perte_definitive
    const result = await this.echRepo
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ statut: EcheanceStatus.PERTE_DEFINITIVE, statutChangeLe: new Date() })
      .where('"investissement_id" IN (:...invIds)', { invIds })
      .andWhere('"payeLe" IS NULL')
      .andWhere('statut IN (:...statuts)', {
        statuts: [
          EcheanceStatus.DEFAUT,
          EcheanceStatus.RETARD_SIGNIFICATIF,
          EcheanceStatus.RETARD_LEGER,
          EcheanceStatus.A_VENIR,
        ],
      })
      .execute();

    this.events.emit('project.loss_declared', {
      projetId: input.projetId,
      motif: input.motif,
      dateClotureLoss: input.dateClotureLoss,
      echeancesAffectees: result.affected ?? 0,
    });

    return { affected: result.affected ?? 0 };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/kpi/applications/declare-loss.usecase.ts
git commit -m "feat(kpi): add DeclareLossUseCase for manual perte définitive"
```

---

## Task 7: `AdminKpiController` (admin module)

**Files:**
- Create: `src/admin/admin-kpi.controller.ts`

- [ ] **Step 1: Create the controller**

Create `src/admin/admin-kpi.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsDateString, IsString, MinLength } from 'class-validator';
import { Roles } from 'src/common/auth/roles.decorator';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { AdminKpiService } from 'src/kpi/applications/admin-kpi.service';
import { DeclareLossUseCase } from 'src/kpi/applications/declare-loss.usecase';

class DeclareLossDto {
  @IsString()
  @MinLength(10)
  motif: string;

  @IsDateString()
  dateClotureLoss: string;
}

@Controller('admin')
@Roles(UserRole.ADMIN, UserRole.COMPLIANCE)
export class AdminKpiController {
  constructor(
    private readonly kpi: AdminKpiService,
    private readonly declareLoss: DeclareLossUseCase,
  ) {}

  @Get('kpis')
  async getKpis() {
    return this.kpi.getLatestSnapshot();
  }

  @Post('kpis/refresh')
  async refresh() {
    return this.kpi.recompute();
  }

  @Get('kpis/history')
  async history(@Query('days', new ParseIntPipe({ optional: true })) days = 30) {
    return this.kpi.getHistory(days);
  }

  @Post('projects/:projetId/declare-loss')
  async declareLossEndpoint(
    @Param('projetId', new ParseUUIDPipe()) projetId: string,
    @Body() dto: DeclareLossDto,
  ) {
    return this.declareLoss.execute({
      projetId,
      motif: dto.motif,
      dateClotureLoss: new Date(dto.dateClotureLoss),
    });
  }
}
```

- [ ] **Step 2: Register the controller in `AdminModule`**

Open `src/admin/admin.module.ts` and:

1. Add the import:

```typescript
import { AdminKpiController } from './admin-kpi.controller';
```

2. Add `AdminKpiController` to the `controllers: [...]` array.

3. The controller needs `AdminKpiService` and `DeclareLossUseCase` from `KpiModule`. The simplest wiring: import `KpiModule` in `AdminModule`. Find the `imports: [...]` array and append:

```typescript
KpiModule,
```

Add at top:

```typescript
import { KpiModule } from 'src/kpi/kpi.module';
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/admin/admin-kpi.controller.ts src/admin/admin.module.ts
git commit -m "feat(kpi): add admin KPI controller (snapshot, refresh, history, declare-loss)"
```

---

## Task 8: Wire `KpiModule` with all Lot 3 additions

**Files:**
- Modify: `src/kpi/kpi.module.ts`

- [ ] **Step 1: Update the module**

Replace the contents of `src/kpi/kpi.module.ts` (incrementally on top of Lot 2) with:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestorKpiService } from './applications/investor-kpi.service';
import { ProjectKpiService } from './applications/project-kpi.service';
import { AdminKpiService } from './applications/admin-kpi.service';
import { EcheanceStatusJob } from './applications/echeance-status.job';
import { AdminKpiSnapshotJob } from './applications/admin-kpi-snapshot.job';
import { DeclareLossUseCase } from './applications/declare-loss.usecase';
import { InvestorKpiController } from './presenters/http/investor-kpi.controller';
import { ProjectKpiController } from './presenters/http/project-kpi.controller';
import { KpiSnapshotAdminEntity } from './infrastructure/persistences/entities/kpi-snapshot-admin.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      InvestmentEntity,
      EcheanceEntity,
      UserEntity,
      KpiSnapshotAdminEntity,
    ]),
  ],
  controllers: [InvestorKpiController, ProjectKpiController],
  providers: [
    InvestorKpiService,
    ProjectKpiService,
    AdminKpiService,
    EcheanceStatusJob,
    AdminKpiSnapshotJob,
    DeclareLossUseCase,
  ],
  exports: [
    InvestorKpiService,
    ProjectKpiService,
    AdminKpiService,
    DeclareLossUseCase,
  ],
})
export class KpiModule {}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/kpi/kpi.module.ts
git commit -m "feat(kpi): wire Lot 3 services, jobs, and use case into KpiModule"
```

---

## Task 9: Marketing doc replacement

**Files:**
- Create: `docs/marketing/indicateurs-financiers.md`

This is the source-of-truth text for the public marketing content. Ops will inject it into the website CMS or wherever the original "5 formules" lived. The doc is committed to the repo for traceability.

- [ ] **Step 1: Create the marketing doc**

Create `docs/marketing/indicateurs-financiers.md`:

```markdown
# 6. Indicateurs financiers BeOwn

> **Note** : BeOwn est une plateforme de crowdlending obligataire (prêt avec intérêts), pas d'investissement locatif direct. Les indicateurs sont adaptés à ce type de produit : pas de loyer, pas de plus-value de revente, pas de taux d'occupation. Le rendement est connu à l'avance (TRI cible) et se matérialise par des intérêts versés selon un échéancier contractualisé.

---

## A. TRI cible (Taux de Rendement Interne cible)

Le rendement annualisé visé par le projet, défini à l'avance.

> **Formule** : `TRI cible = taux d'intérêt nominal du prêt`

> **Exemple** : projet à TRI cible 9% sur 24 mois — vous investissez 1 000 €, vous percevez environ 90 € d'intérêts bruts par an.

---

## B. TRI réalisé

Le rendement annualisé effectivement perçu sur les flux déjà encaissés, calculé selon la méthode IRR (Internal Rate of Return).

> **Formule** : taux qui annule `NPV = Σ (Fluxᵢ / (1 + TRI)^tᵢ)`, où Fluxᵢ inclut l'investissement initial (négatif) et chaque échéance reçue (positive).

Si tous les remboursements sont à l'heure, **TRI réalisé ≈ TRI cible**. Un retard fait baisser le TRI réalisé.

---

## C. ROI net cumulé

Le gain net (après fiscalité) rapporté au capital investi, en pourcentage.

> **Formule** : `ROI net = (Intérêts nets cumulés / Capital investi) × 100`

Fiscalité par défaut : **PFU 30%** (12,8% IR + 17,2% prélèvements sociaux). Toggle barème progressif possible depuis le profil.

> **Exemple** : 1 000 € investi, 180 € d'intérêts bruts, PFU 30% (−54 €) → ROI net = 12,6%.

---

## D. Capital restant dû (CRD)

Capital encore à rembourser sur les investissements en cours.

> **Formule** : `CRD = Σ (capital_échéance) pour échéances non payées`

Diminue à chaque échéance versée. À 0 = projet remboursé.

---

## E. Durée résiduelle moyenne pondérée (WAL)

Durée moyenne avant remboursement intégral, pondérée par les montants de capital.

> **Formule** : `WAL = Σ (temps × capital_remboursé_t) / Σ (capital_remboursé_total)`

> **Exemple** : in fine 24 mois → WAL = 24 mois. Linéaire mensuel 24 mois → WAL ≈ 12 mois.

---

## F. Cashflow net

Flux financiers nets encaissés sur une période.

> **Formule** : `Cashflow net = Σ (échéances perçues) − Σ (prélèvements fiscaux)`

Indicateur clé pour le rendement mensuel réel.

---

## G. Taux de retard et taux de défaut

Indicateurs de risque, visibles au niveau projet et plateforme.

- **Retard léger** : J+1 à J+30
- **Retard significatif** : J+31 à J+90
- **Défaut** : > J+90 (capital à risque)
- **Perte définitive** : décision officielle (liquidation, accord transactionnel défavorable)

> Formules globales :
> - `Taux de retard = (capital en retard / encours total) × 100`
> - `Taux de défaut = (capital en défaut / encours total) × 100`
> - `Taux de perte = (capital perdu définitivement / capital prêté cumulé) × 100`

---

## Cohérence terminologique

| Concept | Libellé affiché | Champ API |
|---|---|---|
| TRI cible | "TRI cible" | `triCible` |
| TRI réalisé | "TRI réalisé" | `triRealise` |
| ROI net | "ROI net" | (dérivé) |
| Capital restant dû | "Capital restant dû" / "CRD" | `capitalRestantDu` |
| Durée résiduelle pondérée | "Durée résiduelle pondérée" / "WAL" | `walMois` |
| Cashflow net | "Cashflow net cumulé" | `cashflowNetCumule` |
```

- [ ] **Step 2: Commit**

```bash
git add docs/marketing/indicateurs-financiers.md
git commit -m "docs(marketing): replace 5 immo formulas with crowdlending indicators"
```

- [ ] **Step 3: Notify ops to update website CMS**

This is a process step, not code. Ping the team responsible for the public website with the path `docs/marketing/indicateurs-financiers.md` so they can replace the existing "section 6" content.

---

## Task 10: Manual smoke test + 36h-stale validation

This is a checkpoint task — no code committed.

- [ ] **Step 1: Apply Migration 3**

Run: `npm run migration:run`
Expected: `CreateKpiSnapshotAdmin` migration applied.

- [ ] **Step 2: Run the app and hit admin endpoints**

Run: `npm run start:dev`

With an admin JWT in `$ADMIN_TOKEN`:

```bash
# First call: no snapshot exists, triggers a recompute (may take seconds)
curl -s http://localhost:3000/admin/kpis -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# Second call: returns cached snapshot
curl -s http://localhost:3000/admin/kpis -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# Force a refresh
curl -s -X POST http://localhost:3000/admin/kpis/refresh -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# History (last 30 days)
curl -s http://localhost:3000/admin/kpis/history -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# Declare loss (use a real project UUID; will only affect non-payée échéances)
curl -s -X POST http://localhost:3000/admin/projects/$PROJET_ID/declare-loss \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"motif":"Liquidation judiciaire du porteur","dateClotureLoss":"2026-05-18"}' | jq .
```

Expected: each call returns a proper JSON payload matching the types defined in Task 1. Admin role is enforced; calling with an investor JWT returns 403.

- [ ] **Step 3: Stale-flag validation (optional)**

Manually backdate a snapshot in DB:

```sql
UPDATE kpi_snapshot_admin
SET "snapshotDate" = (CURRENT_DATE - INTERVAL '2 days')::date
WHERE id = (SELECT id FROM kpi_snapshot_admin ORDER BY "snapshotDate" DESC LIMIT 1);
```

Hit `GET /admin/kpis` again. Expected: `stale: true` in response.

Restore (run the snapshot job manually or wait for the cron):

```bash
curl -s -X POST http://localhost:3000/admin/kpis/refresh -H "Authorization: Bearer $ADMIN_TOKEN"
```

- [ ] **Step 4: Cron schedules (no manual test possible without time-skipping)**

Verify by checking app logs at 01:00 and 02:00 Paris time on the dev environment. Expected log entries:

```
[EcheanceStatusJob] Transitions: +X retard_leger, +Y retard_significatif, +Z defaut (Nms)
[AdminKpiSnapshotJob] Snapshot YYYY-MM-DD créé.
```

If a job doesn't run, check that `ScheduleModule.forRoot()` is in `AppModule` (it is — verified during exploration).

---

## Lot 3 Done

Final state:
- **Three new admin endpoints** : `GET /admin/kpis`, `POST /admin/kpis/refresh`, `GET /admin/kpis/history`.
- **Loss-declaration endpoint** : `POST /admin/projects/:projetId/declare-loss`.
- **Two crons running daily** : status transitions at 01:00, snapshot at 02:00, both Europe/Paris.
- **Marketing doc** committed to repo, ready for ops to push to the public site.
- **All KPI tests passing** ; manual smoke test verified end-to-end.

**The full KPI crowdlending implementation is complete.** Suggested follow-ups (not in scope):
- Cross-investment IRR aggregation (currently `null` in investor portfolio)
- Sentry/Datadog metrics for `computeDurationMs`
- Front-end integration (separate repo)
- Cleanup of legacy `EcheanceStatus.RETARD` value after a soak period
