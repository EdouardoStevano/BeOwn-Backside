import { Inject, Injectable, Logger } from '@nestjs/common';
import { KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';
import { Kyc } from 'src/kyc/domains/kyc';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/kyc/domains/ports/kyc.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
} from 'src/kyc/applications/ports/identity-verification.port';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';

/** Types d'événements Stripe Identity que ce contexte sait traiter. */
const EVENTS_TRAITES = [
  'identity.verification_session.verified',
  'identity.verification_session.processing',
  'identity.verification_session.requires_input',
] as const;

/**
 * Traitement des événements Stripe Identity.
 *
 * Ce code vivait entièrement dans `PaymentController` : quatre méthodes privées,
 * trois tables de transitions statiques et deux helpers, soit ~250 lignes de
 * métier KYC dans la couche présentation du contexte Payments (§12.5). Il en
 * sort sans changer de comportement — mêmes gardes, mêmes notifications, mêmes
 * traces d'audit, mêmes no-op.
 *
 * **La vérification de signature reste chez Payments.** L'endpoint Stripe est
 * partagé entre paiements et vérification d'identité : `PaymentController`
 * authentifie l'événement, puis passe les `identity.*` ici via {@link handle}.
 * Ce contexte ne reçoit que des événements déjà prouvés authentiques, et ne
 * dépend d'aucun module de paiement pour autant — la flèche va de Payments vers
 * KYC, jamais l'inverse.
 */
@Injectable()
export class HandleIdentityWebhookUseCase {
  private readonly logger = new Logger(HandleIdentityWebhookUseCase.name);

  constructor(
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
    private readonly notificationService: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Vrai si cet événement relève de la vérification d'identité. */
  static concerne(eventType: string): boolean {
    return (EVENTS_TRAITES as readonly string[]).includes(eventType);
  }

  /**
   * Point d'entrée unique. Un type d'événement inconnu est un no-op : c'est
   * l'appelant qui filtre, et un événement Identity que ce contexte ne sait pas
   * encore traiter ne doit pas faire échouer le webhook.
   */
  async handle(event: any): Promise<void> {
    if (event?.type === 'identity.verification_session.verified') {
      return this.handleVerified(event);
    }
    if (event?.type === 'identity.verification_session.processing') {
      return this.handleProcessing(event);
    }
    if (event?.type === 'identity.verification_session.requires_input') {
      return this.handleRequiresInput(event);
    }
  }

  // ── Gardes de transition ───────────────────────────────────────────────────

  /**
   * Garde de transition anti-rejeu Stripe. Stripe redélivre les events
   * Identity dans le désordre jusqu'à ~3 jours après leur émission ; les
   * anciens gardes n'étaient keyés que sur (statut courant + session id),
   * ce qui n'arrêtait que les doublons immédiats. Un event tardif pouvait
   * donc écraser une décision manuelle définitive prise entretemps par un
   * admin (ex. `verified` tardif re-validant un dossier REFUSE — F1).
   *
   * Chaque event webhook n'a le droit de s'appliquer que si le statut
   * courant du dossier fait partie de ces statuts "amont" légitimes ;
   * sinon c'est un no-op journalisé (aucune écriture de statut, aucune
   * notification, aucun audit log). Les décisions manuelles (VALIDE /
   * REFUSE) sont donc toujours définitives vis-à-vis du webhook Stripe.
   *
   * RENOUVELLEMENT / EXPIRE : ces statuts sont réservés à un futur parcours
   * de re-vérification KYC périodique — aucun code du repo ne les
   * positionne encore. Leur sémantique métier est cependant claire : le
   * dossier doit repasser par une nouvelle vérification Stripe Identity,
   * exactement comme un dossier qui n'a jamais été soumis. On les traite
   * donc comme NON_DEMARRE pour les trois events plutôt que de les exclure —
   * les exclure bloquerait silencieusement le futur parcours de
   * renouvellement le jour où il sera branché.
   */
  private static readonly VERIFIED_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.EN_COURS,
    KycStatus.EN_REVUE, // retry légitime après un échec (requires_input) déjà en revue
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  private static readonly REQUIRES_INPUT_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.EN_COURS,
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  private static readonly PROCESSING_ALLOWED_FROM = new Set<KycStatus>([
    KycStatus.NON_DEMARRE,
    KycStatus.RENOUVELLEMENT,
    KycStatus.EXPIRE,
  ]);

  /**
   * Vrai si le statut courant autorise la transition demandée ; sinon log
   * un warning (event id + statut courant) et retourne false — l'appelant
   * doit alors `return` immédiatement sans aucun effet de bord.
   */
  private transitionAutorisee(
    allowedFrom: ReadonlySet<KycStatus>,
    currentStatus: KycStatus,
    eventLabel: string,
    event: any,
    userId: number,
  ): boolean {
    if (allowedFrom.has(currentStatus)) return true;
    this.logger.warn(
      `Identity webhook ${eventLabel}: transition ignorée — statut actuel="${currentStatus}" ` +
        `non autorisé pour cet event (event=${event.id} userId=${userId}). ` +
        'Probable event Stripe redélivré/tardif après une décision manuelle — no-op.',
    );
    return false;
  }

  /**
   * Résout userId + dossier KYC associés à une session Stripe Identity.
   * Retourne null (no-op sûr) si userId absent des metadata ou si aucun
   * dossier KYC ne correspond — un event orphelin/tardif (ex. après
   * suppression de compte) ne doit jamais faire échouer le webhook.
   */
  private async resolveKyc(
    session: any,
  ): Promise<{ userId: number; kyc: Kyc } | null> {
    const userId = parseInt(session?.metadata?.userId, 10);
    if (isNaN(userId)) {
      this.logger.warn(
        `Identity webhook: userId manquant dans les metadata (session=${session?.id})`,
      );
      return null;
    }
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) {
      this.logger.warn(
        `Identity webhook: KYC introuvable pour userId=${userId} (session=${session?.id}) — no-op`,
      );
      return null;
    }
    return { userId, kyc };
  }

