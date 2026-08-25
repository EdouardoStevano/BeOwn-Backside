import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/compliance/domain/factories/profil-pm.factory';
import {
  NATURE_DU_DOSSIER_REPOSITORY,
  type NatureDuDossierRepository,
} from 'src/compliance/domain/repositories/nature-du-dossier.repository';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { NatureDeDossierIncompatibleError } from 'src/compliance/domain/errors';
import { CreateProfilPMDto } from '../../../presentation/http/dto/profil.dto';

/**
 * Complétion du profil investisseur — personne morale.
 *
 * Ce use case n'orchestre plus que des accès (§6 — Application Service) :
 * vérifier l'existence, faire naître l'agrégat, le persister. La validité des
 * données déclarées est dans `ProfilPMFactory.creer`, où elle vaut pour tout
 * point d'entrée — pas seulement pour cette route HTTP.
 *
 * L'ancien `Object.assign(profil, dto)` recopiait le DTO clé pour clé sur un
 * objet aux attributs publics : un SIREN de quatorze chiffres, un capital
 * négatif ou une clé que le domaine ne connaît pas entraient sans contrôle.
 *
 * **Chaque appel crée une société de plus.** C'était auparavant une création
 * idempotente qui rendait le dossier existant — et ignorait silencieusement
 * les données du second appel, si bien qu'une raison sociale corrigée
 * recevait un 201 et aucun changement. Le repli n'a plus lieu d'être : un
 * compte peut déclarer plusieurs sociétés, et corriger l'une d'elles a sa
 * propre route.
 */
@Injectable()
export class CreateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
    @Inject(NATURE_DU_DOSSIER_REPOSITORY)
    private readonly natureDuDossier: NatureDuDossierRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPMDto): Promise<ProfilPM> {
    const profil = ProfilPMFactory.creer({
      userId,
      raisonSociale: dto.raisonSociale,
      formeJuridique: dto.formeJuridique,
      siren: dto.siren,
      rcsVille: dto.rcsVille,
      capitalSocial: dto.capitalSocial,
      siegeAdresse: dto.siegeAdresse,
      secteurActivite: dto.secteurActivite,
      // `representantId` n'est pas exposé au formulaire : on ne se désigne pas
      // représentant légal d'une société en le déclarant dans un POST.
    });

    // Après la fabrique, avant l'écriture : un formulaire refusé ne doit pas
    // fixer la nature du compte, et rien ne doit être écrit si elle est déjà
    // fixée à l'autre. L'appel pose la nature ou rend celle qui fait foi — il
    // n'y a pas de fenêtre entre lire et écrire (§13).
    const nature = await this.natureDuDossier.declarer(
      userId,
      NatureDeDossier.PM,
    );
    if (nature !== NatureDeDossier.PM) {
      throw new NatureDeDossierIncompatibleError(NatureDeDossier.PM, nature);
    }

    return this.profilPMRepository.save(profil);
  }
}
