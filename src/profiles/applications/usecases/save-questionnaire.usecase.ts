import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionnaireAdequationEntity } from '../../infrastructure/persistences/entities/questionnaire-adequation.entity';
import { ProfilPPEntity } from '../../infrastructure/persistences/entities/profil-pp.entity';
import { CategoriePsfp } from '../../domains/enums/kyc-status.enum';
import { SaveQuestionnaireDto } from '../../presenters/dto/questionnaire.dto';

@Injectable()
export class SaveQuestionnaireUseCase {
  constructor(
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilPPRepo: Repository<ProfilPPEntity>,
  ) {}

  async execute(userId: number, dto: SaveQuestionnaireDto): Promise<QuestionnaireAdequationEntity> {
    const proPoints = [
      dto.workInFinancialSector,
      dto.moreThan10TransactionsPerQuarter,
      dto.portfolioOver500k,
    ].filter(Boolean).length;

    let categorie: CategoriePsfp;
    let montantMax: number | null = null;

    if (proPoints >= 2) {
      categorie = CategoriePsfp.PROFESSIONNEL;
    } else {
      const advancedPoints = [
        dto.previousUnlistedInvestments,
        dto.investmentExperienceOver5Years,
        dto.financialPatrimonyOver500k,
        dto.understandsTotalLossRisk,
        dto.financialSectorBackground,
      ].filter(Boolean).length;

      if (advancedPoints >= 4) {
        categorie = CategoriePsfp.AVERTI;
      } else {
        categorie = CategoriePsfp.NON_AVERTI;
        const patrimoine = Number(dto.patrimoineNet ?? 0);
        montantMax = Math.max(1000, Math.round(patrimoine * 0.05));
      }
    }

    let q = await this.questionnaireRepo.findOne({ where: { utilisateurId: userId } });
    if (!q) q = this.questionnaireRepo.create({ utilisateurId: userId });
    Object.assign(q, {
      ...dto,
      patrimoineNet: dto.patrimoineNet ?? null,
      revenuAnnuel: dto.revenuAnnuel ?? null,
      budgetAnnuelInvestissement: dto.budgetAnnuelInvestissement ?? null,
      resultCategorie: categorie,
      resultMontantMaxConseille: montantMax,
    });
    const saved = await this.questionnaireRepo.save(q);

    const profilPP = await this.profilPPRepo.findOne({ where: { utilisateurId: userId } });
    if (profilPP) {
      profilPP.categoriePsfp = categorie;
      (profilPP as any).patrimoineDeclare = dto.patrimoineNet ?? null;
      (profilPP as any).montantMaxConseille = montantMax;
      await this.profilPPRepo.save(profilPP);
    }

    return saved;
  }
}
