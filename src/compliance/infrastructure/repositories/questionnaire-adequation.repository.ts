import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionnaireAdequationRepository } from 'src/compliance/domain/repositories/questionnaire-adequation.repository';
import { AdequacyAssessment } from 'src/compliance/domain/entities/adequacy-assessment';
import { QuestionnaireAdequationEntity } from '../persistence/entities/questionnaire-adequation.entity';
import { ProfilMapper } from '../persistence/mappers/profil.mapper';

@Injectable()
export class QuestionnaireAdequationTypeOrmRepository implements QuestionnaireAdequationRepository {
  constructor(
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
  ) {}

  async findByUserId(userId: number): Promise<AdequacyAssessment | null> {
    const entity = await this.questionnaireRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.questionnaireToDomain(entity) : null;
  }

  /**
   * `id` est un uuid généré en base : absent d'un premier passage, présent au
   * second — TypeORM fait donc un INSERT puis des UPDATE, sans que le use case
   * ait à distinguer les deux.
   */
  async save(
    questionnaire: AdequacyAssessment,
  ): Promise<AdequacyAssessment> {
    const entity = ProfilMapper.questionnaireToEntity(questionnaire);
    const saved = await this.questionnaireRepo.save(entity);
    return ProfilMapper.questionnaireToDomain(saved);
  }
}
