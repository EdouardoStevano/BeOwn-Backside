import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../ports/payment.gateway';
import { PaiementEtrangerAuCompteError } from 'src/treasury/domain/errors/treasury.errors';
import { CrediterUnDepotUseCase } from './crediter-un-depot.usecase';

export interface ConfirmerUnDepotCommand {
  utilisateurId: number;
  paymentIntentId: string;
}

export type IssueDeLaConfirmation =
  | { issue: 'credite'; walletId: string }
  | { issue: 'deja-credite' }
  /** Le paiement n'a pas abouti chez le fournisseur ; son statut est rendu tel quel. */
  | { issue: 'paiement-non-abouti'; statut: string };

/**
 * Le titulaire annonce que son paiement a abouti, et demande le crédit.
 *
 * **Le statut n'est jamais cru sur parole** : le paiement est relu chez le
 * fournisseur, qui en est la seule source de vérité. Le corps de la requête ne
 * porte qu'un identifiant.
 *
 * **La propriété du paiement est vérifiée avant tout crédit** — correctif H-1
 * de l'audit du 21/07/2026. L'identifiant `pi_xxx` transite par le navigateur
 * du payeur : sans cette garde, le connaître suffirait à s'attribuer le dépôt
 * d'un tiers. Elle vivait dans le contrôleur HTTP, en `ForbiddenException`
 * levée à la main ; elle est ici parce que c'est une **décision sur de
 * l'argent**, et qu'un autre appelant — un job, une autre façade — doit y être
 * soumis pareillement (§14).
 */
@Injectable()
export class ConfirmerUnDepotUseCase {
  private readonly logger = new Logger(ConfirmerUnDepotUseCase.name);

  constructor(
    @Inject(PAYMENT_GATEWAY)
    private readonly paiements: PaymentGateway,
    private readonly crediterUnDepot: CrediterUnDepotUseCase,
  ) {}

  async execute(
    commande: ConfirmerUnDepotCommand,
  ): Promise<IssueDeLaConfirmation> {
    const paiement = await this.paiements.lireLePaiement(
      commande.paymentIntentId,
    );

    if (paiement.statut !== 'succeeded') {
      return { issue: 'paiement-non-abouti', statut: paiement.statut };
    }

    // Un paiement sans titulaire connu est traité comme étranger : personne ne
    // peut s'en réclamer, et le repli inverse — créditer l'appelant — est
    // exactement l'abus que la garde empêche.
    if (paiement.utilisateurId !== commande.utilisateurId) {
      this.logger.warn(
        `Tentative de confirmation de dépôt non autorisée: appelant=${commande.utilisateurId} ` +
          `propriétaire=${paiement.utilisateurId ?? 'inconnu'} pi=${commande.paymentIntentId}`,
      );
      throw new PaiementEtrangerAuCompteError({
        paymentIntentId: commande.paymentIntentId,
      });
    }

    const credit = await this.crediterUnDepot.execute({
      utilisateurId: commande.utilisateurId,
      montant: paiement.montant,
      paymentIntentId: paiement.intentId,
    });

    return credit.issue === 'credite'
      ? { issue: 'credite', walletId: credit.walletId }
      : { issue: 'deja-credite' };
  }
}
