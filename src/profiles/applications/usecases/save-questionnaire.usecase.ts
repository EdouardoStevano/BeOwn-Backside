import { Inject, Injectable } from '@nestjs/common';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';
import { QuestionnaireAdequationFactory } from 'src/profiles/domains/factories/questionnaire-adequation.factory';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import {
  QUESTIONNAIRE_ADEQUATION_REPOSITORY,
  type QuestionnaireAdequationRepository,
} from 'src/profiles/domains/ports/questionnaire-adequation.repository';
import { QuestionnaireAdequation } from 'src/profiles/domains/questionnaire-adequation';
import { SaveQuestionnaireDto } from 'src/profiles/presenters/dto/questionnaire.dto';
import { reponsesDepuisDto } from '../mappers/questionnaire-reponses.mapper';
import { RiskScoringService } from '../risk-scoring.service';

/**
 * Passage du questionnaire d'adéquation PSFP.
 *
 * Ce use case n'orchestre plus que des accès (§6 — Application Service) :
 * relire le questionnaire du compte, lui donner les nouvelles réponses ou le
 * faire naître, le persister, puis reporter le classement là où il produit ses
 * effets. Le classement lui-même — trois étapes, trois seuils réglementaires et
 * le calcul du plafond conseillé — a migré dans `ResultatAdequation`, où il se
 * teste sans base de données.
 *
 * **Le report sur le profil est synchrone, et doit le rester.** Il serait
 * tentant d'en faire un abonné à un Domain Event, comme pour les décisions KYC ;
 * ce serait une erreur : `create-investment.usecase` lit `categoriePsfp` et
 * `montantMaxConseille` sur le profil pour opposer le plafond PSFP. Un report
 * différé, même de peu, laisserait passer une souscription contrôlée avec
 * l'ancien classement.
 */
@Injectable()
export class SaveQuestionnaireUseCase {
  constructor(
    @Inject(QUESTIONNAIRE_ADEQUATION_REPOSITORY)
    private readonly questionnaireRepository: QuestionnaireAdequationRepository,
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  async execute(
    userId: number,
    dto: SaveQuestionnaireDto,
  ): Promise<QuestionnaireAdequation> {
    const reponses = reponsesDepuisDto(dto);

    // Un titulaire n'a qu'un questionnaire : repasser le formulaire remplace
    // ses réponses et son classement, il n'en crée pas un second.
    const existant = await this.questionnaireRepository.findByUserId(userId);
    if (existant) {
      existant.repondre(reponses);
    }

    const questionnaire = await this.questionnaireRepository.save(
      existant ??
        QuestionnaireAdequationFactory.repondre({
          utilisateurId: userId,
          ...reponses,
        }),
    );

    await this.reporterSurLeProfil(userId, questionnaire);
    await this.riskScoringService.computeAndStore(userId);

    return questionnaire;
  }

  /**
   * Le classement vit en deux endroits : dans le questionnaire, qui en est la
   * pièce justificative, et sur le profil, que le reste de l'application
   * interroge — contrôle de plafond à la souscription, écrans admin, exports.
   *
   * Il y était recopié par un `profilPP.categoriePsfp = …` suivi de deux
   * affectations en `as any`, sur l'entité ORM chargée depuis le use case. Le
   * port nomme l'opération et la restreint à ces trois colonnes.
   */
  private async reporterSurLeProfil(
    userId: number,
    questionnaire: QuestionnaireAdequation,
  ): Promise<void> {
    await this.profilPPRepository.enregistrerClassementPsfp(userId, {
      // Un questionnaire qui vient d'être rempli a toujours un classement ; le
      // repli protège les lignes anciennes relues sans `resultCategorie`.
      categoriePsfp: questionnaire.categoriePsfp ?? CategoriePsfp.NON_AVERTI,
      patrimoineDeclare: questionnaire.patrimoineNet,
      montantMaxConseille: questionnaire.montantMaxConseille,
    });
  }
}
