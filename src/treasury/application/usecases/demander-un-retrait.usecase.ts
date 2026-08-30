import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { TransactionStatus } from 'src/treasury/domain/enums/wallet.enum';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import type { Transaction } from 'src/treasury/domain/aggregates/transaction';
import {
  RetraitADemanderManuellementDomainEvent,
  RetraitEnRouteDomainEvent,
} from 'src/treasury/domain/events/retrait.domain-event';
import {
  SortieDeFondsService,
  type ResultatDuDebit,
} from '../services/sortie-de-fonds.service';
import { AcheminementDuRetraitService } from '../services/acheminement-du-retrait.service';
import { RendreLeSoldeUseCase } from './rendre-le-solde.usecase';

/**
 * Une demande de retrait, dans le vocabulaire du contexte.
 *
 * Ce n'est **pas** le DTO HTTP. Le use case importait `CreateRetraitDto` depuis
 * `presentation/http/dto/` et `ActiveUser` depuis les décorateurs d'IAM : la
 * couche application dépendait de la présentation, et de celle d'un autre
 * contexte (§27, §32). Ce type-ci est le contrat de la commande ; le
 * contrôleur traduit son DTO vers lui.
 */
export interface DemanderUnRetraitCommand {
  utilisateurId: number;
  montant: Money;
  /** Portefeuille source ; par défaut celui d'investissement du titulaire. */
  walletId?: string;
  /** Requis pour le seul parcours de secours — Stripe détient les coordonnées sinon. */
  ibanDestination?: string;
  /** Clé fournie par le client : une resoumission rend le retrait déjà ouvert. */
  cleDIdempotence?: string;
}

/**
 * Ce qu'il advient de la demande — six issues nommées, plutôt qu'un
 * `{ success: boolean }` que l'appelant devait interpréter au jugé.
 *
 * Les trois refus ne lèvent **pas** d'exception, et c'est délibéré : les routes
 * de retrait répondent `202` avec un corps depuis toujours, et faire remonter
 * ces cas en `4xx` changerait le contrat que le front consomme — un refactoring
 * ne déplace pas une frontière d'API. C'est le contrôleur qui rend chaque issue
 * dans la forme historique ; le jour où l'on voudra des statuts HTTP corrects,
 * la traduction est déjà au bon endroit et l'erreur de domaine existe déjà.
 */
export type IssueDuRetrait =
  | {
      issue: 'en-route';
      transactionId: string;
      statut: TransactionStatus;
      transfertId: string;
      versementId?: string;
    }
  | {
      issue: 'a-traiter-manuellement';
      transactionId: string;
      statut: TransactionStatus;
    }
  | { issue: 'deja-demande'; transactionId: string; statut: TransactionStatus }
  | { issue: 'transfert-refuse'; transactionId: string }
  | { issue: 'compte-de-retrait-non-pret' }
  | { issue: 'solde-insuffisant'; motif: string };

/**
 * Le titulaire demande à sortir des fonds de son portefeuille.
 *
 * **Une façade, et rien de plus** (§37.2). Elle choisit le rail, enchaîne les
 * gestes dans l'ordre, et traduit le résultat en issue. Elle ne porte aucune
 * règle : le débit et sa condition appartiennent à {@link SortieDeFondsService},
 * le dialogue avec le fournisseur à {@link AcheminementDuRetraitService}, le
 * recrédit à {@link RendreLeSoldeUseCase}. Elle ne connaît d'ailleurs ni
 * repository, ni passerelle, ni destinataire — seulement ces trois
 * collaborateurs et le bus sur lequel elle annonce ce qui vient d'arriver.
 *
 * **Deux rails, une seule règle de solde.** Le retrait part par Stripe Connect
 * quand le compte de retrait est prêt, et retombe sur un traitement manuel du
 * back-office sinon. Ce qui les distingue est le chemin de l'argent ; ce qui
 * leur est commun — le débit, sa condition, sa trace au registre — est écrit
 * une fois, dans le service.
 *
 * **L'ordre des gestes est ce qui protège l'argent**, et c'est la seule chose
 * que cette classe décide :
 *
 * 1. le portefeuille est débité **et** le mouvement consigné, d'un seul geste
 *    atomique — sans quoi deux demandes concurrentes passeraient toutes deux
 *    un contrôle fait sur une lecture obsolète ;
 * 2. les fonds sont acheminés ensuite. Si le transfert échoue, **rien n'a
 *    bougé chez le fournisseur** et le solde est rendu intégralement ;
 * 3. le versement vers la banque, lui, est *best-effort* — le service
 *    l'absorbe, et un refus ne défait rien.
 *
 * Le passage à `REUSSI` n'a pas lieu ici : il appartient au webhook
 * `payout.paid`, seul à savoir que l'argent est arrivé.
 */
