import { WalletFactory } from './wallet.factory';
import { WalletStatut, WalletType } from '../enums/wallet.enum';
import { TitulariteWalletIncoherenteError } from '../errors/treasury.errors';

describe('WalletFactory — portefeuille d’investisseur', () => {
  it('ouvre un portefeuille actif, à zéro, au nom de son titulaire', () => {
    expect(WalletFactory.ouvrirPourInvestisseur(42)).toEqual({
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: 42,
      projetId: null,
      spvId: null,
      fournisseurRef: 'INV-42-auto',
      devise: 'EUR',
      solde: 0,
      statut: WalletStatut.ACTIF,
    });
  });

  it('accepte une devise explicite', () => {
    expect(WalletFactory.ouvrirPourInvestisseur(42, 'USD').devise).toBe('USD');
  });

  it.each([0, -1, 1.5])(
    'refuse un titulaire invalide (%p)',
    (utilisateurId) => {
      expect(() => WalletFactory.ouvrirPourInvestisseur(utilisateurId)).toThrow(
        TitulariteWalletIncoherenteError,
      );
    },
  );
});

describe('WalletFactory — portefeuille de plateforme', () => {
  it('ouvre un portefeuille sans titulaire, identifié par sa référence', () => {
    expect(
      WalletFactory.ouvrirPourPlateforme(
        WalletType.SEQUESTRE_IR,
        'SEQUESTRE-IR',
      ),
    ).toEqual({
      type: WalletType.SEQUESTRE_IR,
      proprietaireUserId: null,
      projetId: null,
      spvId: null,
      fournisseurRef: 'SEQUESTRE-IR',
      devise: 'EUR',
      solde: 0,
      statut: WalletStatut.ACTIF,
    });
  });

  it('refuse d’ouvrir un portefeuille d’investisseur sans titulaire', () => {
    expect(() =>
      WalletFactory.ouvrirPourPlateforme(
        WalletType.INVESTISSEUR,
        'INV-orphelin',
      ),
    ).toThrow(TitulariteWalletIncoherenteError);
  });
});
