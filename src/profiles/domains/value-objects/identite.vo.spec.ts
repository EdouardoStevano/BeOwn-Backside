import {
  ChampsIdentite,
  Identite,
  MARQUEUR_IDENTITE_INCONNUE,
} from './identite.vo';
import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

/** Date de naissance calculée pour ne jamais périmer le test. */
function ilYA(annees: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - annees);
  return date.toISOString().slice(0, 10);
}

const COMPTE = { prenom: 'Awa', nom: 'Koné' };

function declarer(champs: ChampsIdentite = {}): Identite {
  return Identite.declarer(COMPTE, champs);
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

describe('Identite — état civil repris du compte', () => {
  it("marque l'identité manquante plutôt que de refuser la création", () => {
    // Le nom de famille est facultatif à l'inscription : refuser ici
    // enfermerait le compte, qui ne pourrait plus rien compléter.
    const identite = Identite.declarer({ prenom: 'Awa', nom: null });

    expect(identite.nom).toBe(MARQUEUR_IDENTITE_INCONNUE);
    expect(identite.estConnue()).toBe(false);
  });

  it('reconnaît une identité complète', () => {
    expect(declarer().estConnue()).toBe(true);
  });

  it('normalise les espaces de saisie', () => {
    expect(
      Identite.declarer({ prenom: '  Awa   Marie ', nom: 'Koné' }).prenom,
    ).toBe('Awa Marie');
  });

  it("ne laisse pas modifier l'état civil, qui appartient au compte", () => {
    const identite = declarer();

    // `prenom` n'existe pas dans ChampsIdentite : le renommage passe par IAM.
    const revisee = identite.avec({
      prenom: 'Autre',
    } as unknown as ChampsIdentite);

    expect(revisee.prenom).toBe('Awa');
  });
});

describe('Identite — date de naissance', () => {
  it('accepte un majeur et sait dire son âge', () => {
    const identite = declarer({ dateNaissance: ilYA(30) });

    expect(identite.dateNaissance).toBe(ilYA(30));
    expect(identite.age()).toBe(30);
  });

  it('refuse un mineur — la capacité juridique commence à 18 ans', () => {
    expect(champFautif(() => declarer({ dateNaissance: ilYA(17) }))).toBe(
      'dateNaissance',
    );
  });

  it('refuse une date future', () => {
    expect(champFautif(() => declarer({ dateNaissance: '2999-01-01' }))).toBe(
      'dateNaissance',
    );
  });

  it('refuse un âge invraisemblable — année tapée à côté', () => {
    expect(champFautif(() => declarer({ dateNaissance: '1892-06-15' }))).toBe(
      'dateNaissance',
    );
  });

  it("refuse un jour qui n'existe pas, que `Date` aurait décalé en silence", () => {
    expect(champFautif(() => declarer({ dateNaissance: '1990-02-31' }))).toBe(
      'dateNaissance',
    );
  });

  it('refuse un format libre', () => {
    expect(champFautif(() => declarer({ dateNaissance: '15/06/1985' }))).toBe(
      'dateNaissance',
    );
  });

  it('conserve le jour civil, sans décalage de fuseau', () => {
    // `new Date('1985-06-15')` relu à l'ouest de Greenwich redonnait le 14.
    expect(declarer({ dateNaissance: '1985-06-15' }).dateNaissance).toBe(
      '1985-06-15',
    );
  });

  it('accepte un instant ISO complet en ne gardant que le jour', () => {
    expect(
      declarer({ dateNaissance: '1985-06-15T23:30:00.000Z' }).dateNaissance,
    ).toBe('1985-06-15');
  });

  it("ne connaît pas d'âge sans date de naissance", () => {
    expect(declarer().age()).toBeNull();
  });
});

describe('Identite — nationalité et naissance', () => {
  it('normalise la casse du code pays', () => {
    expect(declarer({ nationalite: 'ci' }).nationalite).toBe('CI');
  });

  it("refuse un code qui n'est attribué à aucun pays", () => {
    expect(champFautif(() => declarer({ nationalite: 'ZZ' }))).toBe(
      'nationalite',
    );
    expect(champFautif(() => declarer({ paysNaissance: 'XX' }))).toBe(
      'paysNaissance',
    );
  });

  it('traite la chaîne vide comme « non renseigné »', () => {
    expect(declarer({ nationalite: '' }).nationalite).toBeNull();
  });

  it('borne le lieu de naissance', () => {
    expect(
      champFautif(() => declarer({ lieuNaissance: 'x'.repeat(101) })),
    ).toBe('lieuNaissance');
  });
});

describe('Identite — civilité', () => {
  it('ramène les écritures courantes à une valeur unique', () => {
    expect(declarer({ civilite: 'monsieur' }).civilite).toBe('M.');
    expect(declarer({ civilite: 'M' }).civilite).toBe('M.');
    expect(declarer({ civilite: 'M.' }).civilite).toBe('M.');
    expect(declarer({ civilite: 'MME' }).civilite).toBe('Mme');
  });

  it('refuse une civilité inconnue', () => {
    expect(champFautif(() => declarer({ civilite: 'Docteur' }))).toBe(
      'civilite',
    );
  });
});

describe('Identite.avec — révision', () => {
  it('rend une nouvelle identité sans modifier la précédente', () => {
    const initiale = declarer({ nationalite: 'FR' });
    const revisee = initiale.avec({ nationalite: 'CI' });

    expect(initiale.nationalite).toBe('FR');
    expect(revisee.nationalite).toBe('CI');
  });

  it('ne touche que les champs présents', () => {
    const identite = declarer({ nationalite: 'FR', civilite: 'M.' }).avec({
      civilite: 'Mme',
    });

    expect(identite.nationalite).toBe('FR');
    expect(identite.civilite).toBe('Mme');
  });

  it('distingue « ne pas toucher » (undefined) de « effacer » (null)', () => {
    const identite = declarer({ nationalite: 'FR' });

    expect(identite.avec({ nationalite: undefined }).nationalite).toBe('FR');
    expect(identite.avec({ nationalite: null }).nationalite).toBeNull();
  });

  it('applique les mêmes règles que la première déclaration', () => {
    expect(champFautif(() => declarer().avec({ nationalite: 'ZZ' }))).toBe(
      'nationalite',
    );
  });
});

describe('Identite.restore', () => {
  it('relit une ligne écrite avant que les règles existent', () => {
    // Refuser au chargement rendrait le profil inaccessible — y compris pour
    // corriger la donnée fautive.
    const identite = Identite.restore({
      civilite: 'Monsieur',
      prenom: 'A',
      nom: 'K',
      nomNaissance: null,
      dateNaissance: '2015-01-01',
      lieuNaissance: null,
      paysNaissance: null,
      nationalite: 'ZZ',
    });

    expect(identite.nationalite).toBe('ZZ');
    expect(identite.dateNaissance).toBe('2015-01-01');
    expect(identite.prenom).toBe('A');
  });

  it('accepte un `Date`, forme que rend parfois le driver', () => {
    const identite = Identite.restore({
      civilite: null,
      prenom: 'Awa',
      nom: 'Koné',
      nomNaissance: null,
      dateNaissance: new Date('1985-06-15T00:00:00.000Z'),
      lieuNaissance: null,
      paysNaissance: null,
      nationalite: null,
    });

    expect(identite.dateNaissance).toBe('1985-06-15');
  });
});
