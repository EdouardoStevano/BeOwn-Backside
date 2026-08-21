import { PrelevementForfaitaire } from './prelevement-forfaitaire.vo';

describe('PrelevementForfaitaire — PFU 30 %', () => {
  it('prélève 12,8 % d’IR et 17,2 % de CSG sur les intérêts', () => {
    // Échéance de 50 000 € dont 10 000 € d'intérêts.
    const pfu = PrelevementForfaitaire.surEcheance(10_000, 50_000);

    expect(pfu.prelevementIR).toBe(1_280);
    expect(pfu.prelevementCSG).toBe(1_720);
    expect(pfu.prelevementTotal).toBe(3_000);
  });

  it('ne taxe pas le capital : l’assiette est la seule part d’intérêts', () => {
    const avecCapital = PrelevementForfaitaire.surEcheance(10_000, 50_000);
    const sansCapital = PrelevementForfaitaire.surEcheance(10_000, 10_000);

    expect(sansCapital.prelevementIR).toBe(avecCapital.prelevementIR);
    expect(sansCapital.prelevementCSG).toBe(avecCapital.prelevementCSG);
  });

  it('déduit la retenue du total versé, capital compris', () => {
    const pfu = PrelevementForfaitaire.surEcheance(10_000, 50_000);

    expect(pfu.montantNet).toBe(47_000);
  });

  it('arrondit chaque prélèvement au centime', () => {
    const pfu = PrelevementForfaitaire.surEcheance(33.33, 33.33);

    expect(pfu.prelevementIR).toBe(4.27);
    expect(pfu.prelevementCSG).toBe(5.73);
  });

  it('ne prélève rien sur une échéance sans intérêts', () => {
    const pfu = PrelevementForfaitaire.surEcheance(0, 1_000);

    expect(pfu.prelevementIR).toBe(0);
    expect(pfu.prelevementCSG).toBe(0);
    expect(pfu.montantNet).toBe(1_000);
  });
});
