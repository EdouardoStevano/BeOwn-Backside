import { Wallet, type WalletSnapshot } from './wallet';
import { WalletStatut, WalletType } from '../enums/wallet.enum';
import {
  DeviseIncoherenteError,
  MontantDeMouvementInvalideError,
  SoldeInsuffisantError,
  WalletGeleError,
} from '../errors/treasury.errors';

const TITULAIRE = 42;

const portefeuille = (etat: Partial<WalletSnapshot> = {}): Wallet =>
  new Wallet({
    id: 'w-1',
    type: WalletType.INVESTISSEUR,
    proprietaireUserId: TITULAIRE,
    projetId: null,
    spvId: null,
    fournisseurRef: 'INV-42-auto',
    devise: 'EUR',
    solde: 1_000,
    statut: WalletStatut.ACTIF,
    createdAt: new Date('2026-01-01'),
    ...etat,
  });

describe('Wallet — débit', () => {
  it('entame le solde du montant débité', () => {
    const wallet = portefeuille();

    wallet.debiter(300);

    expect(wallet.solde).toBe(700);
  });

  it('refuse un débit que le solde ne couvre pas — l’invariant central', () => {
    const wallet = portefeuille({ solde: 250 });

    expect(() => wallet.debiter(300)).toThrow(SoldeInsuffisantError);
    expect(wallet.solde).toBe(250);
  });

  it('accepte un débit qui vide exactement le portefeuille', () => {
    const wallet = portefeuille({ solde: 300 });

    wallet.debiter(300);

    expect(wallet.solde).toBe(0);
  });

  it('ne laisse jamais le solde passer sous zéro, même à un centime près', () => {
    const wallet = portefeuille({ solde: 299.99 });

    expect(() => wallet.debiter(300)).toThrow(SoldeInsuffisantError);
  });
});

describe('Wallet — crédit', () => {
  it('alimente le solde du montant crédité', () => {
    const wallet = portefeuille();

    wallet.crediter(250.5);

    expect(wallet.solde).toBe(1_250.5);
  });
});

describe('Wallet — portes communes à tout mouvement', () => {
  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse un montant invalide (%p)',
    (montant) => {
      const wallet = portefeuille();

      expect(() => wallet.crediter(montant)).toThrow(
        MontantDeMouvementInvalideError,
      );
      expect(() => wallet.debiter(montant)).toThrow(
        MontantDeMouvementInvalideError,
      );
      expect(wallet.solde).toBe(1_000);
    },
  );

  it('refuse tout mouvement sur un portefeuille gelé', () => {
    const wallet = portefeuille({ statut: WalletStatut.GELE });

    expect(() => wallet.crediter(100)).toThrow(WalletGeleError);
    expect(() => wallet.debiter(100)).toThrow(WalletGeleError);
    expect(wallet.solde).toBe(1_000);
  });

  it('refuse un mouvement dans une autre devise que celle du portefeuille', () => {
    const wallet = portefeuille({ devise: 'EUR' });

    expect(() => wallet.debiter(100, 'USD')).toThrow(DeviseIncoherenteError);
    expect(wallet.solde).toBe(1_000);
  });

  it('accepte un mouvement dans la devise du portefeuille', () => {
    const wallet = portefeuille({ devise: 'EUR' });

    wallet.debiter(100, 'EUR');

    expect(wallet.solde).toBe(900);
  });
});

describe('Wallet — interrogations', () => {
  it('dit si le solde couvre un montant, sans rien modifier', () => {
    const wallet = portefeuille({ solde: 500 });

    expect(wallet.couvre(500)).toBe(true);
    expect(wallet.couvre(500.01)).toBe(false);
    expect(wallet.solde).toBe(500);
  });

  it('reconnaît son titulaire', () => {
    const wallet = portefeuille();

    expect(wallet.appartientA(TITULAIRE)).toBe(true);
    expect(wallet.appartientA(7)).toBe(false);
  });

  it('un portefeuille de plateforme n’appartient à personne', () => {
    const wallet = portefeuille({
      type: WalletType.FRAIS_PLATEFORME,
      proprietaireUserId: null,
    });

    expect(wallet.appartientA(TITULAIRE)).toBe(false);
  });

  it('rend un snapshot qui reflète les mouvements joués', () => {
    const wallet = portefeuille();
    wallet.debiter(400);

    expect(wallet.snapshot()).toMatchObject({
      id: 'w-1',
      solde: 600,
      devise: 'EUR',
      statut: WalletStatut.ACTIF,
    });
  });
});
