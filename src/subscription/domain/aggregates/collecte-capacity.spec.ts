import { CollecteCapacity } from './collecte-capacity';
import {
  FractionsDemandeesIndisponiblesError,
  PlusAucuneFractionDisponibleError,
  QuantiteDeFractionsInvalideError,
} from '../errors/subscription.errors';

const capacite = (nbFractionsTotal: number, fractionsDejaVendues: number) =>
  CollecteCapacity.reconstituer({
    projetId: 'p-1',
    nbFractionsTotal,
    fractionsDejaVendues,
  });

describe('CollecteCapacity — invariant d’anti-survente', () => {
  it('alloue les fractions demandées tant que la collecte en a', () => {
    const collecte = capacite(100, 40);

    collecte.allouer(10);

    expect(collecte.fractionsDejaVendues).toBe(50);
    expect(collecte.fractionsDisponibles).toBe(50);
  });

  it('refuse quand la collecte est déjà complète', () => {
    const collecte = capacite(100, 100);

    expect(() => collecte.allouer(1)).toThrow(
      PlusAucuneFractionDisponibleError,
    );
    expect(collecte.fractionsDejaVendues).toBe(100);
  });

  it('refuse — en disant combien il en reste — quand la demande excède le disponible', () => {
    const collecte = capacite(100, 99);

    expect(() => collecte.allouer(2)).toThrow(
      FractionsDemandeesIndisponiblesError,
    );
    expect(() => collecte.allouer(2)).toThrow(/Seulement 1 fraction/);
    expect(collecte.fractionsDejaVendues).toBe(99);
  });

  it('accepte exactement les dernières fractions disponibles', () => {
    const collecte = capacite(100, 98);

    collecte.allouer(2);

    expect(collecte.estIntegralementSouscrite).toBe(true);
  });

  it.each([0, -3, 2.5])('refuse une quantité invalide (%p)', (quantite) => {
    const collecte = capacite(100, 0);

    expect(() => collecte.allouer(quantite)).toThrow(
      QuantiteDeFractionsInvalideError,
    );
  });

  it('ne se déclare complète qu’une fois toutes les fractions souscrites', () => {
    expect(capacite(100, 99).estIntegralementSouscrite).toBe(false);
    expect(capacite(100, 100).estIntegralementSouscrite).toBe(true);
  });

  it('se construit depuis la vue souscriptible du projet', () => {
    const collecte = CollecteCapacity.duProjet(
      {
        projetId: 'p-1',
        enCollecte: true,
        dejaFinance: false,
        instrument: 'OBLIGATION',
        prixFraction: 100,
        nbFractionsTotal: 250,
        ticketMaximum: null,
        triCible: 8,
        dureeMois: 12,
      },
      30,
    );

    expect(collecte.nbFractionsTotal).toBe(250);
    expect(collecte.fractionsDisponibles).toBe(220);
  });
});
