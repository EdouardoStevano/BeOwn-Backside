import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import { TransactionStatus } from 'src/treasury/domain/enums/wallet.enum';
import type { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { CONNECT_GATEWAY, type ConnectGateway } from '../ports/connect.gateway';
import {
  RetraitEnSouffranceDomainEvent,
  RetraitVerseDomainEvent,
} from 'src/treasury/domain/events/retrait.domain-event';
import { RendreLeSoldeUseCase } from './rendre-le-solde.usecase';

/** Ce qu'est devenu le retrait au vu du sort du versement. */
export type IssueDuReglement =
  | { issue: 'verse' }
  | { issue: 'solde-rendu' }
  /** Les fonds n'ont pas pu être ramenés : un humain doit reprendre le dossier. */
  | { issue: 'rapatriement-impossible' }
  | { issue: 'sans-objet' };

/**
 * Ce qu'on fait d'un retrait quand on apprend le sort de son versement.
 *
 * **Deux sources, un seul jeu de transitions.** Le fournisseur annonce
 * `payout.paid` / `payout.failed` par webhook ; la réconciliation va lire
 * l'état du versement quand l'annonce n'arrive pas. Les deux aboutissent ici —
 * et il n'était pas envisageable de les écrire deux fois : ce sont les gestes
 * qui décident si de l'argent est acquis au titulaire ou lui est rendu, et
 * deux implémentations finiraient par diverger sur l'ordre du rapatriement.
 *
 * Ce use case est **sans état et sans garde propre** : les gardes vivent dans
 * l'agrégat (`Transaction.reussir`, `Transaction.recrediter`), qui refuse de
 * trancher deux fois un même mouvement.
 */
@Injectable()
export class ReglerUnRetraitUseCase {
  private readonly logger = new Logger(ReglerUnRetraitUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
    @Inject(CONNECT_GATEWAY)
    private readonly connect: ConnectGateway,
    private readonly eventBus: EventBus,
    private readonly rendreLeSolde: RendreLeSoldeUseCase,
  ) {}

  /**
   * Le versement est arrivé en banque : le retrait est acquis.
   *
   * `Transaction.reussir()` refuse de finaliser un mouvement déjà tranché — un
   * `payout.paid` redélivré après un `payout.failed` qui a rendu le solde
   * reviendrait sinon à verser deux fois.
   */
  async verse(
    retrait: Transaction,
    versementId: string | null,
  ): Promise<IssueDuReglement> {
    if (!retrait.reussir()) return { issue: 'sans-objet' };

    await this.registre.save(retrait);
    this.logger.log(
      `Retrait finalisé : tx=${retrait.id} payout=${versementId ?? 'inconnu'}`,
    );

    if (retrait.titulaireId !== null) {
      this.eventBus.publish(
        new RetraitVerseDomainEvent(
          retrait.titulaireId,
          retrait.id,
          retrait.montant,
        ),
      );
    }
    return { issue: 'verse' };
  }

  /**
   * Le versement a échoué : les fonds sont revenus sur le compte connecté.
   *
   * **Rapatrier avant de recréditer**, jamais l'inverse. Les fonds sont encore
   * chez le fournisseur ; rendre le solde sans les avoir ramenés les ferait
   * exister aux deux endroits. Si le rapatriement n'aboutit pas, on ne
   * recrédite **pas** à l'aveugle : un humain reprend le dossier.
   */
  async echoue(
    retrait: Transaction,
    versementId: string | null,
  ): Promise<IssueDuReglement> {
    if (retrait.aEteRecreditee()) {
      this.logger.debug(
        `Retrait déjà recrédité (idempotent) : tx=${retrait.id}`,
      );
      return { issue: 'sans-objet' };
    }

    const transfertId = retrait.transfertId;
    if (
      transfertId &&
      !(await this.rapatrier(retrait, transfertId, versementId))
    ) {
      return { issue: 'rapatriement-impossible' };
    }

    const rendu = await this.rendreLeSolde.execute({
      transactionId: retrait.id,
      motif: `Payout Stripe échoué (payout=${versementId ?? 'inconnu'})`,
      statutFinal: TransactionStatus.ECHOUE,
    });

    return rendu === 'rendu'
      ? { issue: 'solde-rendu' }
      : { issue: 'sans-objet' };
  }

  /** @returns `false` si les fonds n'ont pas pu être ramenés. */
  private async rapatrier(
    retrait: Transaction,
    transfertId: string,
    versementId: string | null,
  ): Promise<boolean> {
    try {
      await this.connect.rapatrierLeTransfert(
        transfertId,
        `retrait-reverse:${retrait.id}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Rapatriement du transfert échoué tx=${retrait.id} ` +
          `transfer=${transfertId}: ${message(err)}`,
      );
      this.eventBus.publish(
        new RetraitEnSouffranceDomainEvent(
          'Retrait — rapatriement échoué, revue manuelle',
          `Le versement du retrait ${retrait.id} a échoué mais le rapatriement du ` +
            `transfert n'a pas abouti. Vérifier l'état Stripe avant tout recrédit manuel.`,
          {
            transactionId: retrait.id,
            transferId: transfertId,
            payoutId: versementId,
          },
        ),
      );
      return false;
    }
  }
}

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'inconnu';
