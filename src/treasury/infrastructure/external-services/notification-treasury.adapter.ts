import { Injectable } from '@nestjs/common';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import type { TreasuryNotifier } from '../../application/ports/treasury-notifier.port';

/** Les rôles internes qui suivent les mouvements d'argent. */
const ROLES_FINANCE = [UserRole.SUPER_ADMIN, UserRole.FINANCIER];

/**
 * L'adaptateur du port {@link TreasuryNotifier}.
 *
 * **C'est ici que s'arrêtent les deux contextes voisins.** `NotificationType`
 * vient de l'entité ORM de `notifications` et `UserRole` du domaine d'IAM :
 * les deux étaient importés jusque dans les use cases de trésorerie, qui
 * dépendaient donc de la persistance d'un autre contexte (§27). Ils ne
 * franchissent plus la couche infrastructure.
 *
 * **Rien n'est attendu, rien ne rejette.** Chaque envoi part sans être attendu
 * et avale son échec : un service de notification indisponible ne doit pas
 * défaire un crédit qui a eu lieu. C'était déjà le sens des `.catch(() => {})`
 * semés chez les appelants ; la garantie est désormais dans l'adaptateur, où
 * elle ne peut plus être oubliée à un appel près.
 */
@Injectable()
export class NotificationTreasuryAdapter implements TreasuryNotifier {
  constructor(private readonly notifications: NotificationService) {}

  depotCredite(fait: {
    utilisateurId: number;
    montant: Money;
    paymentIntentId: string;
  }): void {
    this.pousser({
      utilisateurId: fait.utilisateurId,
      type: NotificationType.DEPOT_CONFIRME,
      titre: 'Dépôt confirmé',
      message: `Votre dépôt de ${fait.montant.toString()} a été crédité sur votre wallet.`,
      metadata: {
        paymentIntentId: fait.paymentIntentId,
        montant: fait.montant.montant,
      },
    });
  }

  depotCrediteAuxAdministrateurs(fait: {
    utilisateurId: number;
    montant: Money;
    paymentIntentId: string;
  }): void {
    this.pousserAuxAdmins({
      type: NotificationType.DEPOT_CONFIRME,
      titre: 'Dépôt utilisateur',
      message: `User #${fait.utilisateurId} a déposé ${fait.montant.toString()}.`,
      metadata: {
        userId: fait.utilisateurId,
        paymentIntentId: fait.paymentIntentId,
        montant: fait.montant.montant,
      },
    });
  }

  compteDeRetraitActive(fait: {
    utilisateurId: number;
    compteId: string;
  }): void {
    this.pousser({
      utilisateurId: fait.utilisateurId,
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Compte de retrait activé',
      message:
        'Votre compte de retrait Stripe est configuré. Vous pouvez désormais retirer vos fonds.',
      metadata: { accountId: fait.compteId },
    });
  }

  retraitEnRoute(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void {
    this.pousser({
      utilisateurId: fait.utilisateurId,
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Retrait en cours',
      message: `Votre retrait de ${fait.montant.toString()} est en cours d'acheminement vers votre compte bancaire.`,
      metadata: { transactionId: fait.transactionId },
    });
  }

  retraitVerse(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void {
    this.pousser({
      utilisateurId: fait.utilisateurId,
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Retrait effectué',
      message: `Votre retrait de ${fait.montant.toString()} a été versé sur votre compte bancaire.`,
      metadata: { transactionId: fait.transactionId },
    });
  }

  retraitEchoue(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void {
    this.pousser({
      utilisateurId: fait.utilisateurId,
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Retrait échoué — solde recrédité',
      message: `Votre retrait de ${fait.montant.toString()} n'a pas pu être effectué. Le montant a été recrédité sur votre wallet.`,
      metadata: { transactionId: fait.transactionId },
    });
  }

  retraitManuelADemander(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
    ibanDestination?: string | null;
  }): void {
    this.pousserAuxAdmins({
      type: NotificationType.RETRAIT_TRAITE,
      titre: 'Nouvelle demande de retrait',
      message:
        `L'utilisateur #${fait.utilisateurId} a demandé un retrait de ` +
        `${fait.montant.montant} ${fait.montant.devise} vers ${fait.ibanDestination}.`,
      metadata: {
        userId: fait.utilisateurId,
        transactionId: fait.transactionId,
        amount: fait.montant.montant,
        currency: fait.montant.devise,
        ibanDestination: fait.ibanDestination,
      },
    });
  }

  interventionRequise(fait: {
    titre: string;
    message: string;
    contexte?: Record<string, unknown>;
  }): void {
    this.pousserAuxAdmins({
      type: NotificationType.RETRAIT_TRAITE,
      titre: fait.titre,
      message: fait.message,
      metadata: fait.contexte ?? {},
    });
  }

  private pousser(notification: {
    utilisateurId: number;
    type: NotificationType;
    titre: string;
    message: string;
    metadata: Record<string, unknown>;
  }): void {
    void this.notifications.push(notification).catch(() => {});
  }

  private pousserAuxAdmins(notification: {
    type: NotificationType;
    titre: string;
    message: string;
    metadata: Record<string, unknown>;
  }): void {
    void this.notifications
      .pushToAdmins({ ...notification, roles: ROLES_FINANCE })
      .catch(() => {});
  }
}
