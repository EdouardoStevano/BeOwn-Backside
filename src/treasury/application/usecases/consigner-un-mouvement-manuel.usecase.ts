import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import type { Transaction } from 'src/treasury/domain/aggregates/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  type TransactionType,
} from 'src/treasury/domain/enums/wallet.enum';
import { Money } from 'src/treasury/domain/value-objects/money.vo';

export interface ConsignerUnMouvementManuelCommand {
  montant: Money;
  type: TransactionType;
  walletSourceId?: string;
  walletDestinationId?: string;
  fournisseur?: TransactionFournisseur;
  idempotencyKey?: string;
  projetId?: string;
  investissementId?: string;
}

/**
 * Inscrit un mouvement au registre à la main, sans toucher à aucun solde.
 *
 * **Ce que cette écriture n'est pas.** Elle ne déplace pas d'argent : les deux
 * seules opérations qui le font sont `consignerUnCredit` et `consignerUnDebit`,
 * et elles vivent dans le registre parce que l'écriture comptable et l'effet
 * sur le solde y sont indissociables. Ici, on consigne une ligne — le
 * rapprochement d'un virement reçu hors plateforme, la trace d'une régularisation
 * décidée par la finance. Le mouvement naît `INITIE` pour cette raison : rien
 * n'a eu lieu que sa consignation.
 *
 * **Elle reste ouverte au back-office seul** (`platform:wallet`), et c'est le
 * minimum : une route qui écrit au registre sans intention métier nommée est
 * un outil d'exploitation, pas une capacité du produit. Le §38.4 s'en méfie à
 * juste titre — une commande doit porter une intention claire, et « créer une
 * transaction » n'en est pas une.
 *
 * Elle est conservée telle quelle parce qu'elle existe et qu'un refactoring ne
 * supprime pas une route. Le jour où l'on saura quels gestes métier elle sert
 * réellement — régularisation, rapprochement, écriture d'ouverture — ils
 * mériteront chacun leur commande, et celle-ci disparaîtra.
 */
@Injectable()
export class ConsignerUnMouvementManuelUseCase {
  private readonly logger = new Logger(ConsignerUnMouvementManuelUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
  ) {}

  async execute(
    commande: ConsignerUnMouvementManuelCommand,
  ): Promise<Transaction> {
    const mouvement = await this.registre.enregistrer({
      // Les deux colonnes de rattachement sont remplies ensemble : la table en
      // porte deux pour le même lien, et n'en remplir qu'une rendrait le
      // mouvement invisible à la moitié des lectures (voir
      // `TransactionSnapshot`).
      walletSource: commande.walletSourceId ?? null,
      walletId: commande.walletSourceId ?? null,
      walletDestination: commande.walletDestinationId ?? null,
      montant: commande.montant.montant,
      devise: commande.montant.devise,
      type: commande.type,
      referenceExterne: null,
      fournisseur: commande.fournisseur ?? TransactionFournisseur.STRIPE,
      fournisseurRef: null,
      // Aucun fonds n'a bougé : le mouvement est inscrit, pas réglé.
      statut: TransactionStatus.INITIE,
      investissementId: commande.investissementId ?? null,
      echeanceId: null,
      reservationId: null,
      projetId: commande.projetId ?? null,
      idempotencyKey: commande.idempotencyKey ?? null,
      fraisPsp: 0,
      fraisPlateforme: 0,
      metadata: null,
      motifEchec: null,
    });

    // Une écriture manuelle au registre laisse une trace : c'est le genre de
    // ligne qu'un rapprochement comptable cherche à expliquer six mois plus tard.
    this.logger.log(
      `Mouvement consigné à la main : tx=${mouvement.id} type=${commande.type} ` +
        `montant=${commande.montant.toString()}`,
    );

    return mouvement;
  }
}
