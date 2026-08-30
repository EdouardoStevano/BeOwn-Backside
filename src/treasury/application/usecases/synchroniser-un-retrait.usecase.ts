import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import { RetraitIntrouvableError } from 'src/treasury/domain/errors/treasury.errors';
import {
  CONNECT_GATEWAY,
  type ConnectGateway,
  type EtatDuVersement,
} from '../ports/connect.gateway';
import {
  ReglerUnRetraitUseCase,
  type IssueDuReglement,
} from './regler-un-retrait.usecase';

/** Ce qu'a donné la relecture du versement chez le fournisseur. */
export type IssueDeLaSynchronisation =
  /** Aucun versement explicite n'a été demandé : il n'y a rien à relire. */
  | { issue: 'aucun-versement' }
  | { issue: 'etat-lu'; etat: EtatDuVersement; suite: IssueDuReglement }
  | { issue: 'etat-lu'; etat: 'en-cours' | 'inconnu' };

/**
 * Va chercher chez le fournisseur le sort d'un versement qu'il n'a pas su nous
 * annoncer.
 *
 * **Le webhook est un envoi, celui-ci est un retrait.** Les événements
 * `payout.paid` / `payout.failed` sont poussés vers une URL publique ; quand
 * cette URL n'est pas joignable — un poste de développement derrière un NAT —
 * ou quand une livraison échoue, le retrait reste figé `EN_COURS`
 * indéfiniment. L'argent est parti, le titulaire ne sait pas s'il est arrivé,
 * et rien dans la plateforme ne peut le lui dire.
 *
 * C'est la **réconciliation** que le cahier des charges range dans M7 aux
 * côtés des mouvements de fonds (§3.2) : elle a sa place en production, pas
 * seulement sur un poste de développement.
 *
 * **Aucune décision n'est prise ici.** L'état lu est remis à
 * {@link ReglerUnRetraitUseCase}, exactement comme celui d'un webhook, et ce
 * sont les gardes de l'agrégat qui refusent de trancher deux fois. Un retrait
 * déjà versé ou déjà recrédité ne bouge donc pas, quel que soit le nombre de
 * synchronisations lancées.
 *
 * **Un versement automatique n'est pas relisible** : la plateforme n'en connaît
 * pas la référence, puisqu'elle ne l'a pas demandé. C'est la limite de ce
 * chemin, et elle est dite plutôt que dissimulée derrière une recherche
 * approximative sur le compte connecté — deviner quel versement correspond à
 * quel retrait est exactement le genre d'inférence qu'on ne fait pas sur de
 * l'argent.
 */
@Injectable()
export class SynchroniserUnRetraitUseCase {
  private readonly logger = new Logger(SynchroniserUnRetraitUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
    @Inject(CONNECT_GATEWAY)
    private readonly connect: ConnectGateway,
    private readonly regler: ReglerUnRetraitUseCase,
  ) {}

  /**
   * @param titulaireId quand il est fourni, le retrait doit lui appartenir —
   *   c'est ce qui permet d'ouvrir cette route au titulaire lui-même sans lui
   *   donner de quoi sonder les retraits des autres. Omis pour le back-office.
   * @throws RetraitIntrouvableError si le mouvement n'existe pas, n'est pas un
   *   retrait, ou n'est pas le sien. Les trois rendent la même erreur : dire
   *   « ce retrait n'est pas le vôtre » confirmerait son existence.
   */
  async execute(
    transactionId: string,
    titulaireId?: number,
  ): Promise<IssueDeLaSynchronisation> {
    const retrait = await this.registre.findById(transactionId);
    if (!retrait?.estUnRetrait()) {
      throw new RetraitIntrouvableError(transactionId);
    }
    if (titulaireId !== undefined && retrait.titulaireId !== titulaireId) {
      throw new RetraitIntrouvableError(transactionId);
    }

    const versementId = retrait.metadata.payoutId;
    const compteConnecte = retrait.metadata.connectedAccountId;
    if (!versementId || !compteConnecte) {
      this.logger.debug(
        `Réconciliation retrait : aucun versement explicite à relire tx=${transactionId}`,
      );
      return { issue: 'aucun-versement' };
    }

    const etat = await this.connect.etatDuVersement(
      versementId,
      compteConnecte,
    );
    this.logger.log(
      `Réconciliation retrait : versement « ${etat} » lu chez le fournisseur ` +
        `(tx=${transactionId}, payout=${versementId})`,
    );

    switch (etat) {
      case 'arrive':
        return {
          issue: 'etat-lu',
          etat,
          suite: await this.regler.verse(retrait, versementId),
        };
      case 'echoue':
        return {
          issue: 'etat-lu',
          etat,
          suite: await this.regler.echoue(retrait, versementId),
        };
      default:
        // Rien à décider : l'argent est encore en chemin, ou le fournisseur ne
        // reconnaît pas ce versement. Dans les deux cas, toucher au retrait
        // serait trancher sur une information qu'on n'a pas.
        return { issue: 'etat-lu', etat };
    }
  }
}
