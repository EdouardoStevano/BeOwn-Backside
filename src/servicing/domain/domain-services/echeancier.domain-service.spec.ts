import { EcheancierGenerator } from './echeancier.domain-service';
import { EcheanceStatus, RemboursementMode } from '../enums/echeance.enum';
import { EchelonnementImpossibleError } from '../errors';

const ORIGINE = new Date('2026-01-15T00:00:00Z');

const demande = (
  etat: Partial<Parameters<typeof EcheancierGenerator.genererPour>[0]> = {},
) => ({
  investissementId: 'inv-1',
  montant: 1_200,
  triAnnuel: 8,
  dureeMois: 12,
  origine: ORIGINE,
  ...etat,
});

describe('EcheancierGenerator — in fine', () => {
  const echeances = () =>
    EcheancierGenerator.genererPour(demande(), RemboursementMode.IN_FINE);

  it('produit une échéance par mois de la durée du projet', () => {
    expect(echeances()).toHaveLength(12);
    expect(echeances().map((e) => e.numero)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('verse des intérêts constants sur le capital plein, sans amortir', () => {
    // 8 % annuel sur 1 200 € → 8 €/mois, capital inchangé jusqu'au terme.
    const premieres = echeances().slice(0, 11);

    expect(premieres.every((e) => e.montantInterets === 8)).toBe(true);
    expect(premieres.every((e) => e.montantCapital === 0)).toBe(true);
    expect(premieres.every((e) => e.montantTotal === 8)).toBe(true);
  });

  it('rembourse tout le capital à la dernière échéance', () => {
    const derniere = echeances()[11];

    expect(derniere.montantCapital).toBe(1_200);
    expect(derniere.montantInterets).toBe(8);
    expect(derniere.montantTotal).toBe(1_208);
  });

  it('rend le capital souscrit, et lui seul, sur toute la durée', () => {
    const capitalRembourse = echeances().reduce(
      (total, e) => total + e.montantCapital,
      0,
    );

    expect(capitalRembourse).toBe(1_200);
  });

  it('échelonne mensuellement à partir du mois suivant l’origine', () => {
    const dates = echeances().map((e) => e.datePrevue.getMonth());

    expect(dates[0]).toBe(new Date('2026-02-15').getMonth());
    expect(dates[11]).toBe(new Date('2027-01-15').getMonth());
  });

  it('naît à venir, sans paiement ni prélèvement', () => {
    expect(echeances()[0]).toMatchObject({
      investissementId: 'inv-1',
      statut: EcheanceStatus.A_VENIR,
      payeLe: null,
      prelevementIR: 0,
      prelevementCSG: 0,
      rappelJ7Envoye: false,
      rappelJ1Envoye: false,
    });
  });
});

describe('EcheancierGenerator — amortissable constant', () => {
  const echeances = () =>
    EcheancierGenerator.genererPour(
      demande(),
      RemboursementMode.AMORTISSABLE_CONSTANT,
    );

  it('amortit une part de capital identique à chaque échéance', () => {
    expect(echeances().every((e) => e.montantCapital === 100)).toBe(true);
  });

  it('décroît les intérêts avec le capital restant dû', () => {
    const [premiere, deuxieme] = echeances();

    // 8 €  sur 1 200 € dû, puis 7,33 € sur 1 100 €.
    expect(premiere.montantInterets).toBe(8);
    expect(deuxieme.montantInterets).toBe(7.33);
    expect(echeances()[11].montantInterets).toBeLessThan(1);
  });

  it('rend le capital souscrit sur toute la durée', () => {
    const capitalRembourse = echeances().reduce(
      (total, e) => total + e.montantCapital,
      0,
    );

    expect(capitalRembourse).toBe(1_200);
  });
});

describe('EcheancierGenerator — refus', () => {
  it('refuse un capital nul ou négatif', () => {
    expect(() =>
      EcheancierGenerator.genererPour(demande({ montant: 0 })),
    ).toThrow(EchelonnementImpossibleError);
  });

  it('refuse une durée qui n’est pas un nombre de mois exploitable', () => {
    expect(() =>
      EcheancierGenerator.genererPour(demande({ dureeMois: 0 })),
    ).toThrow(EchelonnementImpossibleError);
    expect(() =>
      EcheancierGenerator.genererPour(demande({ dureeMois: 1.5 })),
    ).toThrow(EchelonnementImpossibleError);
  });
});

describe('EcheancierGenerator — mode bullet trimestriel', () => {
  it('retombe sur l’amortissable, comme le faisait le calcul remplacé', () => {
    // Comportement hérité et documenté : aucune stratégie trimestrielle n'a
    // jamais été écrite, seul IN_FINE était distingué.
    expect(
      EcheancierGenerator.genererPour(
        demande(),
        RemboursementMode.BULLET_INTERETS_TRIMESTRIELS,
      ),
    ).toEqual(
      EcheancierGenerator.genererPour(
        demande(),
        RemboursementMode.AMORTISSABLE_CONSTANT,
      ),
    );
  });
});
