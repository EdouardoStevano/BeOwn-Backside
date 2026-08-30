import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
  type VerificationSessionResult,
} from 'src/onboarding/application/ports/identity-verification.port';
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
 * **Le statut n'est pas touché**, et c'est ce qui compte ici. Ouvrir une
 * session ne prouve rien : le dossier ne passe `EN_COURS` que quand le
 * fournisseur confirme la capture des pièces, et `VALIDE` que sur son verdict
 * (cf. {@link HandleIdentityWebhookUseCase}). L'ancienne écriture posait
 * `NON_DEMARRE` en même temps que la référence de session — ce qui remettait à
 * zéro un dossier déjà validé ou déjà en revue dès qu'une session était
 * rouverte. Rattacher la session est désormais un geste qui ne dit rien de
 * l'avancement.
 */
@Injectable()
export class StartKycSessionUseCase {
  private readonly logger = new Logger(StartKycSessionUseCase.name);

  constructor(
    private readonly createKyc: CreateKycUseCase,
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async execute(
    utilisateurId: number,
    email: string,
  ): Promise<VerificationSessionResult> {
    // `CreateKycUseCase` est idempotent, d'où l'absence de test d'existence.
    const profil = await this.createKyc.execute(utilisateurId);

    const session = await this.identity.createVerificationSession(
      utilisateurId,
      email,
    );

    profil.rattacherSessionDeVerification(session.sessionId, 'stripeIdentity');
    await this.profils.save(profil);

    this.logger.log(
      `KYC session créée: userId=${utilisateurId} sessionId=${session.sessionId}`,
    );
    return session;
  }
}
