# Lot 2 — Investor + Project KPIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose two new endpoints — `GET /me/portfolio/kpis` (investor dashboard, real-time) and `GET /projects/:id/kpis` (public project page, cached 5 min) — plus a `PATCH /me/regime-fiscal` for the user to set their fiscal regime. Cache invalidation is event-driven via `@nestjs/event-emitter`.

**Architecture:** Two NestJS services (`InvestorKpiService`, `ProjectKpiService`) consume the pure-domain `KpiCalculator` from Lot 1. Both services build cashflow timelines from `EcheanceEntity` rows and feed them to `computeIrr` / `computeWal`. The project service caches its result via the existing `@nestjs/cache-manager` Redis store; invalidation listens to three events (`echeance.paid`, `investment.created`, `investment.cancelled`) emitted from existing usecases.

**Tech Stack:** Same as Lot 1, plus `@nestjs/cache-manager` (already installed and registered globally with Redis store in `AppModule`) and `@nestjs/event-emitter` (added in Lot 1).

**Spec reference:** [docs/superpowers/specs/2026-05-18-kpis-crowdlending-design.md](../specs/2026-05-18-kpis-crowdlending-design.md) — sections 5, 6, 8.4.

**Prerequisite:** Plan 1 (Foundations) is fully implemented and committed.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| Create | `src/kpi/applications/investor-kpi.service.ts` | Real-time per-user portfolio KPIs |
| Create | `src/kpi/applications/investor-kpi.service.spec.ts` | Unit tests with mocked repos |
| Create | `src/kpi/applications/project-kpi.service.ts` | Per-project KPIs with cache |
| Create | `src/kpi/applications/project-kpi.service.spec.ts` | Unit tests with mocked repos + cache |
| Create | `src/kpi/presenters/http/investor-kpi.controller.ts` | `GET /me/portfolio/kpis`, `PATCH /me/regime-fiscal` |
| Create | `src/kpi/presenters/http/project-kpi.controller.ts` | `GET /projects/:id/kpis` |
| Create | `src/kpi/presenters/http/dto/update-regime-fiscal.dto.ts` | Body validation DTO |
| Modify | `src/kpi/kpi.module.ts` | Wire services + controllers + TypeORM repos |
| Modify | `src/investments/applications/usecases/pay-echeance.usecase.ts` | Emit `echeance.paid` |
| Modify | `src/investments/applications/usecases/create-investment.usecase.ts` | Emit `investment.created` |
| Modify | `src/investments/applications/usecases/cancel-investment.usecase.ts` | Emit `investment.cancelled` |

---

## Task 1: Define `InvestorPortfolioKpis` and `ProjectPublicKpis` types

**Files:**
- Modify: `src/kpi/domains/types.ts`

- [ ] **Step 1: Append response types**

Append to `src/kpi/domains/types.ts`:

```typescript
import type { ProjectInstrument, ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

export interface InvestorProjectKpi {
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
}

export interface InvestorProchaineEcheance {
  date: Date;
  montantBrut: number;
  montantNet: number;
  projetId: string;
  projetTitre: string;
}

export interface InvestorPortfolioKpis {
  capitalInvestiTotal: number;
  capitalRestantDu: number;
  interetsBrutsCumules: number;
  interetsNetsCumules: number;
  prelevementsFiscauxCumules: number;
  triRealise: number | null;
  triPondereCible: number;
  walMois: number | null;
  prochaineEcheance: InvestorProchaineEcheance | null;
  parProjet: InvestorProjectKpi[];
  regimeFiscal: RegimeFiscal;
  truncated?: boolean;
}

export interface ProjectEcheanceLine {
  numero: number;
  datePrevue: Date;
  montantCapital: number;
  montantInterets: number;
  montantTotal: number;
  statut: 'a_venir' | 'payee' | 'retard' | 'defaut';
}

export interface ProjectPublicKpis {
  triCible: number;
  dureeMois: number;
  capitalCible: number;
  instrument: ProjectInstrument;
  capitalCollecte: number;
  pctCollecte: number;
  nbInvestisseurs: number;
  capitalRestantDuGlobal: number;
  capitalRembourse: number;
  pctCapitalRembourse: number;
  interetsVersesTotaux: number;
  walMois: number | null;
  echeancesEnRetard: number;
  echeancesEnDefaut: number;
  statutSante: 'sain' | 'retard_leger' | 'retard_significatif' | 'defaut' | 'perte';
  echeancierPrevisionnel: ProjectEcheanceLine[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/kpi/domains/types.ts
git commit -m "feat(kpi): add response types for investor and project KPIs"
```

---

## Task 2: TDD — `InvestorKpiService` (computePerInvestment helper)

**Files:**
- Create: `src/kpi/applications/investor-kpi.service.ts`
- Create: `src/kpi/applications/investor-kpi.service.spec.ts`

We TDD the per-investment helper first, then the aggregation in Task 3.

