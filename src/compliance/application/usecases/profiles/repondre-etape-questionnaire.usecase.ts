import { Inject, Injectable } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  CapaciteDePerteDto,
  PreQualificationDto,
  QualificationDto,
} from 'src/compliance/presentation/http/dto/questionnaire.dto';
import {
  capaciteDePerteDepuisDto,
  preQualificationDepuisDto,
  qualificationDepuisDto,
} from '../../mappers/questionnaire-reponses.mapper';
import {
  VueQuestionnaire,
  vueQuestionnaire,
} from '../../mappers/questionnaire-vue.mapper';
import { RiskScoringService } from '../../services/risk-scoring.service';

/**
 * Le questionnaire d'adéquation, répondu **étape par étape**.
 *
 * Le cahier des charges décrit trois temps, dont chacun peut clore la suite :
 * le professionnel s'arrête après l'étape 1, l'averti après l'étape 2. Une
 * route unique recevant le formulaire entier ne pouvait pas l'exprimer — elle
 * exigeait les treize réponses d'un coup, y compris celles que le classement
 * rend sans objet, et ne disait jamais laquelle poser ensuite.
 *
 * **Trois intentions, une orchestration.** Les trois méthodes publiques sont
 * les trois gestes du parcours, nommés ; ce qu'elles partagent — relire le
 * dossier, appliquer, persister, réévaluer le suivi — est écrit une fois dans
 * {@link enregistrer}. Trois classes jumelles n'auraient ajouté que trois
 * copies de ces quatre lignes.
 *
 * Ce use case n'orchestre que des accès (§14). Ce qui décide — qu'une étape
 * soit ouverte ou non, et ce que les réponses valent — est dans
 * `InvestorComplianceProfile.repondreAlEtape` et `ResultatAdequation`, où cela
 * s'éprouve sans base de données.
 */
@Injectable()
export class RepondreEtapeQuestionnaireUseCase {
  constructor(
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  /** Étape 1 — pré-qualification : professionnel, ou non. */
  preQualification(
    userId: number,
    dto: PreQualificationDto,
  ): Promise<VueQuestionnaire> {
    const champs = preQualificationDepuisDto(dto);
    return this.enregistrer(userId, (profil) =>
      profil.repondreALaPreQualification(champs),
    );
  }

  /** Étape 2 — qualification : averti, ou non. */
  qualification(
    userId: number,
    dto: QualificationDto,
  ): Promise<VueQuestionnaire> {
    const champs = qualificationDepuisDto(dto);
    return this.enregistrer(userId, (profil) =>
      profil.repondreALaQualification(champs),
    );
  }

  /** Étape 3 — capacité à subir des pertes, d'où sort le montant conseillé. */
  capaciteDePerte(
    userId: number,
    dto: CapaciteDePerteDto,
  ): Promise<VueQuestionnaire> {
    const champs = capaciteDePerteDepuisDto(dto);
    return this.enregistrer(userId, (profil) =>
      profil.repondreALaCapaciteDePerte(champs),
    );
  }

  /**
   * Relire le dossier, lui appliquer l'étape, persister, réévaluer le suivi.
   *
   * Le niveau de risque est repris **à chaque étape** et non à la seule
   * dernière : une étape 1 qui classe professionnel clôt le questionnaire, et
   * la cadence de contact doit suivre ce classement-là sans attendre des étapes
   * que le titulaire ne passera jamais.
   */
  private async enregistrer(
    userId: number,
    appliquer: (profil: InvestorComplianceProfile) => void,
  ): Promise<VueQuestionnaire> {
    const profil = await this.profils.findByInvestorId(userId);

    // Peut lever `EtapeQuestionnaireFermeeError` : rien n'est alors persisté.
    appliquer(profil);

    const enregistre = await this.profils.save(profil);

    await this.riskScoringService.computeAndStore(userId);

    return vueQuestionnaire(enregistre);
  }
}
