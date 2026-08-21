import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/iam/domain/repositories/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/iam/domain/errors';
import { ProfilPPMisAJourDomainEvent } from 'src/iam/domain/events/profil-pp-mis-a-jour.domain-event';
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
 * Comme à la création, le téléphone du formulaire n'est pas écrit ici : il
 * appartient au compte, et c'est `TelephoneDeclareEventHandler` qui l'y reporte
 * en réaction au fait levé (§8). Le compte reste lu — jamais écrit — parce que
 * la réponse publie son état civil.
 */
@Injectable()
export class UpdateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
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
    this.eventBus.publish(
      new ProfilPPMisAJourDomainEvent(userId, dto.telephone),
    );

    const compte = await this.userRepository.findById(userId);

    return {
      ...vueProfilPP(misAJour, compte),
      // Le numéro **déclaré** prime dans la réponse : le report sur le compte
      // est différé, et relire la colonne ici rendrait l'ancien numéro à qui
      // vient d'en saisir un nouveau.
      telephone: dto.telephone ?? compte?.telephone ?? null,
    };
  }
}
