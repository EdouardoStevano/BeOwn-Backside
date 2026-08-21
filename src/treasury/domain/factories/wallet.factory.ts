import type { WalletNaissant } from '../aggregates/wallet';
import { WalletStatut, WalletType } from '../enums/wallet.enum';
import { TitulariteWalletIncoherenteError } from '../errors/treasury.errors';

/** Devise par défaut de la plateforme. */
export const DEVISE_PAR_DEFAUT = 'EUR';

/**
 * **Ouverture d'un portefeuille** (§23) : le seul endroit où un solde peut
 * naître.
 *
 * Deux natures de portefeuille, deux méthodes de fabrication (§36.1) — parce
 * qu'elles n'ont pas la même règle de titularité, et que c'est précisément ce
 * qui les distingue :
 *
 * - un portefeuille **d'investisseur** a un titulaire, et le solde qu'il porte
 *   lui est dû ;
 * - un portefeuille **de plateforme** (frais, taxes, séquestres, SPV) n'en a
 *   pas : il appartient à la structure, et sa référence fournisseur est ce qui
 *   l'identifie en comptabilité.
 *
 * Ces deux ouvertures vivaient dans `WalletController`, en deux blocs de dix
 * affectations de champs — dont un `statut = 'actif'` en chaîne littérale et un
 * `fournisseurRef` construit à la main. Un portefeuille ne naît jamais à
 * moitié : il naît actif, à zéro, dans une devise, avec une titularité
 * cohérente.
 */
export class WalletFactory {
  /**
   * Le portefeuille d'un investisseur, ouvert à la volée la première fois
   * qu'il consulte le sien.
   */
  static ouvrirPourInvestisseur(
    utilisateurId: number,
    devise: string = DEVISE_PAR_DEFAUT,
  ): WalletNaissant {
    if (!Number.isInteger(utilisateurId) || utilisateurId <= 0) {
      throw new TitulariteWalletIncoherenteError(
        'un portefeuille d’investisseur exige un titulaire',
        { utilisateurId },
      );
    }

    return {
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: utilisateurId,
      projetId: null,
      spvId: null,
      fournisseurRef: `INV-${utilisateurId}-auto`,
      devise,
      solde: 0,
      statut: WalletStatut.ACTIF,
    };
  }

  /**
   * Un portefeuille de la structure : frais de plateforme, taxes, séquestres
   * fiscaux, portefeuille technique d'un projet ou d'un SPV.
   */
  static ouvrirPourPlateforme(
    type: WalletType,
    fournisseurRef: string,
    devise: string = DEVISE_PAR_DEFAUT,
  ): WalletNaissant {
    if (type === WalletType.INVESTISSEUR) {
      throw new TitulariteWalletIncoherenteError(
        'un portefeuille d’investisseur ne s’ouvre pas sans titulaire',
        { type },
      );
    }

    return {
      type,
      proprietaireUserId: null,
      projetId: null,
      spvId: null,
      fournisseurRef,
      devise,
      solde: 0,
      statut: WalletStatut.ACTIF,
    };
  }
}
