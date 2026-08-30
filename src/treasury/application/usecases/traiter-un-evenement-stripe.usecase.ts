import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { HandleIdentityWebhookUseCase } from 'src/onboarding/application/usecases/kyc/handle-identity-webhook.usecase';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import type { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { RetraitEnSouffranceDomainEvent } from 'src/treasury/domain/events/retrait.domain-event';
import { CompteDeRetraitActiveDomainEvent } from 'src/treasury/domain/events/depot.domain-event';
import type {
  EvenementCompteMisAJour,
  EvenementFournisseur,
  EvenementPaiementAbouti,
  EvenementRelaye,
  EvenementVersement,
} from '../ports/payment.gateway';
import { CONNECT_GATEWAY, type ConnectGateway } from '../ports/connect.gateway';
import { CrediterUnDepotUseCase } from './crediter-un-depot.usecase';
import { ReglerUnRetraitUseCase } from './regler-un-retrait.usecase';

/**
 * Interprète un événement Stripe **déjà authentifié et déjà traduit**.
 *
 * **La signature n'est pas vérifiée ici**, et c'est volontaire : elle l'est par
 * la passerelle, avant que quoi que ce soit du corps ne soit lu. Ce use case
 * reçoit un fait établi, il ne décide pas s'il faut y croire.
 *
 * **La charge utile n'est pas fouillée ici non plus.** L'événement arrive comme
 * une union discriminée, dont chaque branche porte les seules valeurs qui
 * comptent. Les cinq branches vivaient dans le contrôleur HTTP et lisaient
 * `event.data.object.metadata.retraitTxId` à la main — chaque accès était une
 * hypothèse non vérifiée sur la réponse d'un tiers, dans du code qui décide de
 * mouvements d'argent (§14, §20).
 *
 * **L'endpoint est partagé avec la conformité** — un seul secret Stripe, un
 * seul point d'entrée. Les événements `identity.*` sont donc relayés tels
 * quels : la trésorerie n'en connaît ni les statuts, ni les transitions. C'est
 * la seule dépendance sortante de ce contexte vers un autre, et elle va dans le
 * sens que la Context Map autorise — la conformité ignore l'existence de la
 * trésorerie.
 *
 * Un événement inconnu n'est pas une erreur : Stripe en émet des dizaines
 * qu'aucun des deux contextes n'écoute, et répondre autre chose qu'un accusé de
 * réception le ferait redélivrer en boucle.
 */
@Injectable()
export class TraiterUnEvenementStripeUseCase {
  private readonly logger = new Logger(TraiterUnEvenementStripeUseCase.name);

  constructor(
    private readonly crediterUnDepot: CrediterUnDepotUseCase,
    private readonly regler: ReglerUnRetraitUseCase,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
    @Inject(CONNECT_GATEWAY)
    private readonly connect: ConnectGateway,
    private readonly eventBus: EventBus,
    private readonly identite: HandleIdentityWebhookUseCase,
  ) {}

  async execute(evenement: EvenementFournisseur): Promise<void> {
    this.logger.log(
      `Stripe webhook: type=${evenement.type}, id=${evenement.id}`,
    );

    switch (evenement.nature) {
      case 'paiement-abouti':
        return this.crediterLeDepot(evenement);
      case 'compte-mis-a-jour':
        return this.synchroniserLeCompteDeRetrait(evenement);
      case 'versement-arrive':
        return this.finaliserLeRetrait(evenement);
      case 'versement-echoue':
        return this.defaireLeRetrait(evenement);
      case 'a-relayer':
        return this.relayer(evenement);
    }
  }

  /**
   * Ce que ce contexte ne traite pas : la vérification d'identité, et le reste.
   *
   * La charge utile est passée **opaque** au contexte qui en définit la forme.
   * C'est lui qui décide si l'événement lui parle — `concerne` est sa règle, pas
   * la nôtre.
   */
  private async relayer(evenement: EvenementRelaye): Promise<void> {
    if (!HandleIdentityWebhookUseCase.concerne(evenement.type)) return;
    await this.identite.handle(evenement.brut);
  }

  /**
   * Le paiement a abouti chez le fournisseur : le portefeuille est crédité.
   *
   * Ce chemin **double** la confirmation par le front, volontairement — le
   * navigateur peut se fermer entre le paiement et la confirmation, et le
   * webhook est alors le seul à savoir que l'argent est arrivé. C'est le use
   * case de crédit qui garantit qu'un seul des deux fera bouger le solde.
   *
   * Un paiement qui ne finance pas un dépôt — une souscription, par exemple —
   * est ignoré : son règlement appartient au contexte qui l'a déclenché. Un
   * paiement sans titulaire connu l'est aussi : il n'y a personne à créditer.
   */
  private async crediterLeDepot(
    evenement: EvenementPaiementAbouti,
  ): Promise<void> {
    const { paiement } = evenement;
    if (paiement.utilisateurId === null) return;
    if (paiement.operationType !== 'depot') return;

    await this.crediterUnDepot.execute({
      utilisateurId: paiement.utilisateurId,
      montant: paiement.montant,
      paymentIntentId: paiement.intentId,
    });
  }

  /** Le compte de retrait a changé — et vient peut-être de devenir utilisable. */
  private async synchroniserLeCompteDeRetrait(
    evenement: EvenementCompteMisAJour,
  ): Promise<void> {
    const { found, payoutsJustEnabled } =
      await this.connect.synchroniserDepuisWebhook(evenement.brut);
    if (!found) return;

    this.logger.log(
      `account.updated: compte=${evenement.compteId} ` +
        `payouts_enabled=${evenement.payoutsEnabled} ` +
        `details_submitted=${evenement.detailsSubmitted}`,
    );

    if (!payoutsJustEnabled) return;

    const titulaire = await this.connect.titulaireDuCompte(evenement.compteId);
    if (titulaire !== null) {
      this.eventBus.publish(
        new CompteDeRetraitActiveDomainEvent(titulaire, evenement.compteId),
      );
    }
  }

  /**
   * Le versement est arrivé en banque : le retrait est acquis.
   *
   * Le geste lui-même vit dans {@link ReglerUnRetraitUseCase}, parce que la
   * réconciliation y aboutit aussi — l'écrire ici en ferait la deuxième copie
   * d'une décision qui porte sur de l'argent.
   */
  private async finaliserLeRetrait(
    evenement: EvenementVersement,
  ): Promise<void> {
    const retrait = await this.retraitVise(evenement);
    if (!retrait) return;

    await this.regler.verse(retrait, evenement.versementId);
  }

  /** Le versement a échoué : les fonds reviennent au titulaire. */
  private async defaireLeRetrait(evenement: EvenementVersement): Promise<void> {
    const retrait = await this.retraitVise(evenement);
    if (!retrait) return;

    await this.regler.echoue(retrait, evenement.versementId);
  }

  /**
   * Le retrait que cet événement de versement désigne.
   *
   * Le lien passe par la référence posée au moment du versement explicite. Un
   * versement **automatique** n'en porte pas : il est simplement journalisé
   * pour `payout.paid`, mais escaladé pour `payout.failed` — de l'argent qui
   * n'est pas revenu au titulaire ne peut pas rester une ligne de log.
   */
  private async retraitVise(
    evenement: EvenementVersement,
  ): Promise<Transaction | null> {
    if (!evenement.retraitId) {
      if (evenement.nature === 'versement-echoue') {
        this.logger.warn(
          `payout.failed sans retraitTxId (versement automatique) ` +
            `payout=${evenement.versementId} account=${evenement.compte} — revue manuelle`,
        );
        this.eventBus.publish(
          new RetraitEnSouffranceDomainEvent(
            'Payout Stripe échoué — revue manuelle',
            `Un payout Stripe a échoué (payout=${evenement.versementId}, ` +
              `compte=${evenement.compte}) sans référence de retrait. ` +
              `Vérifier et recréditer manuellement si besoin.`,
            { payoutId: evenement.versementId, accountId: evenement.compte },
          ),
        );
      } else {
        this.logger.debug(
          `${evenement.type} sans retraitTxId (versement automatique) ` +
            `payout=${evenement.versementId} account=${evenement.compte} — info`,
        );
      }
      return null;
    }

    const mouvement = await this.registre.findById(evenement.retraitId);
    if (!mouvement?.estUnRetrait()) {
      this.logger.warn(
        `${evenement.type}: retrait introuvable txId=${evenement.retraitId}`,
      );
      return null;
    }
    return mouvement;
  }
}
