import { Inject, Injectable } from '@nestjs/common';
import {
  AVANCEMENT_DU_QUESTIONNAIRE_QUERY,
  type AvancementDuQuestionnaireQuery,
} from 'src/adequacy/application/ports/avancement-du-questionnaire.query';
import { EventBus } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/onboarding/domain/repositories/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/onboarding/domain/errors';
import { ProfilPPMisAJourDomainEvent } from 'src/onboarding/domain/events/profil-pp-mis-a-jour.domain-event';
import { CreateProfilPPDto } from '../../../presentation/http/dto/profil.dto';
import { champsDeclaresDepuisDto } from '../../mappers/profil-pp-champs.mapper';
import { VueProfilPP, vueProfilPP } from '../../mappers/profil-pp-vue.mapper';

/**
 * Mise à jour du profil investisseur — personne physique.
 *
 * Le `Object.assign(profil, dto)` qui tenait lieu de mise à jour recopiait le
 * DTO champ pour champ, sans validation ni conversion : la date de naissance
 * y entrait sous forme de chaîne dans un champ typé `Date`, et un pays
 * inexistant écrasait un pays correct. `mettreAJour` soumet chaque champ aux
 * mêmes règles qu'à la création.
 *
 * Le compte est lu — jamais écrit : la réponse publie son état civil, qui
 * reste sa propriété. Tout ce que le formulaire déclare, téléphone compris,
 * entre dans le dossier par `mettreAJour`.
 */
@Injectable()
export class UpdateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    // Le classement est **lu par le port du contexte voisin**, jamais par son
    // repository : cet écran l'affiche, il ne le décide pas (§3, §11).
    @Inject(AVANCEMENT_DU_QUESTIONNAIRE_QUERY)
    private readonly profilsConformite: AvancementDuQuestionnaireQuery,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    userId: number,
    dto: Partial<CreateProfilPPDto>,
  ): Promise<VueProfilPP> {
    const profil = await this.profilPPRepository.findByUserId(userId);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }

    profil.mettreAJour(champsDeclaresDepuisDto(dto));
    const misAJour = await this.profilPPRepository.update(profil);

    // Publié après l'écriture uniquement — un abonné ne doit pas réagir à une
    // mise à jour qui n'a pas eu lieu.
    this.eventBus.publish(new ProfilPPMisAJourDomainEvent(userId));

    const [compte, conformite] = await Promise.all([
      this.userRepository.findById(userId),
      this.profilsConformite.duTitulaire(userId),
    ]);

    return vueProfilPP(misAJour, compte, conformite.classement);
  }
}