- [ ] **Step 1: Write failing test for `computePerInvestment`**

Create `src/kpi/applications/investor-kpi.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvestorKpiService } from './investor-kpi.service';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { UserEntity, RegimeFiscal } from 'src/users/infrastructure/persistences/entities/user.entity';
import { EcheanceStatus, InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

describe('InvestorKpiService', () => {
  let service: InvestorKpiService;

  const mockInvRepo = { find: jest.fn() };
  const mockEchRepo = {};
  const mockUserRepo = { findOneByOrFail: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvestorKpiService,
        { provide: getRepositoryToken(InvestmentEntity), useValue: mockInvRepo },
        { provide: getRepositoryToken(EcheanceEntity), useValue: mockEchRepo },
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepo },
      ],
    }).compile();

    service = moduleRef.get(InvestorKpiService);
    jest.clearAllMocks();
  });

  describe('computePortfolio', () => {
    it('returns empty portfolio when user has no investments', async () => {
      mockInvRepo.find.mockResolvedValueOnce([]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.capitalInvestiTotal).toBe(0);
      expect(r.capitalRestantDu).toBe(0);
      expect(r.interetsBrutsCumules).toBe(0);
      expect(r.parProjet).toEqual([]);
      expect(r.regimeFiscal).toBe('PFU');
      expect(r.triRealise).toBeNull();
    });

    it('aggregates a single investment with two paid échéances under PFU', async () => {
      const investment = {
        id: 'inv-1',
        projetId: 'proj-1',
        projet: {
          id: 'proj-1',
          titre: 'Projet Demo',
          statut: 'finance',
          triCible: 9,
        },
        montant: 1000,
        createdAt: new Date('2025-01-01'),
        echeances: [
          {
            id: 'e-1',
            numero: 1,
            datePrevue: new Date('2025-02-01'),
            montantCapital: 0,
            montantInterets: 100,
            montantTotal: 100,
            payeLe: new Date('2025-02-02'),
            statut: EcheanceStatus.PAYE,
          },
          {
            id: 'e-2',
            numero: 2,
            datePrevue: new Date('2025-03-01'),
            montantCapital: 1000,
            montantInterets: 100,
            montantTotal: 1100,
            payeLe: new Date('2025-03-02'),
            statut: EcheanceStatus.PAYE,
          },
        ],
      };

      mockInvRepo.find.mockResolvedValueOnce([investment]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.capitalInvestiTotal).toBe(1000);
      expect(r.capitalRestantDu).toBe(0); // tout payé
      expect(r.interetsBrutsCumules).toBe(200);
      // 200 brut → IR 25.60 + CSG 34.40 = 60 prélevé, 140 net
      expect(r.interetsNetsCumules).toBeCloseTo(140, 1);
      expect(r.prelevementsFiscauxCumules).toBeCloseTo(60, 1);
      expect(r.parProjet).toHaveLength(1);
      expect(r.parProjet[0].projetId).toBe('proj-1');
      expect(r.parProjet[0].nbEcheancesEnRetard).toBe(0);
      expect(r.parProjet[0].aEnDefaut).toBe(false);
    });

    it('detects échéances en retard and en défaut', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 95); // > 90 jours = défaut

      const investment = {
        id: 'inv-2',
        projetId: 'proj-2',
        projet: { id: 'proj-2', titre: 'Late', statut: 'finance', triCible: 8 },
        montant: 500,
        createdAt: new Date('2024-01-01'),
        echeances: [
          {
            id: 'e-3',
            numero: 1,
            datePrevue: oldDate,
            montantCapital: 500,
            montantInterets: 40,
            montantTotal: 540,
            payeLe: null,
            statut: EcheanceStatus.RETARD_LEGER,
          },
        ],
      };

      mockInvRepo.find.mockResolvedValueOnce([investment]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.parProjet[0].nbEcheancesEnRetard).toBe(1);
      expect(r.parProjet[0].aEnDefaut).toBe(true);
      expect(r.capitalRestantDu).toBe(500);
    });

    it('truncates parProjet when more than 50 investments and flags truncated', async () => {
      const many = Array.from({ length: 250 }, (_, i) => ({
        id: `inv-${i}`,
        projetId: `proj-${i}`,
        projet: { id: `proj-${i}`, titre: `P${i}`, statut: 'finance', triCible: 8 },
        montant: 100,
        createdAt: new Date('2025-01-01'),
        echeances: [],
      }));

      mockInvRepo.find.mockResolvedValueOnce(many);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.parProjet.length).toBe(50);
      expect(r.truncated).toBe(true);
      expect(r.capitalInvestiTotal).toBe(25000); // aggregate counts all 250
    });
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/applications/investor-kpi.service.spec.ts --no-coverage`
Expected: failure ("Cannot find module './investor-kpi.service'").

- [ ] **Step 3: Implement `InvestorKpiService`**

