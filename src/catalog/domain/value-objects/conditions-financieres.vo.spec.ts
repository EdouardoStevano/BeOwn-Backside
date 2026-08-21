import { ProjectInstrument } from '../enums/project-status.enum';
import { ChampProjetInvalideError } from '../errors/project.errors';
import {
  ConditionsFinancieres,
  ConditionsFinancieresProps,
} from './conditions-financieres.vo';

const valides: ConditionsFinancieresProps = {
  capitalCible: 500_000,
  capitalMinimum: 300_000,
  dureeMois: 24,
  instrument: ProjectInstrument.OBLIGATION,
};

const of = (surcharge: Partial<ConditionsFinancieresProps> = {}) =>
  ConditionsFinancieres.of({ ...valides, ...surcharge });

describe('ConditionsFinancieres', () => {
  describe('défauts', () => {
    it('ticket minimum à 100 et risque moyen', () => {
      const conditions = of();
      expect(conditions.ticketMinimum).toBe(100);
      expect(conditions.indiceRisque).toBe(3);
      expect(conditions.estPreInvestissable).toBe(false);
    });
  });

  describe('invariants croisés', () => {
    it('refuse un capital minimum au-dessus du capital cible', () => {
      expect(() => of({ capitalMinimum: 600_000 })).toThrow(
        ChampProjetInvalideError,
      );
    });

    it('accepte un capital minimum égal au capital cible', () => {
      expect(of({ capitalMinimum: 500_000 }).capitalMinimum).toBe(500_000);
    });

    it('refuse un ticket maximum sous le ticket minimum', () => {
      expect(() => of({ ticketMinimum: 1_000, ticketMaximum: 500 })).toThrow(
        ChampProjetInvalideError,
      );
    });

    it('refuse un ticket minimum au-dessus du capital cible', () => {
      expect(() => of({ ticketMinimum: 600_000 })).toThrow(
        ChampProjetInvalideError,
      );
    });

    it('refuse un plafond de pré-investissement au-dessus du capital cible', () => {
      expect(() => of({ plafondPreInvestissement: 600_000 })).toThrow(
        ChampProjetInvalideError,
      );
    });
  });

  describe('bornes', () => {
    it('refuse un capital cible au-delà du plafond PSFP', () => {
      expect(() => of({ capitalCible: 5_000_001, capitalMinimum: 1 })).toThrow(
        ChampProjetInvalideError,
      );
    });

    it('accepte exactement le plafond PSFP', () => {
      expect(of({ capitalCible: 5_000_000 }).capitalCible).toBe(5_000_000);
    });

    it.each([0, 6, 2.5])('refuse un indice de risque %s', (indiceRisque) => {
      expect(() => of({ indiceRisque })).toThrow(ChampProjetInvalideError);
    });

    it.each([0, -1])('refuse une durée de %s mois', (dureeMois) => {
      expect(() => of({ dureeMois })).toThrow(ChampProjetInvalideError);
    });
  });

  describe('dérivés', () => {
    it('le prix d’une fraction est le ticket minimum, pas prixFraction', () => {
      const conditions = of({ ticketMinimum: 250, prixFraction: 999 });
      expect(conditions.prixUnitaireFraction).toBe(250);
    });

    it('le nombre de fractions se déduit du capital cible à défaut d’être déclaré', () => {
      expect(of({ ticketMinimum: 250 }).nbFractionsTotal).toBe(2_000);
    });

    it('le nombre déclaré prime sur le calcul', () => {
      expect(of({ nbFractions: 42 }).nbFractionsTotal).toBe(42);
    });
  });

  describe('avec', () => {
    it('ne touche que les champs fournis', () => {
      const modifiees = of({ triCible: 8 }).avec({ dureeMois: 36 });
      expect(modifiees.dureeMois).toBe(36);
      expect(modifiees.triCible).toBe(8);
    });

    it('efface sur null', () => {
      expect(of({ triCible: 8 }).avec({ triCible: null }).triCible).toBeNull();
    });

    it('revalide le bloc entier — un capital cible abaissé sous le minimum est refusé', () => {
      expect(() => of().avec({ capitalCible: 200_000 })).toThrow(
        ChampProjetInvalideError,
      );
    });
  });

  describe('restore', () => {
    it('ne rejoue pas les invariants — les lignes antérieures restent lisibles', () => {
      const relues = ConditionsFinancieres.restore({
        capitalCible: 100,
        capitalMinimum: 999_999,
        ticketMinimum: 100,
        ticketMaximum: null,
        triCible: null,
        indiceRisque: 42,
        dureeMois: 0,
        instrument: ProjectInstrument.ACTION,
        estPreInvestissable: false,
        plafondPreInvestissement: null,
        nbFractions: null,
        prixFraction: null,
      });

      expect(relues.capitalMinimum).toBe(999_999);
      expect(relues.indiceRisque).toBe(42);
    });
  });
});
