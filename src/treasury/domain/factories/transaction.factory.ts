import { randomUUID } from 'node:crypto';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';
import type {
  MetadonneesMouvement,
  TransactionNaissante,
} from '../aggregates/transaction';
import { Money } from '../value-objects/money.vo';

/**
 * Les clés d'idempotence du registre, écrites **une fois**.
 *
 * Elles étaient composées à la main là où on en avait besoin —
 * `` `depot:${paymentIntentId}` `` dans le contrôleur, deux variantes de
 * `` `retrait:${userId}:${clé}` `` dans le use case, une troisième pour la
 * relecture. Une clé qui diverge d'un caractère entre l'écriture et la
 * relecture, c'est l'idempotence qui ne protège plus rien : le doublon passe,
 * et l'argent bouge deux fois.
 *
 * Elles vivent donc dans le domaine, à côté de ce qu'elles identifient, et
 * chaque parcours les demande au lieu de les fabriquer.
 */
export const CleDIdempotence = {
  /** Un dépôt est identifié par son paiement : un `PaymentIntent`, un crédit. */
  depot: (paymentIntentId: string): string => `depot:${paymentIntentId}`,

  /**
   * Un retrait est identifié par la clé que le client fournit, **portée par
   * son titulaire** : deux investisseurs peuvent envoyer la même clé sans que
   * l'un rejoue le retrait de l'autre.
   *
   * Sans clé cliente, un identifiant tiré au sort — la demande n'est alors
   * protégée que par le débit conditionnel, et deux soumissions font deux
   * retraits. C'est le comportement d'origine, conservé : l'imposer relèverait
   * du contrat d'API, pas du refactoring.
   */
  retrait: (utilisateurId: number, cleCliente?: string): string =>
    `retrait:${utilisateurId}:${cleCliente ?? randomUUID()}`,
} as const;

/** Ce qu'un dépôt a besoin de savoir pour entrer au registre. */
export interface DepotAConsigner {
  walletId: string;
  montant: Money;
  paymentIntentId: string;
  utilisateurId: number;
}

/** Ce qu'un retrait a besoin de savoir pour entrer au registre. */
export interface RetraitAConsigner {
  walletId: string;
  montant: Money;
  utilisateurId: number;
  /** `EN_COURS` pour un versement déjà lancé, `EN_ATTENTE_PAIEMENT` pour le manuel. */
  statutInitial: TransactionStatus;
  cleCliente?: string;
  /** L'IBAN du parcours de secours ; absent quand Stripe détient les coordonnées. */
  ibanDestination?: string | null;
  metadata?: MetadonneesMouvement;
}

/**
 * Fait naître les mouvements de fonds des parcours de paiement.
 *
 * Une Factory au sens du §23, et non un `new` déguisé : ce qu'elle encapsule,
 * c'est la **composition de la clé d'idempotence** et le choix des colonnes de
 * rattachement — deux décisions qui protègent de l'écriture en double et qui
 * étaient jusqu'ici recopiées, à peine différemment, dans le contrôleur et
 * dans le use case de retrait.
 *
 * Elle rend des `TransactionNaissante` et non des agrégats : l'identité et les
 * dates naissent en base, comme pour `WalletFactory` et pour les autres
 * contextes.
 */
export class TransactionFactory {
  /**
   * Un dépôt : l'argent entre depuis l'extérieur vers le portefeuille du
   * titulaire.
   *
   * `fournisseurRef` porte le `PaymentIntent` — c'est par lui que Stripe
   * désigne ce paiement, et par lui qu'un rapprochement le retrouve.
   */
  static depot(depot: DepotAConsigner): TransactionNaissante {
    return {
      ...TransactionFactory.socle(depot.montant),
      walletId: depot.walletId,
      type: TransactionType.DEPOT,
      statut: TransactionStatus.REUSSI,
      fournisseurRef: depot.paymentIntentId,
      idempotencyKey: CleDIdempotence.depot(depot.paymentIntentId),
      metadata: { userId: depot.utilisateurId },
    };
  }

  /**
   * Un retrait : l'argent quitte le portefeuille du titulaire vers sa banque.
   *
   * Il naît `EN_COURS` ou `EN_ATTENTE_PAIEMENT` selon le rail, jamais `REUSSI` :
   * le versement n'est acquis qu'au `payout.paid`, et le déclarer abouti au
   * départ ferait croire à un virement arrivé alors qu'il vient de partir.
   */
  static retrait(retrait: RetraitAConsigner): TransactionNaissante {
    return {
      ...TransactionFactory.socle(retrait.montant),
      walletId: retrait.walletId,
      type: TransactionType.RETRAIT,
      statut: retrait.statutInitial,
      fournisseurRef: retrait.ibanDestination ?? null,
      idempotencyKey: CleDIdempotence.retrait(
        retrait.utilisateurId,
        retrait.cleCliente,
      ),
      metadata: { userId: retrait.utilisateurId, ...retrait.metadata },
    };
  }

  /**
   * Ce que tout mouvement porte de la même façon.
   *
   * Les colonnes de rattachement métier — investissement, échéance,
   * réservation, projet — restent nulles : un dépôt et un retrait ne se
   * rapportent qu'à leur titulaire. Elles sont renseignées par les contextes
   * qui, eux, ont un investissement ou une échéance à désigner.
   */
  private static socle(
    montant: Money,
  ): Omit<
    TransactionNaissante,
    | 'walletId'
    | 'type'
    | 'statut'
    | 'fournisseurRef'
    | 'idempotencyKey'
    | 'metadata'
  > {
    return {
      walletSource: null,
      walletDestination: null,
      montant: montant.montant,
      devise: montant.devise,
      referenceExterne: null,
      fournisseur: TransactionFournisseur.STRIPE,
      investissementId: null,
      echeanceId: null,
      reservationId: null,
      projetId: null,
      fraisPsp: 0,
      fraisPlateforme: 0,
      motifEchec: null,
    };
  }
}