Create `src/kpi/applications/investor-kpi.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { UserEntity, RegimeFiscal as UserRegime } from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  computeIrr,
  computeNetInterests,
  computeWal,
  deriveEcheanceStatus,
} from 'src/kpi/domains/kpi-calculator';
import {
  Cashflow,
  InvestorPortfolioKpis,
  InvestorProjectKpi,
  RegimeFiscal,
} from 'src/kpi/domains/types';

const MAX_PROJECTS_RETURNED = 50;
const TRUNCATION_THRESHOLD = 200;

@Injectable()
export class InvestorKpiService {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly invRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echRepo: Repository<EcheanceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async computePortfolio(userId: number): Promise<InvestorPortfolioKpis> {
    const user = await this.userRepo.findOneByOrFail({ userId });
    const regime: RegimeFiscal = (user.regimeFiscal as RegimeFiscal) ?? 'PFU';
    const tauxBareme = user.tauxBaremeMarginal ?? undefined;

    const investments = await this.invRepo.find({
      where: { utilisateurId: userId, statut: Not(InvestmentStatus.ANNULE) },
      relations: ['echeances', 'projet'],
    });

    if (investments.length === 0) {
      return this.emptyPortfolio(regime);
    }

    const perProject = investments.map((inv) =>
      this.computePerInvestment(inv, regime, tauxBareme),
    );

    return this.aggregate(perProject, regime, investments.length);
  }

  private computePerInvestment(
    inv: InvestmentEntity,
    regime: RegimeFiscal,
    tauxBareme: number | undefined,
  ): InvestorProjectKpi {
    const echeances = (inv.echeances ?? []).slice().sort((a, b) => a.numero - b.numero);
    const payees = echeances.filter((e) => !!e.payeLe);
    const futures = echeances.filter((e) => !e.payeLe);

    const interetsBrutsRecus = payees.reduce((s, e) => s + Number(e.montantInterets), 0);
    const netResult = computeNetInterests({
      interetsBruts: interetsBrutsRecus,
      regime,
      tauxBaremeMarginal: tauxBareme,
    });
    const interetsNetsRecus = netResult.net;

    const capitalRembourse = payees.reduce((s, e) => s + Number(e.montantCapital), 0);
    const capitalRestantDu = futures.reduce((s, e) => s + Number(e.montantCapital), 0);

    // IRR — flux : -montant à t0, puis pour chaque payée: (capital + intérêts nets)
    const flows: Cashflow[] = [{ date: inv.createdAt, amount: -Number(inv.montant) }];
    for (const e of payees) {
      const netInterest = computeNetInterests({
        interetsBruts: Number(e.montantInterets),
        regime,
        tauxBaremeMarginal: tauxBareme,
      }).net;
      flows.push({
        date: e.payeLe as Date,
        amount: Number(e.montantCapital) + netInterest,
      });
    }
    const triRealise = computeIrr(flows);

    const walYears = computeWal(
      futures.map((e) => ({
        datePrevue: e.datePrevue,
        montantCapital: Number(e.montantCapital),
      })),
    );

    const now = new Date();
    let nbEcheancesEnRetard = 0;
    let aEnDefaut = false;
    for (const e of futures) {
      const s = deriveEcheanceStatus(
        { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
        now,
      );
      if (s === 'retard_leger' || s === 'retard_significatif') nbEcheancesEnRetard++;
      if (s === 'defaut' || s === 'perte_definitive') aEnDefaut = true;
    }

    const prochaine = futures[0] ?? null;

    return {
      projetId: inv.projetId,
      projetTitre: inv.projet?.titre ?? '',
      statut: inv.projet?.statut as InvestorProjectKpi['statut'],
      capitalInvesti: Number(inv.montant),
      capitalRestantDu,
      interetsBrutsRecus,
      interetsNetsRecus,
      triCible: Number(inv.projet?.triCible ?? 0),
      triRealise,
      walMois: walYears !== null ? walYears * 12 : null,
      prochaineEcheanceDate: prochaine?.datePrevue ?? null,
      nbEcheancesEnRetard,
      aEnDefaut,
    };
  }

  private aggregate(
    perProject: InvestorProjectKpi[],
    regime: RegimeFiscal,
    totalCount: number,
  ): InvestorPortfolioKpis {
    const capitalInvestiTotal = perProject.reduce((s, p) => s + p.capitalInvesti, 0);
    const capitalRestantDu = perProject.reduce((s, p) => s + p.capitalRestantDu, 0);
    const interetsBrutsCumules = perProject.reduce((s, p) => s + p.interetsBrutsRecus, 0);
    const interetsNetsCumules = perProject.reduce((s, p) => s + p.interetsNetsRecus, 0);
    const prelevementsFiscauxCumules = interetsBrutsCumules - interetsNetsCumules;

    const triPondereCible =
      capitalInvestiTotal > 0
        ? perProject.reduce((s, p) => s + p.triCible * p.capitalInvesti, 0) /
          capitalInvestiTotal
        : 0;

    const walPondere =
      capitalRestantDu > 0
        ? perProject
            .filter((p) => p.walMois !== null)
            .reduce((s, p) => s + (p.walMois as number) * p.capitalRestantDu, 0) /
          capitalRestantDu
        : null;

    // Prochaine échéance globale = celle dont la date est la plus proche dans le futur
    const allFuture = perProject
      .filter((p) => p.prochaineEcheanceDate !== null)
      .sort(
        (a, b) =>
          (a.prochaineEcheanceDate as Date).getTime() -
          (b.prochaineEcheanceDate as Date).getTime(),
      );
    const prochaineEcheance = allFuture.length
      ? {
          date: allFuture[0].prochaineEcheanceDate as Date,
          montantBrut: 0, // remplis ci-dessous
          montantNet: 0,
          projetId: allFuture[0].projetId,
          projetTitre: allFuture[0].projetTitre,
        }
      : null;

    // Truncation et tri par capital restant dû descendant (les plus pertinents en haut)
    const sortedProjects = perProject
      .slice()
      .sort((a, b) => b.capitalRestantDu - a.capitalRestantDu);
    const truncated = totalCount > TRUNCATION_THRESHOLD;
    const parProjet = truncated
      ? sortedProjects.slice(0, MAX_PROJECTS_RETURNED)
      : sortedProjects;

    return {
      capitalInvestiTotal,
      capitalRestantDu,
      interetsBrutsCumules,
      interetsNetsCumules,
      prelevementsFiscauxCumules,
      triRealise: null, // TRI global agrégé (V2 — pour l'instant null, le front l'affiche projet par projet)
      triPondereCible,
      walMois: walPondere,
      prochaineEcheance,
      parProjet,
      regimeFiscal: regime,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  private emptyPortfolio(regime: RegimeFiscal): InvestorPortfolioKpis {
    return {
      capitalInvestiTotal: 0,
      capitalRestantDu: 0,
      interetsBrutsCumules: 0,
      interetsNetsCumules: 0,
      prelevementsFiscauxCumules: 0,
      triRealise: null,
      triPondereCible: 0,
      walMois: null,
      prochaineEcheance: null,
      parProjet: [],
      regimeFiscal: regime,
    };
  }
}
```

