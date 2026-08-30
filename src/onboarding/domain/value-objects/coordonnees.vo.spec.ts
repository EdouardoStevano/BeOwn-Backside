import { ChampsCoordonnees, Coordonnees } from './coordonnees.vo';
import { ChampProfilInvalideError } from 'src/onboarding/domain/errors';

function declarer(champs: ChampsCoordonnees = {}): Coordonnees {
  return Coordonnees.declarer(champs);
}

/** Le champ fautif remonté au front, pour surligner la bonne entrée. */
function champFautif(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ChampProfilInvalideError) {
      return (error.details as { field: string }).field;
    }
    throw error;
  }
  throw new Error('aucune erreur levée');
}

describe('Coordonnees — code postal rapporté à son pays', () => {
  it('exige un code postal conforme au pays de résidence', () => {
    expect(
      champFautif(() => declarer({ pays: 'FR', codePostal: '1000' })),
    ).toBe('codePostal');
    expect(declarer({ pays: 'FR', codePostal: '75001' }).codePostal).toBe(
      '75001',
    );
    expect(declarer({ pays: 'BE', codePostal: '1000' }).codePostal).toBe(
      '1000',
    );
  });

  it("n'invente pas de règle pour un pays dont le format est inconnu", () => {
    // La Côte d'Ivoire fonctionne par boîte postale : rien à imposer.
    expect(declarer({ pays: 'CI', codePostal: 'BP 1234' }).codePostal).toBe(
      'BP 1234',
    );
  });

  it('accepte un code postal seul, tant que le pays est inconnu', () => {
    expect(declarer({ codePostal: '1000' }).codePostal).toBe('1000');
  });

  it("rejoue la cohérence sur tout l'état lors d'une révision", () => {
    const coordonnees = declarer({ pays: 'BE', codePostal: '1000' });

    // Déménager ne touche que `pays`, et rend pourtant le code postal invalide.
    expect(champFautif(() => coordonnees.avec({ pays: 'FR' }))).toBe(
      'codePostal',
    );
  });

  it("laisse l'objet précédent intact quand la révision échoue", () => {
    const coordonnees = declarer({ pays: 'BE', codePostal: '1000' });

    expect(() => coordonnees.avec({ pays: 'FR' })).toThrow();
    expect(coordonnees.pays).toBe('BE');
    expect(coordonnees.codePostal).toBe('1000');
  });
});

describe('Coordonnees — adresse', () => {
  it('borne les lignes de texte libre', () => {
    expect(champFautif(() => declarer({ ville: 'x'.repeat(101) }))).toBe(
      'ville',
    );
    expect(
      champFautif(() => declarer({ adresseLigne1: 'x'.repeat(201) })),
    ).toBe('adresseLigne1');
  });

  it("juge l'adresse renseignée à sa première ligne", () => {
    expect(declarer().estRenseignee()).toBe(false);
    expect(declarer({ ville: 'Paris' }).estRenseignee()).toBe(false);
    expect(
      declarer({ adresseLigne1: '12 rue de la Paix' }).estRenseignee(),
    ).toBe(true);
  });
});

describe('Coordonnees.avec — révision', () => {
  it('rend un nouvel objet sans modifier le précédent', () => {
    const initiales = declarer({ ville: 'Abidjan' });
    const revisees = initiales.avec({ ville: 'Paris' });

    expect(initiales.ville).toBe('Abidjan');
    expect(revisees.ville).toBe('Paris');
  });

  it('distingue « ne pas toucher » (undefined) de « effacer » (null)', () => {
    const coordonnees = declarer({ ville: 'Paris' });

    expect(coordonnees.avec({ ville: undefined }).ville).toBe('Paris');
    expect(coordonnees.avec({ ville: null }).ville).toBeNull();
  });

  it('compare par valeur', () => {
    const coordonnees = declarer({ ville: 'Paris' });

    expect(coordonnees.equals(coordonnees.avec({ ville: 'Paris' }))).toBe(true);
    expect(coordonnees.equals(coordonnees.avec({ ville: 'Lyon' }))).toBe(false);
  });
});

describe('Coordonnees.restore', () => {
  it('relit une ligne incohérente écrite avant la règle', () => {
    const coordonnees = Coordonnees.restore({
      telephone: null,
      adresseLigne1: null,
      adresseLigne2: null,
      codePostal: '1000',
      ville: null,
      pays: 'FR',
    });

    expect(coordonnees.codePostal).toBe('1000');
    expect(coordonnees.pays).toBe('FR');
  });
});
