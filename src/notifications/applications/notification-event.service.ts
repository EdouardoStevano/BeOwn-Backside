import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';

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
}
