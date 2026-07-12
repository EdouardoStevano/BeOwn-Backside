import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { UserNotFoundError } from 'src/users/domains/errors/user.errors';
import { UsersAccountService } from '../services/user-account.service';
import { buildOnboardingProgress } from './read-models/onboarding-progress';
import { PROFIL_REPOSITORY } from 'src/profiles/applications/ports/repositories/profil.repository';
import type { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { GetMyProfileQuery } from './get-my-profile.query';

/**
 * Read model de composition : assemble la vue « mon compte » à partir de
 * plusieurs contextes.
 *
 * Dette connue : ce handler appelle directement les repositories de Profiles,
 * Documents et Wallets. Chacun de ces contextes devrait exposer un contrat
 * publié (comme Users le fait avec USER_ACCOUNT_SERVICE) et cette query
 * consommerait ces contrats. Le couplage est ici concentré en un seul endroit,
 * au lieu d'être dispersé dans le contrôleur HTTP.
 */
@QueryHandler(GetMyProfileQuery)
export class GetMyProfileHandler implements IQueryHandler<GetMyProfileQuery> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(query: GetMyProfileQuery): Promise<Record<string, unknown>> {
    const { userId } = query;

    const user = await this.userRepository.findById(userId);
    if (!user) throw new UserNotFoundError();

    const [profilPP, profilPM, kyc, documents, wallet, preferences] =
      await Promise.all([
        this.profilRepository.findProfilPPByUserId(userId).catch(() => null),
        this.profilRepository.findProfilPMByUserId(userId).catch(() => null),
        this.profilRepository.findKycByUserId(userId).catch(() => null),
        this.documentRepository.findByUserId(userId).catch(() => []),
        this.walletRepository
          .findWalletByUser(userId, WalletType.INVESTISSEUR)
          .catch(() => null),
        this.userRepository.findPreferences(userId).catch(() => null),
      ]);

    const progress = buildOnboardingProgress({
      userType: user.userType ?? null,
      profilPP,
      profilPM,
      kycStatut: (kyc?.statut as string) ?? 'non_demarre',
      kycMotifRefus: kyc?.motifRefus,
    });

    return {
      ...UsersAccountService.toPublicView(user),
      userType: progress.inferredType,
      profilPP: profilPP ?? null,
      profilPM: profilPM ?? null,
      kyc: kyc ?? null,
      wallet: wallet ?? null,
      documents,
      completionStep: progress.completionStep,
      completionSteps: progress.completionSteps,
      completionProgress: progress.completionProgress,
      isProfileComplete: progress.isProfileComplete,
      preferences,
    };
  }
}
