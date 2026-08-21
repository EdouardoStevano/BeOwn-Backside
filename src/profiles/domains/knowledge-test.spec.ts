import {
  DomaineTestConnaissances,
  evaluerTestConnaissances,
} from './knowledge-test';

const TOUS_DOMAINES = Object.values(DomaineTestConnaissances);

describe('evaluerTestConnaissances — art. 21(1) à 21(4)', () => {
  it('juge adéquat un score au seuil de 70 %', () => {
    const resultat = evaluerTestConnaissances(14, 20, TOUS_DOMAINES);
    expect(resultat.adequat).toBe(true);
    expect(resultat.avertissementRequis).toBe(false);
  });

  it('exige un avertissement sous le seuil, sans jamais bloquer', () => {
    const resultat = evaluerTestConnaissances(13, 20, TOUS_DOMAINES);
    expect(resultat.adequat).toBe(false);
    expect(resultat.avertissementRequis).toBe(true);
    // Rien dans le résultat ne conditionne l'accès à l'investissement :
    // l'art. 21(4) interdit d'empêcher l'investisseur d'investir.
    expect(resultat).not.toHaveProperty('bloquant');
  });

  it('signale les domaines du RTS 2022/2114 non couverts', () => {
    const resultat = evaluerTestConnaissances(20, 20, [
      DomaineTestConnaissances.RISQUES,
    ]);
    expect(resultat.domainesManquants).toContain(
      DomaineTestConnaissances.OBJECTIFS_INVESTISSEMENT,
    );
    expect(resultat.domainesManquants).toHaveLength(TOUS_DOMAINES.length - 1);
  });

  it('ne signale aucun manque quand les six domaines sont couverts', () => {
    const resultat = evaluerTestConnaissances(20, 20, TOUS_DOMAINES);
    expect(resultat.domainesManquants).toEqual([]);
  });

  it('rejette les tests vides ou les scores hors bornes', () => {
    expect(() => evaluerTestConnaissances(0, 0)).toThrow();
    expect(() => evaluerTestConnaissances(21, 20)).toThrow();
    expect(() => evaluerTestConnaissances(-1, 20)).toThrow();
  });
});
