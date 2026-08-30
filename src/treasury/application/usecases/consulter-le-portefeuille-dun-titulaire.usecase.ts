import { Inject, Injectable } from '@nestjs/common';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from 'src/treasury/domain/repositories/wallet.repository';
import type { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { WalletFactory } from 'src/treasury/domain/factories/wallet.factory';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import {
  AccesWalletRefuseError,
  WalletIntrouvableError,
} from 'src/treasury/domain/errors/treasury.errors';
import type { DemandeurDePortefeuille } from 'src/treasury/domain/specifications/portefeuille-lisible.specification';

/**
 * Le portefeuille d'investissement d'un titulaire — **ouvert s'il n'existe pas
 * encore**, et seulement pour lui-même.
 *
 * **Il ne partage pas la garde des deux autres lectures**, et c'est la raison
 * de fond pour laquelle il méritait son propre use case :
 * {@link PortefeuilleLisibleSpecification} s'éprouve sur un portefeuille
 * chargé, alors qu'ici la question se pose **avant** de savoir s'il en existe
 * un. On n'interroge pas un objet qui n'est peut-être pas né.
 *
 * La règle d'ouverture n'est pas anodine : un portefeuille est un objet
 * comptable, et le faire naître d'une simple consultation par un tiers — fût-il
 * habilité — créerait des soldes à zéro que personne n'a demandés, au gré des
 * écrans d'administration parcourus. Le titulaire, lui, ne devrait jamais se
 * voir répondre « introuvable » sur son propre solde.
 */
@Injectable()
export class ConsulterLePortefeuilleDunTitulaireUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
  ) {}

  async execute(
    titulaireId: number,
    demandeur: DemandeurDePortefeuille,
  ): Promise<Wallet> {
    const cestLeSien = demandeur.utilisateurId === titulaireId;
    if (!cestLeSien && !demandeur.peutGererLesPortefeuilles) {
      throw new AccesWalletRefuseError();
    }

    const existant = await this.wallets.findByUser(
      titulaireId,
      WalletType.INVESTISSEUR,
    );
    if (existant) return existant;

    // Seul le titulaire provoque l'ouverture ; un tiers habilité constate
    // l'absence.
    if (!cestLeSien) throw new WalletIntrouvableError();

    return this.wallets.creer(
      WalletFactory.ouvrirPourInvestisseur(titulaireId),
    );
  }
}
