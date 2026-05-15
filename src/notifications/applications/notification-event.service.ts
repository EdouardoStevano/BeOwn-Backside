import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(private readonly notifications: NotificationService) {}

  async kycValidatedByAdmin(userId: number, adminId: number): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.KYC_VALIDE,
        titre: 'Identité vérifiée ✓',
        message: 'Votre KYC a été validé par notre équipe. Vous pouvez désormais investir.',
        metadata: { adminId },
      });
    } catch (err) {
      this.logger.warn(`kycValidatedByAdmin failed: ${(err as Error)?.message}`);
    }
  }

  async kycRejectedByAdmin(userId: number, motif: string, adminId: number): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.KYC_REJETE,
        titre: 'KYC refusé',
        message: `Votre dossier KYC a été refusé. Motif : ${motif}. Vous pouvez resoumettre vos documents.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`kycRejectedByAdmin failed: ${(err as Error)?.message}`);
    }
  }

  async accountSuspended(userId: number, motif: string | null, adminId: number): Promise<void> {
    try {
      const suffix = motif ? `. Motif : ${motif}` : '';
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_SUSPENDU,
        titre: 'Compte suspendu',
        message: `Votre compte a été suspendu par l'équipe BeOwn${suffix}.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`accountSuspended failed: ${(err as Error)?.message}`);
    }
  }

  async accountReactivated(userId: number, adminId: number): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_REACTIVE,
        titre: 'Compte réactivé ✓',
        message: 'Votre compte a été réactivé. Vous pouvez à nouveau accéder à la plateforme.',
        metadata: { adminId },
      });
    } catch (err) {
      this.logger.warn(`accountReactivated failed: ${(err as Error)?.message}`);
    }
  }

  async accountClosed(userId: number, motif: string | null, adminId: number): Promise<void> {
    try {
      const suffix = motif ? `. Motif : ${motif}` : '';
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.COMPTE_CLOS,
        titre: 'Compte clôturé',
        message: `Votre compte a été clôturé par l'équipe BeOwn${suffix}.`,
        metadata: { motif, adminId },
      });
    } catch (err) {
      this.logger.warn(`accountClosed failed: ${(err as Error)?.message}`);
    }
  }

  async profileUpdatedByAdmin(
    userId: number,
    changedFields: string[],
    adminId: number,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.PROFIL_MODIFIE,
        titre: 'Profil mis à jour',
        message: `Votre profil a été modifié par l'équipe BeOwn (${changedFields.join(', ')}).`,
        metadata: { changedFields, adminId },
      });
    } catch (err) {
      this.logger.warn(`profileUpdatedByAdmin failed: ${(err as Error)?.message}`);
    }
  }

  async echeanceUpcoming(echeance: any, project: any): Promise<void> {
    try {
      const userId = echeance.investissement?.utilisateurId;
      if (!userId) return;
      const dateStr = new Date(echeance.datePrevue).toLocaleDateString('fr-FR');
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.ECHEANCE,
        titre: 'Échéance à venir',
        message: `Votre échéance n°${echeance.numero} de ${echeance.montantTotal} XOF pour « ${project.titre} » est prévue le ${dateStr}.`,
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
          datePrevue: echeance.datePrevue,
        },
      });
    } catch (err) {
      this.logger.warn(`echeanceUpcoming failed: ${(err as Error)?.message}`);
    }
  }

  async echeancePaid(echeance: any, project: any): Promise<void> {
    try {
      const userId = echeance.investissement?.utilisateurId;
      if (!userId) return;
      await this.notifications.push({
        utilisateurId: userId,
        type: NotificationType.ECHEANCE,
        titre: 'Échéance payée ✓',
        message: `L'échéance n°${echeance.numero} de ${echeance.montantTotal} XOF pour « ${project.titre} » a été créditée sur votre wallet.`,
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
        },
      });
    } catch (err) {
      this.logger.warn(`echeancePaid failed: ${(err as Error)?.message}`);
    }
  }

  async echeanceOverdueAdmin(echeance: any, project: any): Promise<void> {
    try {
      await this.notifications.pushToRoles({
        type: NotificationType.ECHEANCE,
        titre: 'Échéance en retard',
        message: `L'échéance n°${echeance.numero} de ${echeance.montantTotal} XOF pour "${project.titre}" est en retard.`,
        roles: [UserRole.ADMIN, UserRole.FINANCIER],
        metadata: {
          echeanceId: echeance.id,
          investissementId: echeance.investissementId,
          projetId: project.id,
          numero: echeance.numero,
          montant: Number(echeance.montantTotal),
        },
      });
    } catch (err) {
      this.logger.warn(`echeanceOverdueAdmin failed: ${(err as Error)?.message}`);
    }
  }
}
