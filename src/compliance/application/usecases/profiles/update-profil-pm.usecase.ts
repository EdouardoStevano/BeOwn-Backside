import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPMIntrouvableError } from 'src/compliance/domain/errors';
import { UpdateProfilPMDto } from '../../../presentation/http/dto/profil.dto';
import { champsDeclaresDepuisDto } from '../../mappers/profil-pm-champs.mapper';

/**
 * Mise à jour du profil investisseur — personne morale.
 *
 * Comble le trou qui rendait `POST /profiles/pm/me` piégeur : la création
 * étant idempotente, un second appel rendait le profil existant **sans
 * appliquer** les données envoyées. Corriger une raison sociale ou ajouter un
 * SIREN oublié n'avait donc aucun chemin ; c'est celui-ci.
 *
 * Le use case n'orchestre que des accès (§6 — Application Service) : la
 * validité de chaque champ et la cohérence de l'ensemble sont dans
 * `ProfilPM.mettreAJour`, où elles valent pour tout point d'entrée.
 */
@Injectable()
export class UpdateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  async execute(userId: number, dto: UpdateProfilPMDto): Promise<ProfilPM> {
    const profil = await this.profilPMRepository.findByUserId(userId);
    if (!profil) {
      throw new ProfilPMIntrouvableError();
    }

    profil.mettreAJour(champsDeclaresDepuisDto(dto));
    return this.profilPMRepository.update(profil);
  }
}
