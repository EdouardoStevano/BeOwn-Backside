import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import type { TransactionSnapshot } from 'src/treasury/domain/aggregates/transaction';
import type { DemandeurDePortefeuille } from 'src/treasury/domain/specifications/portefeuille-lisible.specification';
import { ConsulterUnPortefeuilleUseCase } from './consulter-un-portefeuille.usecase';

/**
 * Le relevé d'un portefeuille : les mouvements qui l'ont traversé, du plus
 * récent au plus ancien.
 *
 * **La garde est celle de la lecture du portefeuille lui-même**, et elle est
 * obtenue en la lui demandant plutôt qu'en la recopiant : un relevé révèle au
 * moins autant qu'un solde — les montants, les dates, les contreparties — et ne
 * peut donc pas être plus ouvert. Déléguer garantit que les deux ne pourront
 * jamais diverger.
 *
 * C'est la seule dépendance entre les trois lectures issues du découpage, et
 * elle va dans le bon sens : le relevé a besoin du portefeuille, l'inverse
 * n'est pas vrai.
 */
@Injectable()
export class ListerLesMouvementsDunPortefeuilleUseCase {
  constructor(
    private readonly consulterLePortefeuille: ConsulterUnPortefeuilleUseCase,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly registre: TransactionRepository,
  ) {}

  async execute(
    walletId: string,
    demandeur: DemandeurDePortefeuille,
  ): Promise<TransactionSnapshot[]> {
    // Charge le portefeuille **et** éprouve la règle : un relevé n'est servi
    // que sur un portefeuille que le demandeur aurait le droit de consulter.
    await this.consulterLePortefeuille.execute(walletId, demandeur);

    const mouvements = await this.registre.findByWallet(walletId);
    return mouvements.map((mouvement) => mouvement.snapshot());
  }
}
