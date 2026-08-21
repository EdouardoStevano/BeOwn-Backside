import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/iam/domain/ports/hashing.service';
import {
  ConfirmationParMotDePasseImpossibleError,
  MotDePasseIncorrectError,
  UtilisateurIntrouvableError,
} from 'src/iam/domain/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { DeleteAccountUseCase } from './delete-account.usecase';

/**
 * Suppression de son propre compte, après confirmation du mot de passe.
 *
 * **Cette confirmation ne fonctionnait pas.** Le contrôleur lisait
 * `(found as any).password` sur l'agrégat `User`, qui n'expose son empreinte
 * que par `passwordHash` : la valeur était donc toujours `undefined`, et la
 * route répondait « Confirmation impossible » à tout le monde, mot de passe
 * correct compris. La spec ne l'a pas vu parce qu'elle simulait le repository
 * par un objet nu portant une clé `password` — une forme que la persistance ne
 * rend jamais.
 *
 * La comparaison passe maintenant par `User.verifyPassword`, qui prend le
 * comparateur en paramètre et ne rend qu'un verdict : l'empreinte ne sort plus
 * de l'agrégat, et il n'y a plus d'endroit où se tromper de nom de champ.
 *
 * La levée des bloqueurs — investissements en cours, ordres ouverts, solde à
 * retirer — reste l'affaire de {@link DeleteAccountUseCase}, que ce use case
 * appelle une fois l'identité prouvée.
 */
@Injectable()
export class DeleteMyAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(HASHING_SERVICE)
    private readonly hashingService: HashingService,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  async execute(userId: number, motDePasse: string): Promise<void> {
    // `findByIdWithPassword` : `findById` laisse la colonne `password`
    // (`select: false`) à undefined, ce qui rendrait la vérification
    // impossible pour tous les comptes.
    const compte = await this.userRepository.findByIdWithPassword(userId);
    if (!compte) throw new UtilisateurIntrouvableError();

    // Compte sans mot de passe : inscription par fournisseur social. Il n'y a
    // pas de preuve à demander, donc pas de suppression self-service.
    if (!compte.hasPassword()) {
      throw new ConfirmationParMotDePasseImpossibleError();
    }

    const valide = await compte.verifyPassword(motDePasse, (clair, empreinte) =>
      this.hashingService.compare(clair, empreinte),
    );
    if (!valide) throw new MotDePasseIncorrectError();

    await this.deleteAccount.execute(userId, {
      userId,
      role: compte.role,
    });
  }
}
