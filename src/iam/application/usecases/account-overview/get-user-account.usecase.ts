import { Inject, Injectable } from '@nestjs/common';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import {
  AccesCompteRefuseError,
  UtilisateurIntrouvableError,
} from 'src/iam/domain/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';

/** Rôles détenant `users:read` — back-office, consultation d'un compte tiers. */
const ROLES_LECTURE: string[] = rolesWithPermission('users:read');

/**
 * Consultation d'un compte : le sien, ou celui d'un tiers pour qui en a le
 * droit.
 *
 * La règle d'accès est ici et non dans le contrôleur : elle **relit le rôle en
 * base** plutôt que de croire le token, de sorte qu'une rétrogradation
 * s'applique sans attendre l'expiration de la session. C'est une décision
 * métier sur un compte, pas un filtrage de requête HTTP — un job ou une autre
 * façade doivent y être soumis pareillement.
 *
 * Comme `GetMyAccountUseCase`, il vit dans ce module de composition et non dans
 * IAM : il assemble le compte avec le dossier KYC (Profiles) et le portefeuille
 * (Treasury), deux contextes qui dépendent déjà d'IAM. L'y laisser refermait le
 * cycle.
 */
@Injectable()
export class GetUserAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(cible: number, appelantId: number) {
    if (cible !== appelantId) {
      await this.assertLecteurAutorise(appelantId);
    }

    const compte = await this.userRepository.findById(cible);
    if (!compte) throw new UtilisateurIntrouvableError();

    const [kyc, wallet] = await Promise.all([
      this.kycRepository.findByUserId(cible).catch(() => null),
      this.walletRepository
        .findWalletByUser(cible, WalletType.INVESTISSEUR)
        .catch(() => null),
    ]);

    return { ...compte.toJSON(), kyc: kyc ?? null, wallet: wallet ?? null };
  }

  private async assertLecteurAutorise(appelantId: number): Promise<void> {
    const appelant = await this.userRepository.findById(appelantId);
    if (!appelant || !ROLES_LECTURE.includes(appelant.role)) {
      throw new AccesCompteRefuseError();
    }
  }
}
