import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPMFactory } from 'src/compliance/domain/factories/profil-pm.factory';
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
 */
@Injectable()
export class CreateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPMDto): Promise<ProfilPM> {
    // Création idempotente : un second appel rend le profil existant au lieu
    // de lever un conflit — contrairement au profil physique. Le contrat est
    // conservé tel quel, mais il a un défaut connu : les données du second
    // appel sont **silencieusement ignorées**, si bien qu'un utilisateur qui
    // corrige sa raison sociale reçoit un 201 et aucun changement. Le jour où
    // une route de mise à jour existera, ce repli devra devenir un 409.
    const existing = await this.profilPMRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const profil = ProfilPMFactory.creer({
      utilisateurId: userId,
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
