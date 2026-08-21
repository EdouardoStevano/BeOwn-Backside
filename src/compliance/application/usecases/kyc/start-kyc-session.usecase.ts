import { Inject, Injectable, Logger } from '@nestjs/common';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
  type VerificationSessionResult,
} from 'src/compliance/application/ports/identity-verification.port';
import { CreateKycUseCase } from './create-kyc.usecase';

/**
 * Ouverture d'une session de vérification chez le fournisseur.
 *
 * Trois gestes qui vont ensemble : s'assurer que le dossier existe, ouvrir la
 * session, rattacher sa référence au dossier. Ils étaient écrits dans
 * `PaymentController.startKyc` — la couche présentation d'un *autre* contexte,
 * qui appelait un use case de Profiles puis écrivait elle-même en base par le
 * port du repository (§12.5, §12.9).
 *
 * Le statut reste `NON_DEMARRE` après l'ouverture : ce n'est pas un oubli.
 * Ouvrir une session ne prouve rien — le dossier ne passe `EN_COURS` que quand
 * Stripe confirme la capture des photos (`identity.verification_session.processing`,
 * cf. {@link HandleIdentityWebhookUseCase}). Poser `EN_COURS` ici afficherait
 * une vérification en cours à quiconque a simplement cliqué sur le bouton.
 */
@Injectable()
export class StartKycSessionUseCase {
  private readonly logger = new Logger(StartKycSessionUseCase.name);

  constructor(
    private readonly createKyc: CreateKycUseCase,
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async execute(
    utilisateurId: number,
    email: string,
  ): Promise<VerificationSessionResult> {
    // `CreateKycUseCase` est idempotent, d'où l'absence de test d'existence.
    const kyc = await this.createKyc.execute(utilisateurId);

    const session = await this.identity.createVerificationSession(
      utilisateurId,
      email,
    );

    await this.kycRepository.updateSession(
      kyc.id,
      session.sessionId,
      KycStatus.NON_DEMARRE,
    );

    this.logger.log(
      `KYC session créée: userId=${utilisateurId} sessionId=${session.sessionId}`,
    );
    return session;
  }
}
