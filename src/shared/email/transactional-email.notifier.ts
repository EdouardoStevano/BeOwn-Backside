import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_SERVICE, type EmailService } from './email.service';
import {
  EmailRecipientReader,
  type EmailRecipient,
} from './ports/email-recipient.port';

/**
 * Envoi des e-mails TRANSACTIONNELS déclenchés par un événement métier, à
 * partir d'un simple `userId`.
 *
 * Pourquoi ce service plutôt qu'un appel direct au transport depuis chaque
 * chemin métier :
 *  1. les appelants (webhook Stripe, exécution de distribution, décision KYC
 *     admin) connaissent un `userId`, pas une adresse ni un prénom ;
 *  2. la règle d'opt-out (`user_preferences.notifEmail`) doit être appliquée
 *     À UN SEUL ENDROIT — dupliquée dans cinq chemins, elle finirait par
 *     diverger, et une divergence ici, c'est un e-mail envoyé à quelqu'un qui
 *     l'a refusé ;
 *  3. l'e-mail est un EFFET DE BORD d'un mouvement d'argent déjà commis :
 *     aucune de ces méthodes ne doit jamais lever, sous peine de faire échouer
 *     — ou pire, de faire rejouer — une opération financière réussie. Toutes
 *     absorbent leurs erreurs et se contentent de les journaliser.
 *
 * Les méthodes `sendX` du port `EmailService` sont OPTIONNELLES (tous les
 * transports ne les implémentent pas) : chaque appel est donc gardé, exactement
 * comme le fait le reste du repo.
 */
@Injectable()
export class TransactionalEmailNotifier {
  private readonly logger = new Logger(TransactionalEmailNotifier.name);

  constructor(
    @Inject(EMAIL_SERVICE)
    private readonly emails: EmailService,
    private readonly recipients: EmailRecipientReader,
  ) {}

  /** Dépôt crédité sur le portefeuille (webhook `payment_intent.succeeded`). */
  async depotConfirme(userId: number, montant: number): Promise<void> {
    await this.envoyer(userId, 'depot-confirmed', (destinataire) =>
      this.emails.sendDepotConfirmedEmail?.(
        destinataire.email,
        destinataire.prenom,
        montant,
      ),
    );
  }

  /** Retrait effectivement versé en banque (webhook `payout.paid`). */
  async retraitExecute(userId: number, montant: number): Promise<void> {
    await this.envoyer(userId, 'retrait-processed', (destinataire) =>
      this.emails.sendRetraitProcessedEmail?.(
        destinataire.email,
        destinataire.prenom,
        montant,
      ),
    );
  }

  /** Identité vérifiée (Stripe Identity ou décision manuelle d'un admin). */
  async kycValide(userId: number): Promise<void> {
    await this.envoyer(userId, 'kyc-validated', (destinataire) =>
      this.emails.sendKycValidatedEmail?.(
        destinataire.email,
        destinataire.prenom,
      ),
    );
  }

  /** Dossier d'identité refusé (décision manuelle d'un admin). */
  async kycRefuse(userId: number, motif?: string): Promise<void> {
    await this.envoyer(userId, 'kyc-rejected', (destinataire) =>
      this.emails.sendKycRejectedEmail?.(
        destinataire.email,
        destinataire.prenom,
        motif,
      ),
    );
  }

  /** Revenus locatifs nets versés au titre d'une période de distribution. */
  async distributionRecue(
    userId: number,
    distribution: { montant: number; projetTitre: string; periode: string },
  ): Promise<void> {
    await this.envoyer(userId, 'distribution-recue', (destinataire) =>
      this.emails.sendDistributionEmail?.(
        destinataire.email,
        destinataire.prenom,
        distribution,
      ),
    );
  }

  /**
   * Résolution du destinataire, application de l'opt-out, envoi, absorption
   * des erreurs. Le `templateKey` ne sert qu'aux journaux : il rend lisible
   * « quel e-mail n'est pas parti » sans exposer l'adresse (RGPD — on
   * journalise l'identifiant interne, jamais l'e-mail).
   */
  private async envoyer(
    userId: number,
    templateKey: string,
    envoi: (destinataire: EmailRecipient) => Promise<void> | undefined,
  ): Promise<void> {
    try {
      const destinataire = await this.recipients.findByUserId(userId);
      if (!destinataire) {
        this.logger.debug(
          `E-mail "${templateKey}" non envoyé : aucun destinataire joignable pour l'utilisateur #${userId}.`,
        );
        return;
      }
      if (!destinataire.accepteEmail) {
        this.logger.debug(
          `E-mail "${templateKey}" non envoyé : l'utilisateur #${userId} a désactivé les notifications par e-mail.`,
        );
        return;
      }
      const resultat = envoi(destinataire);
      if (resultat === undefined) {
        // Transport ne sachant pas envoyer ce type d'e-mail (méthode optionnelle
        // du port non implémentée) : ce n'est pas une erreur, mais ça doit se voir.
        this.logger.warn(
          `E-mail "${templateKey}" non envoyé : le transport courant n'implémente pas cet envoi.`,
        );
        return;
      }
      await resultat;
    } catch (err) {
      this.logger.warn(
        `Échec d'envoi de l'e-mail "${templateKey}" à l'utilisateur #${userId} : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
