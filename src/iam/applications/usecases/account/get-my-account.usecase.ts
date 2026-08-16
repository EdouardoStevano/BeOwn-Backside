import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
} from 'src/documents/applications/ports/repositories/document.repository';
import { UtilisateurIntrouvableError } from 'src/iam/domains/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { GetPreferencesUseCase } from 'src/preferences/applications/usecases/get-preferences.usecase';
import { GetOnboardingStatusUseCase } from 'src/profiles/applications/usecases/get-onboarding-status.usecase';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/wallets/applications/ports/repositories/wallet.repository';

/**
 * Vue d'ensemble du compte du titulaire : qui il est, où en est son dossier,
 * ce qu'il possède.
 *
 * **Composition, pas métier.** Chaque contexte répond de sa part — le dossier
 * réglementaire et son avancement viennent de `GetOnboardingStatusUseCase`,
 * les réglages de `GetPreferencesUseCase`, le portefeuille et les pièces de
 * leurs ports respectifs. Ce use case les demande de front et assemble ; il ne
 * décide de rien.
 *
 * Cette composition vivait dans `UserController.getMe`, qui se faisait injecter
 * cinq repositories appartenant à quatre autres contextes. La présentation
 * parlait donc directement à des adapters de sortie qui ne la regardaient pas
 * (§2 : `presentation` et `infrastructure` sont parallèles, tout passe par
 * `application`). Le contrôleur ne connaît plus qu'un use case.
 *
 * Chaque lecture est **tolérante** : un portefeuille indisponible ne doit pas
 * empêcher le titulaire de voir son compte. C'était déjà le cas, et c'est
 * volontaire — cette route est la page d'accueil de l'espace connecté.
 */
@Injectable()
export class GetMyAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly getOnboardingStatus: GetOnboardingStatusUseCase,
    private readonly getPreferences: GetPreferencesUseCase,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(userId: number) {
    const compte = await this.userRepository.findById(userId);
    if (!compte) throw new UtilisateurIntrouvableError();

    const [dossier, documents, wallet, preferences] = await Promise.all([
      this.getOnboardingStatus.execute({
        utilisateurId: userId,
        typeDeclare: compte.userType,
      }),
      this.documentRepository.findByUserId(userId).catch(() => []),
      this.walletRepository
        .findWalletByUser(userId, WalletType.INVESTISSEUR)
        .catch(() => null),
      this.getPreferences.execute(userId).catch(() => null),
    ]);

    return {
      ...compte.toJSON(),
      // Le type **effectif** prime sur le type annoncé : c'est le dossier
      // réellement ouvert qui fait foi, et lui seul est opposable.
      userType: dossier.userType ?? compte.userType,
      profilPP: dossier.profilPP,
      profilPM: dossier.profilPM,
      kyc: dossier.kyc,
      wallet: wallet ?? null,
      documents,
      completionStep: dossier.completionStep,
      completionSteps: dossier.completionSteps,
      completionProgress: dossier.completionProgress,
      isProfileComplete: dossier.isProfileComplete,
      preferences,
    };
  }
}
