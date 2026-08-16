import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPPFactory } from 'src/profiles/domains/factories/profil-pp.factory';
import { ProfilPPDejaExistantError } from 'src/profiles/domains/errors';
import { champsDeclaresDepuisDto } from '../mappers/profil-pp-champs.mapper';

/**
 * Complétion du profil investisseur — personne physique.
 *
 * Ce use case n'orchestre plus que des accès (§6 — Application Service) :
 * vérifier l'unicité, récupérer l'identité du compte, faire naître l'agrégat,
 * le persister. La validité des données déclarées, le repli sur l'identité du
 * compte et le classement PSFP initial sont désormais dans `ProfilPPFactory.creer` —
 * ils y valent pour tout point d'entrée, pas seulement pour cette route HTTP.
 */
@Injectable()
export class CreateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    // Port du contexte IAM, et non son entité ORM : le profil a besoin de
    // l'identité du compte, pas de savoir dans quelle table elle est rangée
    // (§12.3). C'est aussi ce que fait déjà `notifications`, `investments` ou
    // `fiscalite` — `UsersInfrastructureModule` n'expose que ce port.
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<ProfilPP> {
    const existing = await this.profilPPRepository.findByUserId(userId);
    if (existing) throw new ProfilPPDejaExistantError();

    // prenom / nom sont NOT NULL et ne sont pas redemandés par le formulaire de
    // complétion : on les reprend de l'identité fournie à l'inscription.
    const compte = await this.userRepository.findById(userId);

    const profil = ProfilPPFactory.creer({
      utilisateurId: userId,
      prenom: compte?.firstname,
      nom: compte?.lastname,
      ...champsDeclaresDepuisDto(dto),
    });

    return this.profilPPRepository.save(profil);
  }
}
