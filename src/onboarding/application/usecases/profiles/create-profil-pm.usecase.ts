import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/onboarding/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/onboarding/domain/factories/profil-pm.factory';
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
 *
 * **Déclarer une société n'exige pas d'avoir d'abord rempli son dossier
 * personnel, et ne l'interdit pas non plus.** Ce use case refusait la société
 * à un compte déjà « personne physique » ; le cahier des charges veut
 * exactement la situation inverse — un compte porte son identité *et* les
 * entreprises qu'il représente. Reste une contrainte réelle, mais elle ne
 * porte pas ici : on ne peut pas **investir** au nom d'une société dont le
 * représentant légal n'est pas identifié. Nommer une raison sociale n'engage
 * aucun fonds ; cette règle appartient donc à la porte des opérations
 * financières (`DossierDEntreeEnRelation.peutOperer`), pas à ce formulaire.
 */
@Injectable()
export class CreateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
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

    return this.profilPMRepository.save(profil);
  }
}
