import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceStatus } from 'src/subscription/domain/enums/investment-status.enum';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Échéancier emprunteur agrégé (vue admin, une ligne par numéro) : somme des
 * capitaux/intérêts/totaux, date partagée la plus tôt, statut le plus avancé,
 * capital restant avant/après. Extrait verbatim de
 * AdminEcheancesController.getAggregatedSchedule (SOLID vague 4).
 */
@Injectable()
export class GetAggregatedScheduleUseCase {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  async execute(projectId: string): Promise<
    Array<{
      numero: number;
      datePrevue: string;
      montantCapital: number;
      montantInterets: number;
      montantTotal: number;
      capitalRestantAvant: number;
      capitalRestantApres: number;
      statut: EcheanceStatus;
      nbInvestisseurs: number;
      nbPayes: number;
    }>
  > {
    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    const investmentIds = investments.map((i) => i.id);
    if (investmentIds.length === 0) return [];

    const rows = await this.echeanceRepo.find({
      where: { investissementId: In(investmentIds) },
      order: { numero: 'ASC', datePrevue: 'ASC' },
    });

    const byNumero = new Map<
      number,
      {
        numero: number;
        datePrevue: string;
        montantCapital: number;
        montantInterets: number;
        montantTotal: number;
        statuts: EcheanceStatus[];
      }
    >();

    for (const r of rows) {
      const key = r.numero;
      const dateStr =
        r.datePrevue instanceof Date
          ? r.datePrevue.toISOString().slice(0, 10)
          : String(r.datePrevue).slice(0, 10);
      const existing = byNumero.get(key);
      if (existing) {
        existing.montantCapital += Number(r.montantCapital);
        existing.montantInterets += Number(r.montantInterets);
        existing.montantTotal += Number(r.montantTotal);
        existing.statuts.push(r.statut);
        if (dateStr < existing.datePrevue) existing.datePrevue = dateStr;
      } else {
        byNumero.set(key, {
          numero: r.numero,
          datePrevue: dateStr,
          montantCapital: Number(r.montantCapital),
          montantInterets: Number(r.montantInterets),
          montantTotal: Number(r.montantTotal),
          statuts: [r.statut],
        });
      }
    }

    const sorted = [...byNumero.values()].sort((a, b) => a.numero - b.numero);
    const totalCapital = sorted.reduce((s, r) => s + r.montantCapital, 0);

    let running = totalCapital;
    return sorted.map((r) => {
      const before = round2(running);
      const after = round2(running - r.montantCapital);
      running = after;

      const allPaid = r.statuts.every((s) => s === EcheanceStatus.PAYE);
      const anyLate = r.statuts.some((s) => s === EcheanceStatus.RETARD);
      const anyUnpaid = r.statuts.some((s) => s === EcheanceStatus.IMPAYE);
      const statut = anyUnpaid
        ? EcheanceStatus.IMPAYE
        : anyLate
        ? EcheanceStatus.RETARD
        : allPaid
        ? EcheanceStatus.PAYE
        : EcheanceStatus.A_VENIR;

      return {
        numero: r.numero,
        datePrevue: r.datePrevue,
        montantCapital: round2(r.montantCapital),
        montantInterets: round2(r.montantInterets),
        montantTotal: round2(r.montantTotal),
        capitalRestantAvant: before,
        capitalRestantApres: after,
        statut,
        nbInvestisseurs: r.statuts.length,
        nbPayes: r.statuts.filter((s) => s === EcheanceStatus.PAYE).length,
      };
    });
  }
}
