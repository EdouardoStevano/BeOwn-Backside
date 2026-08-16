import { Inject, Injectable } from '@nestjs/common';
import { UserType } from 'src/iam/domains/enums/user.enum';
import { UtilisateurIntrouvableError } from 'src/iam/domains/errors';
import { User } from 'src/iam/domains/models/user';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';

/** Ce que le titulaire peut changer sur son propre compte. */
export interface ChampsCompte {
  firstname?: string;
  lastname?: string | null;
}

/**
 * Le titulaire met à jour son identité déclarée.
 *
 * Le contrôleur chargeait le compte, appelait `rename` et sauvegardait
 * lui-même : trois lignes d'orchestration dans la couche présentation, qui
 * n'existaient nulle part ailleurs pour un import ou un back-office.
 */
@Injectable()
export class UpdateMyAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: number, champs: ChampsCompte): Promise<User> {
    const compte = await this.userRepository.findById(userId);
    if (!compte) throw new UtilisateurIntrouvableError();

    // `|| undefined` : une chaîne vide vaut « ne rien changer », pas « effacer
    // mon prénom » — la colonne est requise. Comportement d'origine conservé.
    compte.rename(champs.firstname || undefined, champs.lastname);

    return this.userRepository.update(compte);
  }
}

/**
 * Le titulaire annonce s'il ouvre un compte de personne physique ou morale.
 *
 * Étape 1 du parcours d'entrée en relation, posée avant qu'aucun dossier
 * n'existe — c'est ce qui la distingue du type **effectif**, que le contexte
 * Profiles déduit du dossier réellement ouvert.
 */
@Injectable()
export class DeclareUserTypeUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(userId: number, userType: UserType): Promise<User> {
    const compte = await this.userRepository.findById(userId);
    if (!compte) throw new UtilisateurIntrouvableError();

    if (!compte.declarerType(userType)) return compte;

    return this.userRepository.update(compte);
  }
}
