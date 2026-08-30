import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import {
  WalletStatut,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';

/**
 * Les montages partagés par les trois lectures de portefeuille.
 *
 * Ils vivaient dans la spec du use case unique ; celui-ci ayant été découpé en
 * trois, les recopier aurait laissé les fixtures diverger — la façon la plus
 * discrète de rendre trois tests incomparables.
 */

export const TITULAIRE = 42;
export const UN_AUTRE = 7;

export const portefeuille = (proprietaireUserId: number | null = TITULAIRE) =>
  new Wallet({
    id: 'w-1',
    type:
      proprietaireUserId === null
        ? WalletType.FRAIS_PLATEFORME
        : WalletType.INVESTISSEUR,
    proprietaireUserId,
    projetId: null,
    spvId: null,
    fournisseurRef: 'INV-42-auto',
    devise: 'EUR',
    solde: 500,
    statut: WalletStatut.ACTIF,
    createdAt: new Date('2026-01-01'),
  });

export const titulaire = {
  utilisateurId: TITULAIRE,
  peutGererLesPortefeuilles: false,
};

export const tiers = {
  utilisateurId: UN_AUTRE,
  peutGererLesPortefeuilles: false,
};

export const backOffice = {
  utilisateurId: 99,
  peutGererLesPortefeuilles: true,
};
