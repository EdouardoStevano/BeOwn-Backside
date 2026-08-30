import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';
import { WalletFactory } from 'src/treasury/domain/factories/wallet.factory';
import { TransactionFactory } from 'src/treasury/domain/factories/transaction.factory';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import { DepotCrediteDomainEvent } from 'src/treasury/domain/events/depot.domain-event';

export interface CrediterUnDepotCommand {
  utilisateurId: number;
  montant: Money;
  paymentIntentId: string;
}

/** Ce qu'il est advenu du dépôt — l'appelant n'a pas à relire pour le savoir. */
export type IssueDuDepot =
  | { issue: 'credite'; walletId: string }
  | { issue: 'deja-credite'; walletId: string };

/**
 * Porte l'argent d'un paiement abouti sur le portefeuille de son titulaire.
 *
 * **Un seul chemin pour deux déclencheurs.** La confirmation par le front
 * (`POST /payments/depot/confirm`) et le webhook `payment_intent.succeeded`
 * annoncent le même fait, souvent à quelques millisecondes d'écart. Ils
 * partageaient déjà une méthode privée du contrôleur ; ils partagent désormais
 * un use case, qui est le seul endroit d'où un dépôt peut être crédité.
 *
 * **L'idempotence est portée par le registre**, pas par une relecture
 * préalable : le mouvement est inséré d'abord, et la contrainte d'unicité sur
 * `depot:<paymentIntent>` tranche. Vérifier avant d'écrire aurait laissé la
 * fenêtre entre la lecture et l'écriture ouverte aux deux déclencheurs.
 *
 * **Le portefeuille est ouvert s'il n'existe pas.** Un titulaire peut payer
 * avant d'avoir jamais consulté son solde, et lui refuser le crédit pour cette
 * raison reviendrait à encaisser sans créditer.
 */
@Injectable()
export class CrediterUnDepotUseCase {
  private readonly logger = new Logger(CrediterUnDepotUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
    // Le dépôt **constate** ; qui doit l'apprendre — le titulaire, la finance —
    // appartient à l'abonné (§14, §38.3).
    private readonly eventBus: EventBus,
  ) {}

  async execute(commande: CrediterUnDepotCommand): Promise<IssueDuDepot> {
    const portefeuille = await this.portefeuilleDu(commande.utilisateurId);

    // L'agrégat éprouve la règle — portefeuille actif, montant positif, devise
    // cohérente — et lève une erreur de domaine si elle n'est pas tenue. Un
    // portefeuille **gelé** ne se crédite donc plus : le décrément SQL, seul
    // garde-fou jusqu'ici, ne regardait que le solde et jamais le statut.
    portefeuille.crediter(commande.montant);

    const consignation = await this.registre.consignerUnCredit(
      TransactionFactory.depot({
        walletId: portefeuille.id,
        montant: commande.montant,
        paymentIntentId: commande.paymentIntentId,
        utilisateurId: commande.utilisateurId,
      }),
    );

    if (consignation.issue !== 'consigne') {
      this.logger.debug(
        `Dépôt déjà crédité (idempotent) : pi=${commande.paymentIntentId}`,
      );
      return { issue: 'deja-credite', walletId: portefeuille.id };
    }

    this.logger.log(
      `Wallet crédité: userId=${commande.utilisateurId}, montant=${commande.montant.toString()}`,
    );

    // Le fait est publié après le crédit, et seulement au premier passage : un
    // titulaire ne doit pas recevoir deux fois l'annonce du même dépôt parce
    // que le webhook a doublé la confirmation du front.
    this.eventBus.publish(
      new DepotCrediteDomainEvent(
        commande.utilisateurId,
        portefeuille.id,
        commande.montant,
        commande.paymentIntentId,
      ),
    );

    return { issue: 'credite', walletId: portefeuille.id };
  }

  /**
   * Le portefeuille d'investissement du titulaire, ouvert au besoin.
   *
   * L'ouverture est **hors de la section critique** : elle est idempotente par
   * nature — un portefeuille par titulaire et par type — et l'inclure dans la
   * transaction du crédit allongerait le verrou pour rien.
   */
  private async portefeuilleDu(utilisateurId: number) {
    const existant = await this.wallets.findByUser(
      utilisateurId,
      WalletType.INVESTISSEUR,
    );
    if (existant) return existant;

    return this.wallets.creer(
      WalletFactory.ouvrirPourInvestisseur(utilisateurId),
    );
  }
}
