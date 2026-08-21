import { StatutSortie } from './enums/statut-sortie.enum';
import {
  ChampSortieInvalideError,
  SortieDejaDistribueeError,
  TransitionSortieInvalideError,
} from './errors';
import { SortieProjetFactory } from './factories/sortie-projet.factory';

const declarer = (
  surcharge: Partial<Parameters<typeof SortieProjetFactory.declarer>[0]> = {},
) =>
  SortieProjetFactory.declarer({
    projetId: 'p1',
    prixRevente: 260_000,
    dateRevente: new Date('2031-05-15'),
    capitalCible: 200_000,
    ...surcharge,
  });

describe('SortieProjet', () => {
  describe('déclaration', () => {
    it('calcule la plus-value brute : prix de revente − capital cible', () => {
      expect(declarer().plusValueBrute).toBe(60_000);
    });

    it('accepte une moins-value', () => {
      expect(declarer({ prixRevente: 180_000 }).plusValueBrute).toBe(-20_000);
    });

    it('arrondit au centime', () => {
      expect(
        declarer({ prixRevente: 200_000.129, capitalCible: 100_000 })
          .plusValueBrute,
      ).toBe(100_000.13);
    });

    it('naît PROJETEE sans acte de vente', () => {
      expect(declarer().statut).toBe(StatutSortie.PROJETEE);
    });

    it('naît ACTEE quand l’acte accompagne la déclaration', () => {
      expect(declarer({ acteVentePdfUrl: 'https://x/acte.pdf' }).statut).toBe(
        StatutSortie.ACTEE,
      );
    });

    it('ignore un acte réduit à des espaces', () => {
      expect(declarer({ acteVentePdfUrl: '   ' }).statut).toBe(
        StatutSortie.PROJETEE,
      );
    });

    it.each([0, -10])('refuse un prix de revente de %s', (prixRevente) => {
      expect(() => declarer({ prixRevente })).toThrow(ChampSortieInvalideError);
    });
  });

  describe('cycle de vie', () => {
    it('PROJETEE → ACTEE enregistre l’acte', () => {
      const sortie = declarer();
      sortie.marquerActee('https://x/acte.pdf');
      expect(sortie.statut).toBe(StatutSortie.ACTEE);
      expect(sortie.acteVentePdfUrl).toBe('https://x/acte.pdf');
    });

    it('refuse d’acter une sortie qui l’est déjà', () => {
      const sortie = declarer({ acteVentePdfUrl: 'https://x/acte.pdf' });
      expect(() => sortie.marquerActee('https://x/autre.pdf')).toThrow(
        TransitionSortieInvalideError,
      );
    });

    it('ACTEE → DISTRIBUEE', () => {
      const sortie = declarer({ acteVentePdfUrl: 'https://x/acte.pdf' });
      sortie.marquerDistribuee();
      expect(sortie.statut).toBe(StatutSortie.DISTRIBUEE);
    });

    it('refuse de distribuer une sortie seulement projetée — la vente n’a pas eu lieu', () => {
      expect(() => declarer().marquerDistribuee()).toThrow(
        TransitionSortieInvalideError,
      );
    });

    it('refuse de distribuer deux fois', () => {
      const sortie = declarer({ acteVentePdfUrl: 'https://x/acte.pdf' });
      sortie.marquerDistribuee();
      expect(() => sortie.marquerDistribuee()).toThrow(
        TransitionSortieInvalideError,
      );
    });

    it.each([
      ['PROJETEE', undefined],
      ['ACTEE', 'https://x/acte.pdf'],
    ])('annule une sortie %s', (_libelle, acteVentePdfUrl) => {
      const sortie = declarer({ acteVentePdfUrl });
      sortie.annuler();
      expect(sortie.statut).toBe(StatutSortie.ANNULEE);
    });

    it('refuse d’annuler une sortie distribuée — le capital est versé', () => {
      const sortie = declarer({ acteVentePdfUrl: 'https://x/acte.pdf' });
      sortie.marquerDistribuee();
      expect(() => sortie.annuler()).toThrow(SortieDejaDistribueeError);
    });
  });

  describe('occupeLeProjet', () => {
    it.each([
      ['PROJETEE', undefined],
      ['ACTEE', 'https://x/acte.pdf'],
    ])('une sortie %s bloque la déclaration d’une seconde', (_l, acte) => {
      expect(declarer({ acteVentePdfUrl: acte }).occupeLeProjet).toBe(true);
    });

    it('une sortie annulée libère le projet', () => {
      const sortie = declarer();
      sortie.annuler();
      expect(sortie.occupeLeProjet).toBe(false);
    });
  });
});
