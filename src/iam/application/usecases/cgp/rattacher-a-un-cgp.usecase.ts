import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from 'src/iam/domain/errors/account.errors';
import { CodeParrainageInconnuError } from 'src/iam/domain/errors/cgp.errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { CodeParrainageCgp } from 'src/iam/domain/value-objects/code-parrainage-cgp.vo';

/**
 * Les deux chemins qui rattachent un titulaire à un conseiller : celui du
 * titulaire, qui saisit un code, et celui de l'administration, qui désigne un
 * client.
 *
 * Ils sont réunis parce qu'ils appellent la **même** transition — jusqu'ici
 * ils ne l'appelaient pas : le premier refusait un second rattachement, le
 * second écrasait le conseiller en place sans rien dire (voir
 * `User.rattacherAu`).
 */
@Injectable()
export class RattacherAUnCgpUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * Le titulaire saisit le code que son conseiller lui a communiqué.
   *
   * @throws CodeParrainageInconnuError si aucun compte CGP ne publie ce code.
   */
  async parCode(
    utilisateurId: number,
    codeSaisi: string,
  ): Promise<{ cgpId: number; cgpName: string; linked: boolean }> {
    // `of` éprouve la forme avant d'interroger la base : une saisie qui n'a pas
    // la tête d'un code n'a rien à y faire. L'erreur levée porte le message et
    // le statut d'un code inconnu — voir `CodeParrainageMalFormeError`.
    const code = CodeParrainageCgp.of(codeSaisi);

    const conseiller = await this.users.findCgpByCodeParrainage(code.valeur);
    if (!conseiller) throw new CodeParrainageInconnuError();

    const titulaire = await this.users.findById(utilisateurId);
    if (!titulaire) throw new UserNotFoundError();

    titulaire.rattacherAu(conseiller.userId);
    await this.users.update(titulaire);

    return {
      cgpId: conseiller.userId,
      cgpName: [conseiller.firstname, conseiller.lastname]
        .filter(Boolean)
        .join(' '),
      linked: true,
    };
  }

  /** L'administration — ou le conseiller lui-même — désigne un client. */
  async parDesignation(
    clientId: number,
    cgpId: number,
  ): Promise<{ clientId: number; cgpId: number | null; linked: boolean }> {
    const client = await this.users.findById(clientId);
    if (!client) throw new UserNotFoundError();

    client.rattacherAu(cgpId);
    await this.users.update(client);

    return { clientId, cgpId: client.cgpId, linked: true };
  }
}
