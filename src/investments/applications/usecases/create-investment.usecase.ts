import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InvestmentRepository } from '../ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../ports/repositories/investment.repository';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import {
  EcheanceStatus,
  InvestmentStatus,
  RemboursementMode,
} from 'src/investments/domains/enums/investment-status.enum';
import { CreateInvestmentDto } from 'src/investments/presenters/dto/investment.dto';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

@Injectable()
export class CreateInvestmentUseCase {
  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(userId: number, dto: CreateInvestmentDto): Promise<Investment> {
    const project = await this.projectRepository.findProjectById(dto.projetId);
    if (!project) throw new NotFoundException('Projet introuvable.');

    if (project.statut !== ProjectStatus.EN_COLLECTE) {
      throw new BadRequestException(
        "L'investissement n'est possible que sur un projet en cours de collecte.",
      );
    }

    if (dto.montant < project.ticketMinimum) {
      throw new BadRequestException(
        `Montant minimum : ${project.ticketMinimum} €`,
      );
    }

    if (project.ticketMaximum && dto.montant > project.ticketMaximum) {
      throw new BadRequestException(
        `Montant maximum : ${project.ticketMaximum} €`,
      );
    }

    const valeurTitre = project.ticketMinimum;
    const nbTitres = Math.floor(dto.montant / valeurTitre);

    const investment = new Investment();
    investment.projetId = dto.projetId;
    investment.utilisateurId = userId;
    investment.montant = dto.montant;
    investment.instrument = project.instrument;
    investment.nbTitres = nbTitres;
    investment.valeurTitre = valeurTitre;
    investment.statut = InvestmentStatus.INITIE;
    investment.delaiRetractationJusquAu = null;
    investment.bulletinDocId = null;
    investment.signatureId = null;
    investment.reservationId = dto.reservationId ?? null;

    const saved = await this.investmentRepository.saveInvestment(investment);

    const echeances = this.generateEcheances(
      saved.id,
      dto.montant,
      project.triCible ?? 0,
      project.dureeMois,
      dto.modeRemboursement ?? RemboursementMode.IN_FINE,
    );
    await this.investmentRepository.saveEcheances(echeances);

    return saved;
  }

  private generateEcheances(
    investissementId: string,
    montant: number,
    triAnnuel: number,
    dureeMois: number,
    mode: RemboursementMode,
  ): Echeance[] {
    const echeances: Echeance[] = [];
    const tauxMensuel = triAnnuel / 100 / 12;
    const now = new Date();

    if (mode === RemboursementMode.IN_FINE) {
      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = new Date(now);
        datePrevue.setMonth(datePrevue.getMonth() + i);
        const ech = new Echeance();
        ech.investissementId = investissementId;
        ech.numero = i;
        ech.datePrevue = datePrevue;
        ech.montantCapital = i === dureeMois ? montant : 0;
        ech.montantInterets = Math.round(montant * tauxMensuel * 100) / 100;
        ech.montantTotal = ech.montantCapital + ech.montantInterets;
        ech.statut = EcheanceStatus.A_VENIR;
        ech.payeLe = null;
        echeances.push(ech);
      }
    } else {
      const capitalMensuel = montant / dureeMois;
      let solde = montant;
      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = new Date(now);
        datePrevue.setMonth(datePrevue.getMonth() + i);
        const interets = Math.round(solde * tauxMensuel * 100) / 100;
        const capital = Math.round(capitalMensuel * 100) / 100;
        const ech = new Echeance();
        ech.investissementId = investissementId;
        ech.numero = i;
        ech.datePrevue = datePrevue;
        ech.montantCapital = capital;
        ech.montantInterets = interets;
        ech.montantTotal = capital + interets;
        ech.statut = EcheanceStatus.A_VENIR;
        ech.payeLe = null;
        echeances.push(ech);
        solde -= capital;
      }
    }

    return echeances;
  }
}
