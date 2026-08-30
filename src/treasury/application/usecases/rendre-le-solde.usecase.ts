import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import { TransactionStatus } from 'src/treasury/domain/enums/wallet.enum';
import type { Money } from 'src/treasury/domain/value-objects/money.vo';
import { RetraitEchoueDomainEvent } from 'src/treasury/domain/events/retrait.domain-event';

export interface RendreLeSoldeCommand {
  transactionId: string;
  motif: string;
  /** `ECHOUE` quand le versement a échoué, `REMBOURSE` quand on renonce. */
  statutFinal: TransactionStatus;
}

/**
 * Rend au titulaire le solde d'un retrait qui n'a pas abouti.
 *
 * **Le seul chemin de recrédit du contexte**, et il est appelé de deux endroits
 * qui peuvent se croiser : l'échec synchrone du transfert, et le webhook
 * `payout.failed`. Les deux survenant pour le même retrait rendraient le solde
 * deux fois si rien ne s'y opposait.
 *
 * Ce qui s'y oppose n'est pas une relecture préalable — elle laisserait la
 * fenêtre ouverte entre la lecture et l'écriture — mais la **décision du
 * domaine rejouée sous verrou** : `Transaction.recrediter()` refuse un
 * mouvement déjà défait ou déjà terminal, et le port ne rend le solde que si
 * elle a dit oui. Cette garde était recopiée chez chaque appelant, en trois
 * listes de conditions légèrement différentes.
 *
 * Le fait est publié **ici**, et une seule fois : l'annonce était postée par
 * les appelants, qui devaient donc savoir eux-mêmes si le recrédit avait
 * réellement eu lieu — et l'un d'eux, en cas de rejeu, notifiait un
 * remboursement déjà annoncé. Qui l'apprend appartient à l'abonné (§38.3).
 */
@Injectable()
export class RendreLeSoldeUseCase {
  private readonly logger = new Logger(RendreLeSoldeUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    commande: RendreLeSoldeCommand,
  ): Promise<'rendu' | 'sans-objet'> {
    // Titulaire et montant sont saisis pendant que le verrou est tenu : les
    // relire après reviendrait à annoncer un état qui a pu bouger entre-temps.
    let aPrevenir: { utilisateurId: number; montant: Money } | null = null;

    const issue = await this.registre.rendreLeSolde(
      commande.transactionId,
      (mouvement) => {
        // Un mouvement qui n'est pas un retrait n'a rien à rendre : le rendre
        // crédierait un dépôt une seconde fois.
        if (!mouvement.estUnRetrait()) return false;

        const defait = mouvement.recrediter(
          commande.motif,
          commande.statutFinal,
        );
        if (defait && mouvement.titulaireId !== null) {
          aPrevenir = {
            utilisateurId: mouvement.titulaireId,
            montant: mouvement.montant,
          };
        }
        return defait;
      },
    );

    if (issue === 'sans-objet') {
      this.logger.debug(
        `Retrait déjà défait, introuvable, ou non retrait — no-op : tx=${commande.transactionId}`,
      );
      return issue;
    }

    this.logger.log(`Retrait recrédité : tx=${commande.transactionId}`);

    if (aPrevenir) {
      const fait = aPrevenir as { utilisateurId: number; montant: Money };
      // Publié **après** le recrédit : annoncer un remboursement qui n'a pas
      // eu lieu serait pire que ne rien annoncer.
      this.eventBus.publish(
        new RetraitEchoueDomainEvent(
          fait.utilisateurId,
          commande.transactionId,
          fait.montant,
        ),
      );
    }

    return issue;
  }
}
