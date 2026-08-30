import type { Money } from 'src/treasury/domain/value-objects/money.vo';

export const TREASURY_NOTIFIER = Symbol('TREASURY_NOTIFIER');

/**
 * Ce que la trésorerie a besoin de faire savoir — et rien de plus.
 *
 * **Pourquoi un port pour une notification.** Les use cases appelaient
 * directement `NotificationService`, et tiraient avec lui `NotificationType`,
 * importé depuis `notifications/infrastructure/persistences/entities/` — une
 * **entité ORM d'un autre contexte**, dans la couche application de celui-ci
 * (§27) — plus `UserRole` du contexte IAM pour désigner les destinataires
 * internes. Trois contextes traversés pour envoyer un message.
 *
 * Les méthodes disent des **faits de trésorerie**, pas des envois : « un dépôt
 * a été crédité », « un retrait a échoué ». Le choix du canal, du gabarit et
 * des destinataires appartient à `notifications`, qui est un abonné technique
 * et non un Bounded Context (§3.3) — ce port est l'endroit exact où passe cette
 * frontière.
 *
 * Aucune méthode ne rend de valeur ni ne rejette : **prévenir n'est jamais
 * bloquant**. Un service de notification indisponible ne doit pas défaire un
 * crédit qui a eu lieu, et c'est déjà ce que les `.catch(() => {})` semés chez
 * les appelants exprimaient — ici la garantie est dans le contrat, plutôt que
 * répétée à chaque appel.
 */
export interface TreasuryNotifier {
  /** Le dépôt du titulaire est arrivé sur son portefeuille. */
  depotCredite(fait: {
    utilisateurId: number;
    montant: Money;
    paymentIntentId: string;
  }): void;

  /** Le back-office suit les entrées d'argent. */
  depotCrediteAuxAdministrateurs(fait: {
    utilisateurId: number;
    montant: Money;
    paymentIntentId: string;
  }): void;

  /** Le compte de retrait du titulaire est désormais capable de recevoir. */
  compteDeRetraitActive(fait: {
    utilisateurId: number;
    compteId: string;
  }): void;

  /** Le retrait est parti vers la banque du titulaire. */
  retraitEnRoute(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void;

  /** Le retrait est arrivé en banque. */
  retraitVerse(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void;

  /** Le retrait a échoué et le solde a été rendu. */
  retraitEchoue(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
  }): void;

  /** Une demande de retrait manuel attend le back-office. */
  retraitManuelADemander(fait: {
    utilisateurId: number;
    montant: Money;
    transactionId: string;
    ibanDestination?: string | null;
  }): void;

  /**
   * Une situation que la plateforme ne sait pas dénouer seule, et qu'un humain
   * doit reprendre — un versement échoué sans référence, un rapatriement de
   * fonds qui n'aboutit pas.
   *
   * Elle est **nommée à part** parce qu'elle n'est pas une information : c'est
   * une demande d'intervention, et la confondre avec les notifications
   * ordinaires du retrait est ce qui la faisait passer pour un message de
   * courtoisie de plus dans la boîte des administrateurs.
   */
  interventionRequise(fait: {
    titre: string;
    message: string;
    contexte?: Record<string, unknown>;
  }): void;
}
