import { ChampProfilInvalideError } from 'src/iam/domain/errors';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/iam/domain/domain-services/plafond-psfp.domain-service';
import { CapaciteDePerte } from './capacite-de-perte.vo';

describe('CapaciteDePerte.declarer', () => {
  it('retient les montants déclarés', () => {
    const capacite = CapaciteDePerte.declarer({
      patrimoineNet: 250_000,
      revenuAnnuel: 60_000,
      budgetAnnuelInvestissement: 5_000,
      acceptsSimulatedLoss: true,
    });

    expect(capacite.patrimoineNet).toBe(250_000);
    expect(capacite.revenuAnnuel).toBe(60_000);
    expect(capacite.budgetAnnuelInvestissement).toBe(5_000);
    expect(capacite.acceptsSimulatedLoss).toBe(true);
  });

  it('traite les montants absents comme non renseignés', () => {
    const capacite = CapaciteDePerte.declarer({});

    expect(capacite.patrimoineNet).toBeNull();
    expect(capacite.acceptsSimulatedLoss).toBe(false);
  });

  it.each([
    ['négatif', -1],
    ['illisible', 'beaucoup'],
    ['hors de proportion', 1e15],
  ])('refuse un patrimoine %s', (_libelle, patrimoineNet) => {
    // Un patrimoine négatif produirait un plafond conseillé négatif, un
    // illisible un NaN qui se propagerait jusqu'au contrôle de souscription.
    expect(() =>
      CapaciteDePerte.declarer({ patrimoineNet: patrimoineNet as number }),
    ).toThrow(ChampProfilInvalideError);
  });
});

describe('CapaciteDePerte.plafondConseille', () => {
  it('retient 5 % du patrimoine quand il dépasse le plancher', () => {
    expect(
      CapaciteDePerte.declarer({ patrimoineNet: 300_000 }).plafondConseille(),
    ).toBe(15_000);
  });

  it('retient le plancher réglementaire sinon', () => {
    expect(
      CapaciteDePerte.declarer({ patrimoineNet: 1_000 }).plafondConseille(),
    ).toBe(PLANCHER_PLAFOND_NON_AVERTI);
  });
});

describe('CapaciteDePerte.restore', () => {
  it('convertit les décimaux que Postgres rend en chaîne', () => {
    const capacite = CapaciteDePerte.restore({
      patrimoineNet: '250000.00',
      revenuAnnuel: '60000.00',
      budgetAnnuelInvestissement: null,
      acceptsSimulatedLoss: true,
    });

    expect(capacite.patrimoineNet).toBe(250_000);
    expect(capacite.revenuAnnuel).toBe(60_000);
    expect(capacite.budgetAnnuelInvestissement).toBeNull();
  });

  it('accepte une ligne que la règle actuelle refuserait', () => {
    // Une ligne écrite avant que la borne n'existe doit rester lisible, ne
    // serait-ce que pour corriger la donnée fautive.
    expect(
      CapaciteDePerte.restore({
        patrimoineNet: -50,
        revenuAnnuel: null,
        budgetAnnuelInvestissement: null,
        acceptsSimulatedLoss: false,
      }).patrimoineNet,
    ).toBe(-50);
  });
});