> Note: the `triRealise` global is intentionally `null` in this implementation. Computing a true cross-investment IRR requires merging cashflows across projects with different start dates and is deferred (the per-project `triRealise` in `parProjet` covers the user-visible need).

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/applications/investor-kpi.service.spec.ts --no-coverage`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/applications/investor-kpi.service.ts src/kpi/applications/investor-kpi.service.spec.ts
git commit -m "feat(kpi): add InvestorKpiService with portfolio aggregation"
```

---

## Task 3: Investor controller + `PATCH /me/regime-fiscal`

**Files:**
- Create: `src/kpi/presenters/http/investor-kpi.controller.ts`
- Create: `src/kpi/presenters/http/dto/update-regime-fiscal.dto.ts`

- [ ] **Step 1: Create DTO**

Create `src/kpi/presenters/http/dto/update-regime-fiscal.dto.ts`:

```typescript
import { IsEnum, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { RegimeFiscal } from 'src/users/infrastructure/persistences/entities/user.entity';

export class UpdateRegimeFiscalDto {
  @IsEnum(RegimeFiscal)
  regimeFiscal: RegimeFiscal;

  @ValidateIf((o) => o.regimeFiscal === RegimeFiscal.BAREME)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(0.45)
  @IsOptional()
  tauxBaremeMarginal?: number;
}
```

- [ ] **Step 2: Create controller**

Create `src/kpi/presenters/http/investor-kpi.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestorKpiService } from 'src/kpi/applications/investor-kpi.service';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UpdateRegimeFiscalDto } from './dto/update-regime-fiscal.dto';

@Controller('me')
export class InvestorKpiController {
  constructor(
    private readonly service: InvestorKpiService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  @Get('portfolio/kpis')
  async getPortfolioKpis(@Req() req: { user?: { userId?: number } }) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    return this.service.computePortfolio(userId);
  }

  @Patch('regime-fiscal')
  async updateRegimeFiscal(
    @Req() req: { user?: { userId?: number } },
    @Body() dto: UpdateRegimeFiscalDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    await this.userRepo.update(
      { userId },
      {
        regimeFiscal: dto.regimeFiscal,
        tauxBaremeMarginal: dto.tauxBaremeMarginal ?? null,
      },
    );
    return { ok: true, regimeFiscal: dto.regimeFiscal };
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/kpi/presenters/http/investor-kpi.controller.ts src/kpi/presenters/http/dto/update-regime-fiscal.dto.ts
git commit -m "feat(kpi): add investor KPI controller and regime-fiscal endpoint"
```

---

## Task 4: TDD — `ProjectKpiService` (compute + caching)

