import { Inject, Injectable } from '@nestjs/common';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';
import type { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { WalletFactory } from 'src/treasury/domain/factories/wallet.factory';
import type { WalletType } from 'src/treasury/domain/enums/wallet.enum';

export interface OuvrirUnPortefeuilleDePlateformeCommand {
  type: WalletType;
  /** Ce qui identifie le portefeuille en comptabilité, côté fournisseur. */
  fournisseurRef: string;
  devise?: string;
}

/**
 * Ouvre un portefeuille de la structure : frais, taxes, séquestres fiscaux,
 * portefeuille technique d'un projet ou d'un SPV.
 *
 * Mince, et c'est normal : la règle qui compte — un portefeuille de plateforme
 * n'a pas de titulaire, et un portefeuille d'investisseur ne s'ouvre pas sans
 * lui — vit dans {@link WalletFactory}, où elle est éprouvable sans base de
 * données. Ce que ce use case ajoute, c'est de retirer le dernier accès direct
 * au repository depuis la couche de présentation (§14, §27).
 *
 * L'ouverture du portefeuille d'un **investisseur** n'est pas ici : elle
 * n'existe pas comme geste isolé. Un portefeuille d'investisseur naît de sa
 * première consultation ou de son premier dépôt — voir
 * `ConsulterUnPortefeuilleUseCase.parTitulaire` et `CrediterUnDepotUseCase`.
 */
@Injectable()
export class OuvrirUnPortefeuilleDePlateformeUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
  ) {}

  execute(commande: OuvrirUnPortefeuilleDePlateformeCommand): Promise<Wallet> {
    return this.wallets.creer(
      WalletFactory.ouvrirPourPlateforme(
        commande.type,
        commande.fournisseurRef,
        commande.devise,
      ),
    );
  }
}
