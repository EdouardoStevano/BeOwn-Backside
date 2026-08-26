import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { QuestionnaireAdequationEntity } from '../persistence/entities/questionnaire-adequation.entity';
import { KycOrmMapper } from '../persistence/mappers/kyc.mapper';
import { ProfilMapper } from '../persistence/mappers/profil.mapper';

/**
 * Compose la racine depuis les deux tables qui la portent.
 *
 * **C'est le seul chemin d'écriture du dossier de conformité.** Il s'appuyait
 * sur deux ports de pièce — `KycRepository` et
 * `QuestionnaireAdequationRepository` — qui n'auraient jamais dû exister :
 * `KycCase` et `AdequacyAssessment` sont des **entités internes** à cette
 * racine (§3.2), et un repository ne s'adresse qu'à un Aggregate Root (§10).
 * Tant qu'ils étaient là, n'importe quel use case — et jusqu'au contexte `iam`
 * — pouvait écrire dans une pièce sans passer par son propriétaire.
 *
 * Il parle donc directement aux deux tables, par leurs mappers ORM. Le
 * découpage du stockage ne suit pas celui du domaine, et c'est exactement le
 * rôle d'un repository (§16).
 *
 * Limite assumée : les deux enregistrements ne partagent pas encore une
 * transaction SQL. Ils sont indépendants — un questionnaire et un dossier de
 * vérification n'ont pas d'invariant croisé à l'écriture, seulement à la
 * lecture (`peutOperer`) — donc un échec du second laisse le premier écrit,
 * jamais un état interdit.
 */
@Injectable()
export class InvestorComplianceProfileTypeOrmRepository implements InvestorComplianceProfileRepository {
  constructor(
    @InjectRepository(KycEntity)
    private readonly dossiers: Repository<KycEntity>,
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaires: Repository<QuestionnaireAdequationEntity>,
  ) {}

  async findByInvestorId(
    investorId: number,
  ): Promise<InvestorComplianceProfile> {
    const [dossier, questionnaire] = await Promise.all([
      this.dossiers.findOne({ where: { utilisateurId: investorId } }),
      this.questionnaires.findOne({ where: { utilisateurId: investorId } }),
    ]);

    return new InvestorComplianceProfile({
      investorId,
      kycCase: dossier ? KycOrmMapper.toDomain(dossier) : null,
      adequacy: questionnaire
        ? ProfilMapper.questionnaireToDomain(questionnaire)
        : null,
    });
  }

  async save(
    profile: InvestorComplianceProfile,
  ): Promise<InvestorComplianceProfile> {
    // La porte réservée au repository — voir `InvestorComplianceProfile.pieces`.
    const { kycCase, adequacy } = profile.pieces;

    const [dossier, questionnaire] = await Promise.all([
      kycCase
        ? this.dossiers.save(KycOrmMapper.toEntity(kycCase))
        : Promise.resolve(null),
      adequacy
        ? this.questionnaires.save(ProfilMapper.questionnaireToEntity(adequacy))
        : Promise.resolve(null),
    ]);

    return new InvestorComplianceProfile({
      investorId: profile.investorId,
      kycCase: dossier ? KycOrmMapper.toDomain(dossier) : null,
      adequacy: questionnaire
        ? ProfilMapper.questionnaireToDomain(questionnaire)
        : null,
    });
  }
}