  // ── Les trois événements ───────────────────────────────────────────────────

  /**
   * `identity.verification_session.verified` — Stripe a validé automatiquement
   * l'identité : KYC → VALIDE, sans aucune action admin. Idempotent : une
   * redélivrance du même event (dossier déjà VALIDE pour cette session) est un
   * no-op qui évite de renotifier / re-télécharger les images / dupliquer
   * l'audit log.
   */
  private async handleVerified(event: any): Promise<void> {
    const session = event.data.object;
    const resolved = await this.resolveKyc(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;

    if (kyc.statut === KycStatus.VALIDE && kyc.fournisseurRef === session.id) {
      this.logger.debug(
        `Identity webhook verified: déjà traité (idempotent) userId=${userId} session=${session.id}`,
      );
      return;
    }

    if (
      !this.transitionAutorisee(
        HandleIdentityWebhookUseCase.VERIFIED_ALLOWED_FROM,
        kyc.statut,
        'verified',
        event,
        userId,
      )
    ) {
      return;
    }

    await this.updateKycStatus.execute(userId, KycStatus.VALIDE);
    this.logger.log(
      `KYC validé automatiquement via Stripe Identity: userId=${userId}`,
    );

    this.notificationService
      .push({
        utilisateurId: userId,
        type: NotificationType.KYC_VALIDE,
        titre: 'Identité vérifiée',
        message:
          "Votre vérification d'identité a été validée. Vous pouvez désormais investir.",
      })
      .catch(() => {});

    this.auditLog
      .create(
        'stripe',
        'system',
        'kyc.auto_valide',
        'kyc',
        kyc.id,
        undefined,
        undefined,
        {
          source: 'stripe_identity',
          sessionId: session.id,
          eventId: event.id,
          userId,
        },
      )
      .catch((err) =>
        this.logger.warn(`Audit log KYC auto-validé échoué: ${err?.message}`),
      );

    await this.enregistrerRapport(session, kyc, userId);
  }

  /**
   * Rapatrie le rapport de vérification et les images chez nous.
   *
   * Séparé de {@link handleVerified} parce que ce n'est pas la même chose :
   * la validation est acquise dès l'écriture du statut, ceci n'en est que la
   * pièce jointe. Un rapport absent laisse le dossier validé.
   */
  private async enregistrerRapport(
    session: any,
    kyc: Kyc,
    userId: number,
  ): Promise<void> {
    const reportData = await this.identity.extractReportData(session.id);
    if (!reportData) return;

    const folder = `kyc/${userId}`;

    // Upload des images chez nous en parallèle — l'URL pérenne remplace
    // l'identifiant de fichier Stripe, qui expire.
    const [frontUrl, backUrl, selfieUrl] = await Promise.all([
      reportData.documentFrontFileId
        ? this.identity.downloadAndUploadToCloudinary(
            reportData.documentFrontFileId,
            folder,
            `kyc_front_${userId}.jpg`,
          )
        : Promise.resolve(undefined),
      reportData.documentBackFileId
        ? this.identity.downloadAndUploadToCloudinary(
            reportData.documentBackFileId,
            folder,
            `kyc_back_${userId}.jpg`,
          )
        : Promise.resolve(undefined),
      reportData.selfieFileId
        ? this.identity.downloadAndUploadToCloudinary(
            reportData.selfieFileId,
            folder,
            `kyc_selfie_${userId}.jpg`,
          )
        : Promise.resolve(undefined),
    ]);

    await this.kycRepository.updateReportData(kyc.id, reportData.reportId, {
      nom: reportData.nom,
      prenom: reportData.prenom,
      dateNaissance: reportData.dateNaissance,
      nationalite: reportData.nationalite,
      typeDocument: reportData.typeDocument,
      numeroDocument: reportData.numeroDocument,
      dateExpiration: reportData.dateExpiration,
      // Repli sur l'identifiant Stripe si l'upload a échoué.
      documentFrontFileId: frontUrl ?? reportData.documentFrontFileId,
      documentBackFileId: backUrl ?? reportData.documentBackFileId,
      selfieFileId: selfieUrl ?? reportData.selfieFileId,
    });

    this.logger.log(
      `KYC report saved: userId=${userId} reportId=${reportData.reportId} ` +
        `cloudinary: front=${!!frontUrl} back=${!!backUrl} selfie=${!!selfieUrl}`,
    );
  }

  /**
   * `identity.verification_session.processing` — Stripe a capturé les photos
   * et démarre la vérification automatique. Statut transitoire, idempotent
   * par construction (réaffecter EN_COURS est sans effet de bord).
   */
  private async handleProcessing(event: any): Promise<void> {
    const session = event.data.object;
    const resolved = await this.resolveKyc(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;
    if (kyc.statut === KycStatus.EN_COURS) return; // idempotent no-op

    if (
      !this.transitionAutorisee(
        HandleIdentityWebhookUseCase.PROCESSING_ALLOWED_FROM,
        kyc.statut,
        'processing',
        event,
        userId,
      )
    ) {
      return;
    }

    await this.updateKycStatus.execute(userId, KycStatus.EN_COURS);
    this.logger.log(
      `KYC en cours (photos reçues) via Stripe Identity: userId=${userId}`,
    );
  }

  /**
   * `identity.verification_session.requires_input` — Stripe n'a pas pu
   * valider automatiquement : le dossier passe en revue manuelle (EN_REVUE),
   * l'utilisateur est invité à renvoyer ses documents, et Compliance/RCCI
   * sont alertés pour traiter le dossier via la décision manuelle
   * (`DecideKycManualReviewUseCase`, gaté aux dossiers EN_REVUE).
   * Idempotent : une redélivrance du même event pour une session déjà en
   * revue manuelle est un no-op (pas de double notification).
   */
  private async handleRequiresInput(event: any): Promise<void> {
    const session = event.data.object;
    const resolved = await this.resolveKyc(session);
    if (!resolved) return;
    const { userId, kyc } = resolved;

    if (
      kyc.statut === KycStatus.EN_REVUE &&
      kyc.fournisseurRef === session.id
    ) {
      this.logger.debug(
        `Identity webhook requires_input: déjà en revue manuelle (idempotent) userId=${userId} session=${session.id}`,
      );
      return;
    }

    if (
      !this.transitionAutorisee(
        HandleIdentityWebhookUseCase.REQUIRES_INPUT_ALLOWED_FROM,
        kyc.statut,
        'requires_input',
        event,
        userId,
      )
    ) {
      return;
    }

    const motif =
      session.last_error?.reason ??
      session.last_error?.code ??
      'Vérification en attente de révision manuelle';

    await this.updateKycStatus.execute(userId, KycStatus.EN_REVUE, motif);
    this.logger.log(
      `KYC en revue manuelle (Stripe Identity n'a pas pu valider automatiquement): userId=${userId} motif=${motif}`,
    );

    this.notificationService
      .push({
        utilisateurId: userId,
        type: NotificationType.KYC_REJETE,
        titre: 'Vérification KYC en attente de révision',
        message: `Votre vérification d'identité automatique n'a pas abouti. Merci de renvoyer vos documents. Motif : ${motif}`,
        metadata: { motif },
      })
      .catch(() => {});

    // Alerte aux admins (Compliance / RCCI) pour traitement manuel
    this.notificationService
      .pushToAdmins({
        type: NotificationType.KYC_REJETE,
        titre: 'KYC à réviser manuellement',
        message: `L'utilisateur #${userId} attend une révision manuelle de son KYC. Motif : ${motif}`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.RCCI],
        metadata: { userId, motif },
      })
      .catch(() => {});

    this.auditLog
      .create(
        'stripe',
        'system',
        'kyc.revue_manuelle_requise',
        'kyc',
        kyc.id,
        undefined,
        undefined,
        {
          source: 'stripe_identity',
          sessionId: session.id,
          eventId: event.id,
          userId,
          motif,
        },
      )
      .catch((err) =>
        this.logger.warn(
          `Audit log KYC revue manuelle échoué: ${err?.message}`,
        ),
      );
  }
}
