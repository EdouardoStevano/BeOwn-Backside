import {
  SecondaryMarketOrder,
  type SecondaryMarketOrderSnapshot,
} from './secondary-market-order';
import { OrdreMarcheSens, OrdreMarcheStatus } from '../enums/ordre-marche.enum';
import {
  AchatDeSonPropreOrdreError,
  AnnulationReserveeAuVendeurError,
  OrdreDeVenteInvalideError,
  OrdreIndisponibleError,
  OrdreNonAnnulableError,
  QuantiteAcheteeInvalideError,
} from '../errors';

const VENDEUR = 7;
const ACHETEUR = 42;

const ordre = (etat: Partial<SecondaryMarketOrderSnapshot> = {}) =>
  new SecondaryMarketOrder({
    id: 'ord-1',
    investissementId: 'inv-1',
    vendeurId: VENDEUR,
    acheteurId: null,
    sens: OrdreMarcheSens.VENTE,
    nbFractions: 10,
    prixUnitaire: 100,
    montant: 1_000,
    statut: OrdreMarcheStatus.EN_CARNET,
    valideJusquAu: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...etat,
  });

describe('SecondaryMarketOrder — passer une annonce', () => {
  const demande = {
    investissementId: 'inv-1',
    vendeurId: VENDEUR,
    sens: OrdreMarcheSens.VENTE,
    nbFractions: 10,
    prixUnitaire: 99.5,
    valideJusquAu: null,
  };

  it('dérive le montant du nombre de fractions et du prix unitaire', () => {
    expect(SecondaryMarketOrder.passer(demande).montant).toBe(995);
  });

  it('place l’annonce au carnet, sans acheteur', () => {
    const naissant = SecondaryMarketOrder.passer(demande);

    expect(naissant.statut).toBe(OrdreMarcheStatus.EN_CARNET);
    expect(naissant.acheteurId).toBeNull();
  });

  it('refuse une annonce sans fraction', () => {
    expect(() =>
      SecondaryMarketOrder.passer({ ...demande, nbFractions: 0 }),
    ).toThrow(OrdreDeVenteInvalideError);
  });

  it('refuse une fraction de fraction', () => {
    expect(() =>
      SecondaryMarketOrder.passer({ ...demande, nbFractions: 1.5 }),
    ).toThrow(OrdreDeVenteInvalideError);
  });

  it('refuse un prix unitaire nul', () => {
    expect(() =>
      SecondaryMarketOrder.passer({ ...demande, prixUnitaire: 0 }),
    ).toThrow(OrdreDeVenteInvalideError);
  });
});

describe('SecondaryMarketOrder — exécution', () => {
  it('solde l’ordre quand l’achat porte sur tout le lot', () => {
    const o = ordre();

    const cession = o.executer(10, ACHETEUR);

    expect(cession.integralement).toBe(true);
    expect(cession.montantRegle).toBe(1_000);
    expect(cession.fractionsRestantes).toBe(0);
    expect(o.statut).toBe(OrdreMarcheStatus.EXECUTE);
    expect(o.acheteurId).toBe(ACHETEUR);
  });

  it('laisse le reste au carnet quand l’achat est partiel', () => {
    const o = ordre();

    const cession = o.executer(4, ACHETEUR);

    expect(cession.integralement).toBe(false);
    expect(cession.montantRegle).toBe(400);
    expect(cession.fractionsRestantes).toBe(6);
    expect(o.statut).toBe(OrdreMarcheStatus.EN_CARNET);
  });

  it('n’attribue pas d’acheteur à un ordre resté au carnet', () => {
    const o = ordre();

    o.executer(4, ACHETEUR);

    expect(o.acheteurId).toBeNull();
  });

  it('fait suivre le montant après un achat partiel', () => {
    const o = ordre();

    o.executer(4, ACHETEUR);

    expect(o.nbFractions).toBe(6);
    expect(o.montant).toBe(600);
  });

  it('permet d’épuiser un ordre en deux achats partiels', () => {
    const o = ordre();

    o.executer(6, ACHETEUR);
    const seconde = o.executer(4, 43);

    expect(seconde.integralement).toBe(true);
    expect(o.statut).toBe(OrdreMarcheStatus.EXECUTE);
  });

  it('refuse un ordre qui n’est plus au carnet', () => {
    const o = ordre({ statut: OrdreMarcheStatus.EXECUTE });

    expect(() => o.executer(1, ACHETEUR)).toThrow(OrdreIndisponibleError);
  });

  it('refuse au vendeur d’acheter son propre ordre', () => {
    const o = ordre();

    expect(() => o.executer(1, VENDEUR)).toThrow(AchatDeSonPropreOrdreError);
  });

  it('refuse une quantité au-delà du lot offert', () => {
    const o = ordre();

    expect(() => o.executer(11, ACHETEUR)).toThrow(
      QuantiteAcheteeInvalideError,
    );
  });

  it('refuse une quantité nulle ou négative', () => {
    const o = ordre();

    expect(() => o.executer(0, ACHETEUR)).toThrow(QuantiteAcheteeInvalideError);
    expect(() => o.executer(-1, ACHETEUR)).toThrow(
      QuantiteAcheteeInvalideError,
    );
  });

  it('ne change rien quand elle refuse', () => {
    const o = ordre();

    expect(() => o.executer(11, ACHETEUR)).toThrow();

    expect(o.nbFractions).toBe(10);
    expect(o.montant).toBe(1_000);
    expect(o.statut).toBe(OrdreMarcheStatus.EN_CARNET);
  });
});

describe('SecondaryMarketOrder — annulation', () => {
  it('retire l’annonce du carnet à la demande du vendeur', () => {
    const o = ordre();

    o.annuler(VENDEUR);

    expect(o.statut).toBe(OrdreMarcheStatus.ANNULE);
  });

  it('refuse l’annulation à quelqu’un d’autre que le vendeur', () => {
    const o = ordre();

    expect(() => o.annuler(ACHETEUR)).toThrow(AnnulationReserveeAuVendeurError);
  });

  it('refuse d’annuler un ordre déjà exécuté', () => {
    const o = ordre({ statut: OrdreMarcheStatus.EXECUTE });

    expect(() => o.annuler(VENDEUR)).toThrow(OrdreNonAnnulableError);
  });

  it('refuse d’annuler deux fois', () => {
    const o = ordre();

    o.annuler(VENDEUR);

    expect(() => o.annuler(VENDEUR)).toThrow(OrdreNonAnnulableError);
  });
});

describe('SecondaryMarketOrder — éprouver un achat sans le jouer', () => {
  it('laisse l’ordre intact quand l’achat est légitime', () => {
    const o = ordre();

    o.assertAchetablePar(3, ACHETEUR);

    expect(o.nbFractions).toBe(10);
    expect(o.statut).toBe(OrdreMarcheStatus.EN_CARNET);
  });

  it('oppose les mêmes refus que l’exécution', () => {
    expect(() =>
      ordre({ statut: OrdreMarcheStatus.ANNULE }).assertAchetablePar(
        1,
        ACHETEUR,
      ),
    ).toThrow(OrdreIndisponibleError);
    expect(() => ordre().assertAchetablePar(1, VENDEUR)).toThrow(
      AchatDeSonPropreOrdreError,
    );
    expect(() => ordre().assertAchetablePar(99, ACHETEUR)).toThrow(
      QuantiteAcheteeInvalideError,
    );
  });
});