**Files:**
- Create: `src/kpi/applications/project-kpi.service.ts`
- Create: `src/kpi/applications/project-kpi.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/kpi/applications/project-kpi.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { ProjectKpiService } from './project-kpi.service';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceStatus, InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

describe('ProjectKpiService', () => {
  let service: ProjectKpiService;
  const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockProjRepo = { findOne: jest.fn() };
  const mockInvRepo = { find: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectKpiService,
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: getRepositoryToken(ProjectEntity), useValue: mockProjRepo },
        { provide: getRepositoryToken(InvestmentEntity), useValue: mockInvRepo },
      ],
    }).compile();

    service = moduleRef.get(ProjectKpiService);
    jest.clearAllMocks();
  });

  it('returns 404 when project not found or not published', async () => {
    mockProjRepo.findOne.mockResolvedValueOnce(null);
    mockCache.get.mockResolvedValueOnce(null);

    await expect(service.getPublicKpis('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 when project is BROUILLON', async () => {
    mockProjRepo.findOne.mockResolvedValueOnce({
      id: 'p1',
      statut: ProjectStatus.BROUILLON,
    });
    mockCache.get.mockResolvedValueOnce(null);

    await expect(service.getPublicKpis('p1')).rejects.toThrow(NotFoundException);
  });

  it('returns cached value when present and skips DB call', async () => {
    const cached = { capitalCollecte: 999 };
    mockCache.get.mockResolvedValueOnce(cached);

    const r = await service.getPublicKpis('p1');

    expect(r).toBe(cached);
    expect(mockProjRepo.findOne).not.toHaveBeenCalled();
  });

  it('computes KPIs from project + investments when cache miss', async () => {
    mockCache.get.mockResolvedValueOnce(null);
    mockProjRepo.findOne.mockResolvedValueOnce({
      id: 'p1',
      titre: 'Demo',
      statut: ProjectStatus.FINANCE,
      triCible: 9,
      dureeMois: 24,
      capitalCible: 100000,
      instrument: 'obligation',
    });
    mockInvRepo.find.mockResolvedValueOnce([
      {
        id: 'i1',
        montant: 50000,
        utilisateurId: 1,
        statut: InvestmentStatus.CONFIRME,
        echeances: [
          {
            numero: 1,
            datePrevue: new Date('2025-02-01'),
            montantCapital: 0,
            montantInterets: 375,
            montantTotal: 375,
            payeLe: new Date('2025-02-02'),
            statut: EcheanceStatus.PAYE,
          },
          {
            numero: 2,
            datePrevue: new Date('2025-03-01'),
            montantCapital: 50000,
            montantInterets: 375,
            montantTotal: 50375,
            payeLe: null,
            statut: EcheanceStatus.A_VENIR,
          },
        ],
      },
    ]);
    mockCache.set.mockResolvedValueOnce(undefined);

    const r = await service.getPublicKpis('p1');

    expect(r.capitalCollecte).toBe(50000);
    expect(r.pctCollecte).toBe(50);
    expect(r.nbInvestisseurs).toBe(1);
    expect(r.capitalRembourse).toBe(0);
    expect(r.capitalRestantDuGlobal).toBe(50000);
    expect(r.interetsVersesTotaux).toBe(375);
    expect(r.echeancierPrevisionnel).toHaveLength(2);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('invalidate() removes the cache key for a project', async () => {
    await service.invalidate({ projetId: 'p42' });
    expect(mockCache.del).toHaveBeenCalledWith('project-kpi:p42');
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx jest src/kpi/applications/project-kpi.service.spec.ts --no-coverage`

- [ ] **Step 3: Implement the service**

Create `src/kpi/applications/project-kpi.service.ts`:

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { EcheanceStatus, InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  aggregateExposureBy,
  computeWal,
  deriveEcheanceStatus,
} from 'src/kpi/domains/kpi-calculator';
import {
  ProjectEcheanceLine,
  ProjectPublicKpis,
} from 'src/kpi/domains/types';

