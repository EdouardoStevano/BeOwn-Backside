import { Inject, Injectable } from '@nestjs/common';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';
import type { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { WalletIntrouvableError } from 'src/treasury/domain/errors/treasury.errors';
import {
  PortefeuilleLisibleSpecification,
  type DemandeurDePortefeuille,
} from 'src/treasury/domain/specifications/portefeuille-lisible.specification';

/**
 * Consulter un portefeuille désigné par son identité.
 *
 * Une seule intention, un seul use case. Il partageait auparavant sa classe
 * avec la lecture par titulaire et le relevé des mouvements, au motif que les
 * trois appliquaient la même garde — mais ce qui les liait était **la règle**,
 * pas leur intention. La règle nommée
 * ({@link PortefeuilleLisibleSpecification}), elles n'ont plus de raison de
 * rester ensemble.
 */
@Injectable()
export class ConsulterUnPortefeuilleUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
  ) {}

  async execute(
    walletId: string,
    demandeur: DemandeurDePortefeuille,
  ): Promise<Wallet> {
    const portefeuille = await this.wallets.findById(walletId);
    if (!portefeuille) throw new WalletIntrouvableError(walletId);

    new PortefeuilleLisibleSpecification(demandeur).eprouver(portefeuille);
    return portefeuille;
  }
}
