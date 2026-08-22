import { CapaciteDeCession } from './capacite-de-cession';
import { FractionsIndisponiblesALaVenteError } from '../errors';

const capacite = (fractionsDetenues: number, fractionsDejaEnCarnet = 0) =>
  CapaciteDeCession.reconstituer({
    investissementId: 'inv-1',
    fractionsDetenues,
    fractionsDejaEnCarnet,
  });

describe('CapaciteDeCession', () => {
  it('offre à la vente tout ce qui n’est pas déjà au carnet', () => {
    expect(capacite(10, 4).disponibles).toBe(6);
  });

  it('inscrit une annonce qui tient dans le disponible', () => {
    const c = capacite(10, 4);

    c.inscrire(6);

    expect(c.disponibles).toBe(0);
    expect(c.fractionsDejaEnCarnet).toBe(10);
  });

  it('refuse la fraction de trop', () => {
    const c = capacite(10, 4);

    expect(() => c.inscrire(7)).toThrow(FractionsIndisponiblesALaVenteError);
  });

  it('empêche le porteur d’offrir deux fois ce qu’il détient', () => {
    const c = capacite(10);

    c.inscrire(10);

    // Le scénario que l'invariant existe pour interdire : deux annonces de 10
    // sur 10 fractions détenues, deux acheteurs payés, un seul servi.
    expect(() => c.inscrire(10)).toThrow(FractionsIndisponiblesALaVenteError);
  });

  it('ne modifie pas le carnet quand elle refuse', () => {
    const c = capacite(10, 4);

    expect(() => c.inscrire(7)).toThrow();

    expect(c.fractionsDejaEnCarnet).toBe(4);
  });

  it('dit ce qui reste et ce qui bloque, pour que le refus soit actionnable', () => {
    const c = capacite(10, 4);

    expect(() => c.inscrire(7)).toThrow(
      /Seulement 6 fraction\(s\) disponible\(s\) pour la vente \(4 déjà en carnet\)/,
    );
  });

  it('tient un investissement intégralement offert pour saturé', () => {
    expect(capacite(10, 10).estIntegralementOfferte).toBe(true);
    expect(capacite(10, 9).estIntegralementOfferte).toBe(false);
  });

  it('reste saturée pour un porteur qui ne détient plus rien', () => {
    const c = capacite(0);

    expect(c.estIntegralementOfferte).toBe(true);
    expect(() => c.inscrire(1)).toThrow(FractionsIndisponiblesALaVenteError);
  });
});