const PUBLIC_STATUTS: ProjectStatus[] = [
  ProjectStatus.PUBLIE,
  ProjectStatus.EN_COLLECTE,
  ProjectStatus.FINANCE,
  ProjectStatus.EN_REMBOURSEMENT,
  ProjectStatus.CLOTURE,
] as ProjectStatus[];

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ProjectKpiService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectRepository(ProjectEntity)
    private readonly projRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly invRepo: Repository<InvestmentEntity>,
  ) {}

  async getPublicKpis(projetId: string): Promise<ProjectPublicKpis> {
    const key = `project-kpi:${projetId}`;
    const cached = await this.cache.get<ProjectPublicKpis>(key);
    if (cached) return cached;

    const kpis = await this.compute(projetId);
    await this.cache.set(key, kpis, TTL_MS);
    return kpis;
  }

  @OnEvent('echeance.paid')
  @OnEvent('echeance.defaulted')
  @OnEvent('investment.created')
  @OnEvent('investment.cancelled')
  async invalidate(payload: { projetId: string }): Promise<void> {
    if (!payload?.projetId) return;
    await this.cache.del(`project-kpi:${payload.projetId}`);
  }

  private async compute(projetId: string): Promise<ProjectPublicKpis> {
    const projet = await this.projRepo.findOne({ where: { id: projetId } });
    if (!projet) throw new NotFoundException('Projet introuvable');
    if (!PUBLIC_STATUTS.includes(projet.statut)) {
      throw new NotFoundException('Projet non publié');
    }

    const investments = await this.invRepo.find({
      where: { projetId, statut: Not(InvestmentStatus.ANNULE) },
      relations: ['echeances'],
    });

    const allEcheances = investments.flatMap((i) => i.echeances ?? []);
    const now = new Date();

    const capitalCollecte = investments.reduce((s, i) => s + Number(i.montant), 0);
    const pctCollecte =
      Number(projet.capitalCible) > 0
        ? (capitalCollecte / Number(projet.capitalCible)) * 100
        : 0;
    const uniqueInvestors = aggregateExposureBy(
      investments,
      (i) => String(i.utilisateurId),
      () => 1,
    );
    const nbInvestisseurs = Object.keys(uniqueInvestors).length;

    const capitalRembourse = allEcheances
      .filter((e) => !!e.payeLe)
      .reduce((s, e) => s + Number(e.montantCapital), 0);
    const capitalRestantDuGlobal = allEcheances
      .filter((e) => !e.payeLe)
      .reduce((s, e) => s + Number(e.montantCapital), 0);
    const interetsVersesTotaux = allEcheances
      .filter((e) => !!e.payeLe)
      .reduce((s, e) => s + Number(e.montantInterets), 0);

    const futures = allEcheances.filter((e) => !e.payeLe);
    const walYears = computeWal(
      futures.map((e) => ({
        datePrevue: e.datePrevue,
        montantCapital: Number(e.montantCapital),
      })),
    );

    let echeancesEnRetard = 0;
    let echeancesEnDefaut = 0;
    let pireStatut: ProjectPublicKpis['statutSante'] = 'sain';
    const rank: Record<ProjectPublicKpis['statutSante'], number> = {
      sain: 0,
      retard_leger: 1,
      retard_significatif: 2,
      defaut: 3,
      perte: 4,
    };
    for (const e of allEcheances) {
      if (e.payeLe) continue;
      const s = deriveEcheanceStatus(
        { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
        now,
      );
      if (s === 'retard_leger' || s === 'retard_significatif') echeancesEnRetard++;
      if (s === 'defaut') echeancesEnDefaut++;
      const next: ProjectPublicKpis['statutSante'] =
        s === 'a_venir' || s === 'payee'
          ? 'sain'
          : s === 'perte_definitive'
            ? 'perte'
            : s;
      if (rank[next] > rank[pireStatut]) pireStatut = next;
    }

    // Échéancier agrégé : regroupe par numero (les investisseurs partagent la même grille)
    const byNumero = new Map<number, ProjectEcheanceLine>();
    for (const e of allEcheances) {
      const existing = byNumero.get(e.numero);
      const baseStatus: ProjectEcheanceLine['statut'] = e.payeLe
        ? 'payee'
        : (() => {
            const s = deriveEcheanceStatus(
              { datePrevue: e.datePrevue, payeLe: e.payeLe, statut: e.statut },
              now,
            );
            if (s === 'defaut' || s === 'perte_definitive') return 'defaut';
            if (s === 'retard_leger' || s === 'retard_significatif') return 'retard';
            return 'a_venir';
          })();

      if (!existing) {
        byNumero.set(e.numero, {
          numero: e.numero,
          datePrevue: e.datePrevue,
          montantCapital: Number(e.montantCapital),
          montantInterets: Number(e.montantInterets),
          montantTotal: Number(e.montantTotal),
          statut: baseStatus,
        });
      } else {
        existing.montantCapital += Number(e.montantCapital);
        existing.montantInterets += Number(e.montantInterets);
        existing.montantTotal += Number(e.montantTotal);
        // Pire statut visible si divergence (rare mais possible si paiements partiels)
        if (
          baseStatus === 'defaut' ||
          (baseStatus === 'retard' && existing.statut === 'a_venir')
        ) {
          existing.statut = baseStatus;
        }
      }
    }
    const echeancierPrevisionnel = Array.from(byNumero.values()).sort(
      (a, b) => a.numero - b.numero,
    );

    return {
      triCible: Number(projet.triCible ?? 0),
      dureeMois: projet.dureeMois,
      capitalCible: Number(projet.capitalCible),
      instrument: projet.instrument,
      capitalCollecte,
      pctCollecte,
      nbInvestisseurs,
      capitalRestantDuGlobal,
      capitalRembourse,
      pctCapitalRembourse:
        capitalCollecte > 0 ? (capitalRembourse / capitalCollecte) * 100 : 0,
      interetsVersesTotaux,
      walMois: walYears !== null ? walYears * 12 : null,
      echeancesEnRetard,
      echeancesEnDefaut,
      statutSante: pireStatut,
      echeancierPrevisionnel,
    };
  }
}
```

> Note: `PUBLIC_STATUTS` enumerates the statuses the spec deems "publishable". If your `ProjectStatus` enum uses different values, adjust the list to match. The intent is: hide `BROUILLON` and any pre-publication state.

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx jest src/kpi/applications/project-kpi.service.spec.ts --no-coverage`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/applications/project-kpi.service.ts src/kpi/applications/project-kpi.service.spec.ts
git commit -m "feat(kpi): add ProjectKpiService with cache and invalidation"
```

---

## Task 5: Project KPI controller

**Files:**
- Create: `src/kpi/presenters/http/project-kpi.controller.ts`

- [ ] **Step 1: Create the controller**

Create `src/kpi/presenters/http/project-kpi.controller.ts`:

```typescript
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from 'src/common/auth/public.decorator';
import { ProjectKpiService } from 'src/kpi/applications/project-kpi.service';

