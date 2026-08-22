import {
  SyntheseFiscaleAnnuelle,
  type LigneImposable,
} from './synthese-fiscale-annuelle';

const ANNEE = 2026;

/** Un coupon de 100 € d'intérêts, PFU appliqué (12,8 % + 17,2 %). */
const coupon = (brut: number): LigneImposable => {
  const prelevementIR = Math.round(brut * 0.128 * 100) / 100;
  const prelevementCSG = Math.round(brut * 0.172 * 100) / 100;
  return {
    brut,
    prelevementIR,
    prelevementCSG,
    net: brut - prelevementIR - prelevementCSG,
  };
};

describe('SyntheseFiscaleAnnuelle', () => {
  it('cumule les quatre montants et compte les versements', () => {
    const synthese = SyntheseFiscaleAnnuelle.cumuler(ANNEE, [
      coupon(100),
      coupon(100),
      coupon(100),
    ]);

    expect(synthese.annee).toBe(ANNEE);
    expect(synthese.nbLignes).toBe(3);
    expect(synthese.montantBrut).toBe(300);
    expect(synthese.montantIR).toBe(38.4);
    expect(synthese.montantCSG).toBe(51.6);
    expect(synthese.montantNet).toBe(210);
  });

  it('rend une année sans versement à zéro', () => {
    const synthese = SyntheseFiscaleAnnuelle.vide(ANNEE);

    expect(synthese.nbLignes).toBe(0);
    expect(synthese.montantBrut).toBe(0);
    expect(synthese.montantNet).toBe(0);
  });

  it('arrondit au centime, sans laisser filer la dérive du flottant', () => {
    // 0,1 + 0,2 vaut 0,30000000000000004 en virgule flottante.
    const synthese = SyntheseFiscaleAnnuelle.cumuler(ANNEE, [
      { brut: 0.1, prelevementIR: 0, prelevementCSG: 0, net: 0.1 },
      { brut: 0.2, prelevementIR: 0, prelevementCSG: 0, net: 0.2 },
    ]);

    expect(synthese.montantBrut).toBe(0.3);
    expect(synthese.montantNet).toBe(0.3);
  });

  it('reprend le net fourni sans le recalculer depuis le brut', () => {
    // Une part de distribution dont le net stocké s'écarte de la formule :
    // c'est la colonne qui fait foi, ce contexte agrège et ne recalcule pas.
    const synthese = SyntheseFiscaleAnnuelle.cumuler(ANNEE, [
      { brut: 1_000, prelevementIR: 128, prelevementCSG: 172, net: 690 },
    ]);

    expect(synthese.montantNet).toBe(690);
  });

  it('additionne des sources de montants différents', () => {
    const synthese = SyntheseFiscaleAnnuelle.cumuler(ANNEE, [
      coupon(1_000),
      { brut: 500, prelevementIR: 64, prelevementCSG: 86, net: 350 },
    ]);

    expect(synthese.montantBrut).toBe(1_500);
    expect(synthese.montantIR).toBe(192);
    expect(synthese.montantCSG).toBe(258);
    expect(synthese.montantNet).toBe(1_050);
  });

  it('ne touche pas aux lignes qu’on lui donne', () => {
    const lignes = [coupon(100), coupon(200)];
    const avant = JSON.stringify(lignes);

    SyntheseFiscaleAnnuelle.cumuler(ANNEE, lignes);

    expect(JSON.stringify(lignes)).toBe(avant);
  });
});
