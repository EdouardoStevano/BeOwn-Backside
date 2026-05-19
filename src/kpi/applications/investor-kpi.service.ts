import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
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

    const capitalRestantDu = futures.reduce((s, e) => s + Number(e.montantCapital), 0);

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
      if (
        s === 'retard_leger' ||
        s === 'retard_significatif' ||
        s === 'defaut' ||
        s === 'perte_definitive'
      ) {
        nbEcheancesEnRetard++;
      }
      if (s === 'defaut' || s === 'perte_definitive') {
        aEnDefaut = true;
      }
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
          montantBrut: 0,
          montantNet: 0,
          projetId: allFuture[0].projetId,
          projetTitre: allFuture[0].projetTitre,
        }
      : null;

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
      triRealise: null,
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