@Injectable()
export class DemanderUnRetraitUseCase {
  constructor(
    private readonly sortieDeFonds: SortieDeFondsService,
    private readonly acheminement: AcheminementDuRetraitService,
    // Le retrait **constate** ; qui doit l'apprendre appartient à l'abonné
    // (§14, §38.3). Le port de notification n'est plus injecté ici.
    private readonly eventBus: EventBus,
    private readonly rendreLeSolde: RendreLeSoldeUseCase,
  ) {}

  async execute(commande: DemanderUnRetraitCommand): Promise<IssueDuRetrait> {
    const rejeu = await this.sortieDeFonds.retraitDejaDemande(
      commande.utilisateurId,
      commande.cleDIdempotence,
    );
    if (rejeu) return dejaDemande(rejeu);

    const compte = await this.acheminement.compteDeRetrait(
      commande.utilisateurId,
    );

    if (compte.payoutsEnabled && compte.accountId) {
      return this.parLeCompteConnecte(commande, compte.accountId);
    }

    // Parcours de secours : il exige un IBAN, faute de quoi il n'y a nulle part
    // où verser. Ce n'est pas une panne mais un geste manquant.
    if (!commande.ibanDestination) {
      return { issue: 'compte-de-retrait-non-pret' };
    }
    return this.parTraitementManuel(commande);
  }

  /** Débit, acheminement, et recrédit intégral si le transfert est refusé. */
  private async parLeCompteConnecte(
    commande: DemanderUnRetraitCommand,
    compteConnecte: string,
  ): Promise<IssueDuRetrait> {
    const debit = await this.sortieDeFonds.debiter({
      ...commande,
      cleCliente: commande.cleDIdempotence,
      statutInitial: TransactionStatus.EN_COURS,
      metadata: {
        method: 'stripe_connect',
        connectedAccountId: compteConnecte,
      },
    });
    if (debit.issue !== 'debite') return refusDuDebit(debit);

    const mouvement = debit.mouvement;
    const achemine = await this.acheminement.acheminer({
      mouvementId: mouvement.id,
      utilisateurId: commande.utilisateurId,
      montant: commande.montant,
      compteConnecte,
    });

    if (achemine.issue === 'transfert-refuse') {
      // Aucun fonds n'a quitté la plateforme : le débit est intégralement défait.
      await this.rendreLeSolde.execute({
        transactionId: mouvement.id,
        motif: `Transfer Stripe échoué: ${achemine.motif}`,
        statutFinal: TransactionStatus.ECHOUE,
      });
      return { issue: 'transfert-refuse', transactionId: mouvement.id };
    }

    await this.sortieDeFonds.rattacherLAcheminement(mouvement, achemine);

    this.eventBus.publish(
      new RetraitEnRouteDomainEvent(
        commande.utilisateurId,
        mouvement.id,
        commande.montant,
      ),
    );

    return {
      issue: 'en-route',
      transactionId: mouvement.id,
      statut: mouvement.statut,
      transfertId: achemine.transfertId,
      versementId: achemine.versementId,
    };
  }

  /**
   * Retrait de secours : le portefeuille est débité, et la demande attend le
   * back-office. Conservé tant que Stripe Connect n'est pas validé en staging.
   */
  private async parTraitementManuel(
    commande: DemanderUnRetraitCommand,
  ): Promise<IssueDuRetrait> {
    const debit = await this.sortieDeFonds.debiter({
      ...commande,
      cleCliente: commande.cleDIdempotence,
      statutInitial: TransactionStatus.EN_ATTENTE_PAIEMENT,
      metadata: {
        method: 'legacy_manuel',
        ibanDestination: commande.ibanDestination,
      },
    });
    if (debit.issue !== 'debite') return refusDuDebit(debit);

    this.eventBus.publish(
      new RetraitADemanderManuellementDomainEvent(
        commande.utilisateurId,
        debit.mouvement.id,
        commande.montant,
        commande.ibanDestination ?? null,
      ),
    );

    return {
      issue: 'a-traiter-manuellement',
      transactionId: debit.mouvement.id,
      statut: debit.mouvement.statut,
    };
  }
}

const dejaDemande = (mouvement: Transaction): IssueDuRetrait => ({
  issue: 'deja-demande',
  transactionId: mouvement.id,
  statut: mouvement.statut,
});

/** Traduit un débit refusé en issue — rejeu compris, qui n'est pas un refus. */
const refusDuDebit = (
  debit: Exclude<ResultatDuDebit, { issue: 'debite' }>,
): IssueDuRetrait =>
  debit.issue === 'deja-demande'
    ? dejaDemande(debit.mouvement)
    : { issue: 'solde-insuffisant', motif: debit.motif };
