import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/investments/domains/enums/investment-status.enum';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';

/**
 * Generates a unified borrower schedule shared by all investors of a project.
 *
 * The first installment falls on the `firstDueDate` provided by the admin.
 * Subsequent installments are monthly on the same day-of-month (clamped to the
 * last day of shorter months). In-fine amortization: monthly interest on the
 * full capital, principal repaid in full on the last installment.
 */
@Injectable()
export class ProjectScheduleGeneratorService {
  private readonly logger = new Logger(ProjectScheduleGeneratorService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  /**
   * Initialize the schedule for every active investment of the project, using
   * `firstDueDate` as installment #1. Refuses to run if any echeance already
   * exists (use `regenerate` for that). Returns a summary.
   */
  async initializeForProject(
    projectId: string,
    firstDueDate: Date,
  ): Promise<{
    investmentsProcessed: number;
    echeancesGenerated: number;
  }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    if (!project.dureeMois || project.dureeMois < 1) {
      throw new Error(`Project ${projectId} has no dureeMois`);
    }

    const triAnnuel = Number(project.triCible ?? 0);
    const dureeMois = Number(project.dureeMois);
    const tauxMensuel = triAnnuel / 100 / 12;

    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    const active = investments.filter((i) =>
      [
        InvestmentStatus.CONFIRME,
        InvestmentStatus.PAYE,
        InvestmentStatus.SIGNE,
      ].includes(i.statut),
    );
    if (active.length === 0) {
      throw new Error('No active investments on this project');
    }

    const investmentIds = active.map((i) => i.id);
    const existing = await this.echeanceRepo.count({
      where: { investissementId: In(investmentIds) },
    });
    if (existing > 0) {
      throw new Error(
        'Schedule already exists. Delete it first or use regenerate.',
      );
    }

    let echeancesGenerated = 0;
    for (const inv of active) {
      const montant = Number(inv.montant);
      const interest = round2(montant * tauxMensuel);
      const rows: EcheanceEntity[] = [];

      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = addMonths(firstDueDate, i - 1);
        const isLast = i === dureeMois;
        const capital = isLast ? montant : 0;
        const total = round2(capital + interest);

        rows.push(
          this.echeanceRepo.create({
            investissementId: inv.id,
            numero: i,
            datePrevue,
            montantCapital: capital,
            montantInterets: interest,
            montantTotal: total,
            prelevementIR: 0,
            prelevementCSG: 0,
            statut: EcheanceStatus.A_VENIR,
            payeLe: null,
            rappelJ7Envoye: false,
            rappelJ1Envoye: false,
          }),
        );
      }

      await this.echeanceRepo.save(rows);
      echeancesGenerated += rows.length;
    }

    this.logger.log(
      `Initialized schedule for project ${projectId}: ${echeancesGenerated} echeances across ${active.length} investments, first due ${firstDueDate.toISOString().slice(0, 10)}`,
    );

    return {
      investmentsProcessed: active.length,
      echeancesGenerated,
    };
  }

  /**
   * Wipes A_VENIR echeances and rebuilds them. Use when the admin wants to
   * reset the unpaid future of the schedule with a fresh first due date.
   * PAYE/RETARD/IMPAYE rows are preserved and the new schedule continues after
   * the last preserved number.
   */
  async regenerateForProject(
    projectId: string,
    firstDueDate: Date,
  ): Promise<{
    investmentsProcessed: number;
    echeancesGenerated: number;
    echeancesDeleted: number;
  }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    if (!project.dureeMois || project.dureeMois < 1) {
      throw new Error(`Project ${projectId} has no dureeMois`);
    }

    const triAnnuel = Number(project.triCible ?? 0);
    const dureeMois = Number(project.dureeMois);
    const tauxMensuel = triAnnuel / 100 / 12;

    const investments = await this.investRepo.find({
      where: { projetId: projectId },
    });
    const active = investments.filter((i) =>
      [
        InvestmentStatus.CONFIRME,
        InvestmentStatus.PAYE,
        InvestmentStatus.SIGNE,
      ].includes(i.statut),
    );

    let echeancesDeleted = 0;
    let echeancesGenerated = 0;

    for (const inv of active) {
      const del = await this.echeanceRepo.delete({
        investissementId: inv.id,
        statut: EcheanceStatus.A_VENIR,
      });
      echeancesDeleted += del.affected ?? 0;

      const remaining = await this.echeanceRepo.find({
        where: { investissementId: inv.id },
        order: { numero: 'ASC' },
      });
      const startNum = remaining.length;
      const monthsRemaining = Math.max(0, dureeMois - startNum);
      if (monthsRemaining === 0) continue;

      const montant = Number(inv.montant);
      const interest = round2(montant * tauxMensuel);
      const rows: EcheanceEntity[] = [];

      for (let i = 1; i <= monthsRemaining; i++) {
        const numero = startNum + i;
        const datePrevue = addMonths(firstDueDate, i - 1);
        const isLast = numero === dureeMois;
        const capital = isLast ? montant : 0;
        const total = round2(capital + interest);

        rows.push(
          this.echeanceRepo.create({
            investissementId: inv.id,
            numero,
            datePrevue,
            montantCapital: capital,
            montantInterets: interest,
            montantTotal: total,
            prelevementIR: 0,
            prelevementCSG: 0,
            statut: EcheanceStatus.A_VENIR,
            payeLe: null,
            rappelJ7Envoye: false,
            rappelJ1Envoye: false,
          }),
        );
      }

      if (rows.length > 0) {
        await this.echeanceRepo.save(rows);
        echeancesGenerated += rows.length;
      }
    }

    return {
      investmentsProcessed: active.length,
      echeancesGenerated,
      echeancesDeleted,
    };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Add N months to a date, preserving the day-of-month. If the target month
 * has fewer days (e.g. anchor on 31st, target month has 30), clamp to the
 * last day of the target month.
 */
function addMonths(anchor: Date, months: number): Date {
  const d = new Date(anchor);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}
