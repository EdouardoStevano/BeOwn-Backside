import { Wallet, type WalletSnapshot } from './wallet';
import { WalletStatut, WalletType } from '../enums/wallet.enum';
import { Money } from '../value-objects/money.vo';
import {
  DeviseIncoherenteError,
  MontantDeMouvementInvalideError,
  MontantInvalideError,
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

const eur = (montant: number) => Money.euros(montant);

describe('Wallet — débit', () => {
  it('entame le solde du montant débité', () => {
    const wallet = portefeuille();

    wallet.debiter(eur(300));

    expect(wallet.solde).toBe(700);
  });

  it('refuse un débit que le solde ne couvre pas — l’invariant central', () => {
    const wallet = portefeuille({ solde: 250 });

    expect(() => wallet.debiter(eur(300))).toThrow(SoldeInsuffisantError);
    expect(wallet.solde).toBe(250);
  });

  it('accepte un débit qui vide exactement le portefeuille', () => {
    const wallet = portefeuille({ solde: 300 });

    wallet.debiter(eur(300));

    expect(wallet.solde).toBe(0);
  });

  it('ne laisse jamais le solde passer sous zéro, même à un centime près', () => {
    const wallet = portefeuille({ solde: 299.99 });

    expect(() => wallet.debiter(eur(300))).toThrow(SoldeInsuffisantError);
  });
});

describe('Wallet — crédit', () => {
  it('alimente le solde du montant crédité', () => {
    const wallet = portefeuille();

    wallet.crediter(eur(250.5));

    expect(wallet.solde).toBe(1_250.5);
  });

  it('reste juste au centime après une suite de mouvements', () => {
    // `0.1 + 0.2` ne fait pas `0.3` en flottant, et l'écart s'accumule. Le
    // montant est arrondi au centime à chaque construction, comme la colonne
    // `decimal(18,2)` qui le range.
    const wallet = portefeuille({ solde: 0 });

    wallet.crediter(eur(0.1));
    wallet.crediter(eur(0.2));

    expect(wallet.solde).toBe(0.3);
  });
});

describe('Wallet — portes communes à tout mouvement', () => {
  it('refuse un mouvement nul : créditer zéro n’est pas un mouvement', () => {
    const wallet = portefeuille();

    expect(() => wallet.crediter(eur(0))).toThrow(
      MontantDeMouvementInvalideError,
    );
    expect(() => wallet.debiter(eur(0))).toThrow(
      MontantDeMouvementInvalideError,
    );
    expect(wallet.solde).toBe(1_000);
  });

  it.each([-100, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse une somme qui n’en est pas une (%p) dès sa construction',
    (montant) => {
      // Le montant négatif ne parvient plus jusqu'au portefeuille : il est
      // inexprimable. C'est ce que le Value Object gagne sur le `number` — la
      // vérification ne peut plus être oubliée par un appelant.
      expect(() => Money.euros(montant)).toThrow(MontantInvalideError);
    },
  );

  it('refuse tout mouvement sur un portefeuille gelé', () => {
    const wallet = portefeuille({ statut: WalletStatut.GELE });

    expect(() => wallet.crediter(eur(100))).toThrow(WalletGeleError);
    expect(() => wallet.debiter(eur(100))).toThrow(WalletGeleError);
    expect(wallet.solde).toBe(1_000);
  });

  it('refuse un mouvement dans une autre devise que celle du portefeuille', () => {
    // La devise n'est plus un paramètre facultatif qu'on pouvait omettre pour
    // se dispenser du contrôle : elle voyage avec le montant.
    const wallet = portefeuille({ devise: 'EUR' });

    expect(() => wallet.debiter(Money.of(100, 'USD'))).toThrow(
      DeviseIncoherenteError,
    );
    expect(() => wallet.crediter(Money.of(100, 'USD'))).toThrow(
      DeviseIncoherenteError,
    );
    expect(wallet.solde).toBe(1_000);
  });

  it('accepte un mouvement dans la devise du portefeuille', () => {
    const wallet = portefeuille({ devise: 'EUR' });

    wallet.debiter(Money.of(100, 'EUR'));

    expect(wallet.solde).toBe(900);
  });
});

describe('Wallet — interrogations', () => {
  it('dit si le solde couvre un montant, sans rien modifier', () => {
    const wallet = portefeuille({ solde: 500 });

    expect(wallet.couvre(eur(500))).toBe(true);
    expect(wallet.couvre(eur(500.01))).toBe(false);
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
    wallet.debiter(eur(400));

    expect(wallet.snapshot()).toMatchObject({
      id: 'w-1',
      solde: 600,
      devise: 'EUR',
      statut: WalletStatut.ACTIF,
    });
  });

  it('se sérialise en JSON public, sans ses clés privées', () => {
    // `GET /users/me` publie le portefeuille sans appeler `snapshot()` : sans
    // ce point d'accroche, il ressortait avec `_solde`, `_statut` et `_entete`.
    const wallet = portefeuille();

    const publie = JSON.parse(JSON.stringify(wallet)) as Record<
      string,
      unknown
    >;

    expect(publie).toMatchObject({ id: 'w-1', solde: 1_000, devise: 'EUR' });
    expect(publie._solde).toBeUndefined();
    expect(publie._entete).toBeUndefined();
  });
});
