import { BaremeDesFrais, TAUX_PAR_DEFAUT } from './bareme-des-frais.vo';

/**
 * Les règles de facturation, éprouvées **sans base de données**.
 *
 * Elles vivaient dans un service applicatif qui se faisait injecter un
 * `Repository` TypeORM : les tester obligeait à doubler la persistance pour
 * vérifier une multiplication. C'est exactement ce que §26 demande d'éviter —
 * « éviter de dépendre de la base de données pour tester la logique métier ».
 */
describe('BaremeDesFrais — reconstitution depuis le paramétrage', () => {
  it('applique les taux par défaut quand rien n’est paramétré', () => {
    expect(BaremeDesFrais.parDefaut().toSnapshot()).toEqual(TAUX_PAR_DEFAUT);
  });

  it('les valeurs paramétrées priment sur les défauts', () => {
    const bareme = BaremeDesFrais.restore({
      propertySaleGainFeePct: 20,
      resaleTransactionFeePct: 2,
    });

    expect(bareme.toSnapshot()).toMatchObject({
      propertySaleGainFeePct: 20,
      resaleTransactionFeePct: 2,
      // Les clés absentes retombent sur le défaut.
      shareSaleGainFeePct: TAUX_PAR_DEFAUT.shareSaleGainFeePct,
    });
  });

  it('accepte 0 : un frais désactivé n’est pas un frais absent', () => {
    const bareme = BaremeDesFrais.restore({ propertySaleGainFeePct: 0 });

    expect(bareme.toSnapshot().propertySaleGainFeePct).toBe(0);
    expect(bareme.fraisSurPlusValueDeSortie(10_000)).toBe(0);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -5,
    null,
    'quinze',
    undefined,
  ])('retombe sur le défaut devant une valeur illisible (%p)', (valeur) => {
    // Une ligne de paramétrage mal saisie ne doit pas empêcher la plateforme
    // de facturer.
    const bareme = BaremeDesFrais.restore({ propertySaleGainFeePct: valeur });

    expect(bareme.toSnapshot().propertySaleGainFeePct).toBe(
      TAUX_PAR_DEFAUT.propertySaleGainFeePct,
    );
  });

  it('ignore les clés héritées que le blob porte encore', () => {
    const bareme = BaremeDesFrais.restore({
      investmentFeePct: 3,
      propertySaleGainFeePct: 12,
    });

    expect(bareme.toSnapshot()).not.toHaveProperty('investmentFeePct');
    expect(bareme.toSnapshot().propertySaleGainFeePct).toBe(12);
  });
});

describe('BaremeDesFrais — frais de sortie', () => {
  const bareme = () => BaremeDesFrais.restore({ propertySaleGainFeePct: 15 });

  it('prélève le taux sur la plus-value', () => {
    expect(bareme().fraisSurPlusValueDeSortie(10_000)).toBe(1_500);
  });

  it.each([0, -1, -10_000])(
    'ne prélève rien sur une moins-value ou une plus-value nulle (%p)',
    (plusValue) => {
      // La plateforme ne se rémunère pas sur une perte.
      expect(bareme().fraisSurPlusValueDeSortie(plusValue)).toBe(0);
    },
  );

  it('arrondit au centime', () => {
    expect(
      BaremeDesFrais.restore({
        propertySaleGainFeePct: 15,
      }).fraisSurPlusValueDeSortie(333.33),
    ).toBe(50);
  });
});

describe('BaremeDesFrais — frais de revente', () => {
  const bareme = () =>
    BaremeDesFrais.restore({
      resaleTransactionFeePct: 1,
      shareSaleGainFeePct: 15,
    });

  it('cumule un frais de transaction et un frais sur la plus-value', () => {
    expect(bareme().fraisDeRevente(10_000, 2_000)).toEqual({
      transactionFee: 100,
      gainFee: 300,
    });
  });

  it('laisse le frais de transaction dû même sans plus-value', () => {
    // La vente a bien eu lieu : c'est elle qui est facturée, pas le gain.
    expect(bareme().fraisDeRevente(10_000, -500)).toEqual({
      transactionFee: 100,
      gainFee: 0,
    });
  });

  it('arrondit chaque frais séparément', () => {
    expect(bareme().fraisDeRevente(333.33, 333.33)).toEqual({
      transactionFee: 3.33,
      gainFee: 50,
    });
  });

  it('rend les deux frais du même barème', () => {
    // Ils sont dus ensemble sur la même cession : les calculer séparément a
    // déjà conduit un appelant à additionner deux frais issus de deux lectures
    // de taux différentes.
    const unique = BaremeDesFrais.restore({
      resaleTransactionFeePct: 2,
      shareSaleGainFeePct: 20,
    });

    expect(unique.fraisDeRevente(1_000, 1_000)).toEqual({
      transactionFee: 20,
      gainFee: 200,
    });
  });
});