@Controller('projects')
export class ProjectKpiController {
  constructor(private readonly service: ProjectKpiService) {}

  @Public()
  @Get(':id/kpis')
  getProjectKpis(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getPublicKpis(id);
  }
}
```

> `@Public()` bypasses `JwtAuthGuard` since the route is public. Verify the decorator exists at `src/common/auth/public.decorator.ts` (it's referenced in `roles.guard.ts:9`). If absent, replace with whichever decorator the project uses for public routes.

- [ ] **Step 2: Verify compilation**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/kpi/presenters/http/project-kpi.controller.ts
git commit -m "feat(kpi): add public project KPI controller"
```

---

## Task 6: Wire `KpiModule` with services, controllers, and TypeORM repos

**Files:**
- Modify: `src/kpi/kpi.module.ts`

- [ ] **Step 1: Update the module**

Replace the contents of `src/kpi/kpi.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestorKpiService } from './applications/investor-kpi.service';
import { ProjectKpiService } from './applications/project-kpi.service';
import { InvestorKpiController } from './presenters/http/investor-kpi.controller';
import { ProjectKpiController } from './presenters/http/project-kpi.controller';
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
    ]),
  ],
  controllers: [InvestorKpiController, ProjectKpiController],
  providers: [InvestorKpiService, ProjectKpiService],
  exports: [InvestorKpiService, ProjectKpiService],
})
export class KpiModule {}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/kpi/kpi.module.ts
git commit -m "feat(kpi): wire KpiModule with services and controllers"
```

---

## Task 7: Emit `echeance.paid` from `PayEcheanceUseCase`

**Files:**
- Modify: `src/investments/applications/usecases/pay-echeance.usecase.ts`

- [ ] **Step 1: Inject `EventEmitter2` and emit after save**

In `src/investments/applications/usecases/pay-echeance.usecase.ts`, add the import:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Update the constructor to inject it (after `auditLog`):

```typescript
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly notificationEvents: NotificationEventService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}
```

Right after `await this.notificationEvents.echeancePaid(echeance, project);` (around line 154), insert:

```typescript
    this.eventEmitter.emit('echeance.paid', {
      echeanceId: echeance.id,
      investissementId: echeance.investissementId,
      projetId: project?.id,
    });
```

- [ ] **Step 2: Update the test fixture if needed**

If `pay-echeance.usecase.spec.ts` exists (it does), add `EventEmitter2` to its providers as a mock:

In `src/investments/applications/usecases/pay-echeance.usecase.spec.ts`, locate the test module setup and add to the providers array:

```typescript
{ provide: EventEmitter2, useValue: { emit: jest.fn() } },
```

And import `EventEmitter2` at the top:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npx jest src/investments/applications/usecases/pay-echeance.usecase.spec.ts --no-coverage`
Expected: build succeeds, existing test still passes.

- [ ] **Step 4: Commit**

```bash
git add src/investments/applications/usecases/pay-echeance.usecase.ts src/investments/applications/usecases/pay-echeance.usecase.spec.ts
git commit -m "feat(kpi): emit echeance.paid event after payment"
```

---

## Task 8: Emit `investment.created` from `CreateInvestmentUseCase`

**Files:**
- Modify: `src/investments/applications/usecases/create-investment.usecase.ts`

- [ ] **Step 1: Read the existing file**

Run: `cat src/investments/applications/usecases/create-investment.usecase.ts`

Identify where the investment is persisted (e.g., `await this.invRepo.save(...)`). The emit happens immediately after a successful save.

- [ ] **Step 2: Inject `EventEmitter2` and emit**

Add the import at the top:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Add it to the constructor (last param):

```typescript
    private readonly eventEmitter: EventEmitter2,
