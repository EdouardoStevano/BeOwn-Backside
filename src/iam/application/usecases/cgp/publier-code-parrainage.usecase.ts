import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UserNotFoundError } from 'src/iam/domain/errors/account.errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { CodeParrainageCgp } from 'src/iam/domain/value-objects/code-parrainage-cgp.vo';

/**
 * Le conseiller publie — ou renouvelle — son code de parrainage.
 *
 * Le contrôleur faisait tout : garde de rôle, lecture de la ligne, composition
 * de la chaîne, `save()`. La règle (« seul un CGP publie un code ») est
 * revenue à l'agrégat ; il ne reste ici que l'orchestration, et le tirage de
 * l'aléa — que le domaine n'a pas à connaître.
 */
@Injectable()
export class PublierCodeParrainageUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(utilisateurId: number): Promise<{ referralCode: string }> {
    const conseiller = await this.users.findById(utilisateurId);
    if (!conseiller) throw new UserNotFoundError();

    conseiller.publierCodeParrainage(
      CodeParrainageCgp.depuisAlea(randomBytes(4).toString('hex')),
    );
    await this.users.update(conseiller);

    return { referralCode: conseiller.codeParrainageCgp as string };
  }
}
