import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

/** Ce qu'il faut pour raconter ce qui vient d'arriver à un dossier. */
interface FaitKyc {
  utilisateurId: number;
  kycId: string;
  sessionId: string;
  evenementId: string;
}

/**
 * Ce que la plateforme dit au titulaire, à l'équipe et au journal d'audit
 * quand un dossier change d'état.
 *
 * **Rien n'y bloque jamais le traitement.** Chaque envoi est en « et si ça
 * échoue, tant pis » : le statut du dossier est déjà écrit, et une
 * notification perdue ne doit pas transformer un webhook réussi en échec —
 * que le fournisseur rejouerait, refaisant tout le reste au passage.
 *
 * Le journal d'audit obéit à la même règle mais mérite d'être surveillé : il
 * est la trace réglementaire de qui a décidé quoi. Son échec est donc
 * journalisé, là où celui d'une notification est absorbé en silence.
 */
@Injectable()
export class AnnoncesKycService {
  private readonly logger = new Logger(AnnoncesKycService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Identité établie sans intervention humaine. */
  annoncerVerificationAutomatique(fait: FaitKyc): void {
    this.notificationService
      .push({
        utilisateurId: fait.utilisateurId,
        type: NotificationType.KYC_VALIDE,
        titre: 'Identité vérifiée',
        message:
          "Votre vérification d'identité a été validée. Vous pouvez désormais investir.",
      })
      .catch(() => {});

    this.tracer('kyc.auto_valide', fait);
  }

  /**
   * Le fournisseur n'a pas tranché : le titulaire est invité à recommencer, et
   * l'équipe conformité est alertée pour reprendre le dossier à la main
   * (`DecideKycManualReviewUseCase`).
   *
   * Deux notifications et non une : sans l'alerte interne, un dossier peut
   * attendre indéfiniment que quelqu'un pense à consulter la file de revue.
   */
  annoncerRevueManuelleRequise(fait: FaitKyc, motif: string): void {
    this.notificationService
      .push({
        utilisateurId: fait.utilisateurId,
        type: NotificationType.KYC_REJETE,
        titre: 'Vérification KYC en attente de révision',
        message: `Votre vérification d'identité automatique n'a pas abouti. Merci de renvoyer vos documents. Motif : ${motif}`,
        metadata: { motif },
      })
      .catch(() => {});

    this.notificationService
      .pushToAdmins({
        type: NotificationType.KYC_REJETE,
        titre: 'KYC à réviser manuellement',
        message: `L'utilisateur #${fait.utilisateurId} attend une révision manuelle de son KYC. Motif : ${motif}`,
        roles: [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE, UserRole.RCCI],
        metadata: { userId: fait.utilisateurId, motif },
      })
      .catch(() => {});

    this.tracer('kyc.revue_manuelle_requise', fait, { motif });
  }

  /**
   * L'acteur est `stripe` / `system` : ces écritures ne sont imputables à
   * aucun humain, et le journal doit le dire — c'est ce qui les distingue
   * d'une décision du RCCI portant sur le même dossier.
   */
  private tracer(
    action: string,
    fait: FaitKyc,
    extra: Record<string, unknown> = {},
  ): void {
    this.auditLog
      .create(
        'stripe',
        'system',
        action,
        'kyc',
        fait.kycId,
        undefined,
        undefined,
        {
          source: 'stripe_identity',
          sessionId: fait.sessionId,
          eventId: fait.evenementId,
          userId: fait.utilisateurId,
          ...extra,
        },
      )
      .catch((err) =>
        this.logger.warn(`Audit log « ${action} » échoué : ${err?.message}`),
      );
  }
}