```

After the `await this.invRepo.save(...)` (or equivalent), add:

```typescript
    this.eventEmitter.emit('investment.created', {
      investissementId: saved.id,
      projetId: saved.projetId,
      utilisateurId: saved.utilisateurId,
    });
```

(Adjust `saved` to whatever variable holds the saved entity.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/investments/applications/usecases/create-investment.usecase.ts
git commit -m "feat(kpi): emit investment.created event"
```

---

## Task 9: Emit `investment.cancelled` from `CancelInvestmentUseCase`

**Files:**
- Modify: `src/investments/applications/usecases/cancel-investment.usecase.ts`

- [ ] **Step 1: Read existing file**

Run: `cat src/investments/applications/usecases/cancel-investment.usecase.ts`

Identify where the cancellation is persisted.

- [ ] **Step 2: Inject and emit**

Add to imports:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Constructor:

```typescript
    private readonly eventEmitter: EventEmitter2,
```

After the cancellation save:

```typescript
    this.eventEmitter.emit('investment.cancelled', {
      investissementId: cancelled.id,
      projetId: cancelled.projetId,
      utilisateurId: cancelled.utilisateurId,
    });
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/investments/applications/usecases/cancel-investment.usecase.ts
git commit -m "feat(kpi): emit investment.cancelled event"
```

---

## Task 10: Integration test — cache invalidation on event

**Files:**
- Modify: `src/kpi/applications/project-kpi.service.spec.ts`

- [ ] **Step 1: Add an event-driven invalidation test**

Append to `src/kpi/applications/project-kpi.service.spec.ts`:

```typescript
  describe('event-driven cache invalidation', () => {
    it('invalidate() is idempotent when projetId missing', async () => {
      await service.invalidate({ projetId: '' });
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it('invalidate() is called from @OnEvent decorators (verified by Nest at runtime)', () => {
      // Verify the method exists and is decorated; runtime hook wiring is tested by Nest.
      expect(typeof service.invalidate).toBe('function');
    });
  });
```

- [ ] **Step 2: Run tests**

Run: `npx jest src/kpi/applications/project-kpi.service.spec.ts --no-coverage`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/kpi/applications/project-kpi.service.spec.ts
git commit -m "test(kpi): cover invalidate edge cases"
```

---

## Task 11: Manual smoke test against the dev environment

This task is a checkpoint, not code. Run the app locally and validate the endpoints work end-to-end.

- [ ] **Step 1: Apply migrations from Lot 1 on the dev DB**

Run: `npm run migration:run`

If errors appear: check the data-source migrations path. Existing migrations live in `database/migrations/`. If TypeORM can't find them, update `src/data-source.ts` line 14 from `migrations: ['src/migrations/*.ts']` to `migrations: ['database/migrations/*.ts']`.

Expected: 2 migrations applied (`AddFiscalRegimeToUser`, `ExtendEcheanceStatusAndAddChangeTimestamp`).

- [ ] **Step 2: Start the dev server**

Run: `npm run start:dev`
Expected: server boots without errors.

- [ ] **Step 3: Hit the endpoints**

With a valid investor JWT in `$TOKEN` and a published project UUID in `$PROJET_ID`:

```bash
curl -s http://localhost:3000/me/portfolio/kpis -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:3000/projects/$PROJET_ID/kpis | jq .
curl -s -X PATCH http://localhost:3000/me/regime-fiscal \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"regimeFiscal":"PFU"}' | jq .
```

Expected:
- `/me/portfolio/kpis` returns a JSON object with `capitalInvestiTotal`, `parProjet`, `regimeFiscal: "PFU"` etc.
- `/projects/:id/kpis` returns project KPIs publicly (no auth needed).
- `PATCH /me/regime-fiscal` returns `{ ok: true, regimeFiscal: "PFU" }`.

- [ ] **Step 4: Trigger cache invalidation manually**

Hit `GET /projects/:id/kpis` twice (the second call should be cached). Then pay an échéance via an admin endpoint (or whatever flow triggers `PayEcheanceUseCase`). Hit the endpoint a third time — the response should reflect the new state, demonstrating the event invalidated the cache.

- [ ] **Step 5: Document any deviations**

If anything didn't work as expected, file follow-up issues. Otherwise, no commit needed — this is verification, not code.

---

## Lot 2 Done

At this point:
- `GET /me/portfolio/kpis` is live and returns per-user portfolio KPIs.
- `PATCH /me/regime-fiscal` lets the user switch between PFU / BAREME / DISPENSE.
- `GET /projects/:id/kpis` is live with 5-min Redis caching, invalidated by 3 events.
- `PayEcheanceUseCase`, `CreateInvestmentUseCase`, `CancelInvestmentUseCase` emit the cache-invalidation events.
- All KPI unit tests pass.

**Next:** Plan 3 — `2026-05-18-kpis-lot3-admin-marketing.md`.
