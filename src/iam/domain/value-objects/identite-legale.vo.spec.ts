import { ChampsIdentiteLegale, IdentiteLegale } from './identite-legale.vo';
import { ChampProfilInvalideError } from 'src/iam/domain/errors';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

function declarer(champs: Partial<ChampsIdentiteLegale> = {}): IdentiteLegale {
  return IdentiteLegale.declarer({ raisonSociale: 'BeOwn', ...champs });
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

describe('IdentiteLegale — raison sociale', () => {
  it('est obligatoire : la colonne est NOT NULL et un profil sans nom ne désigne personne', () => {
    expect(champFautif(() => IdentiteLegale.declarer({}))).toBe(
      'raisonSociale',
    );
    expect(
      champFautif(() => IdentiteLegale.declarer({ raisonSociale: '  ' })),
    ).toBe('raisonSociale');
  });

  it('normalise les espaces de saisie', () => {
    expect(declarer({ raisonSociale: '  BeOwn   SAS ' }).raisonSociale).toBe(
      'BeOwn SAS',
    );
  });

  it("n'impose aucune liste de caractères", () => {
    // Refuser & ou les chiffres reviendrait à refuser des sociétés réelles.
    expect(declarer({ raisonSociale: "L'Oréal & Cie 3M" }).raisonSociale).toBe(
      "L'Oréal & Cie 3M",
    );
  });

  it('borne la longueur', () => {
    expect(
      champFautif(() => declarer({ raisonSociale: 'x'.repeat(201) })),
    ).toBe('raisonSociale');
  });
});

describe('IdentiteLegale — forme juridique', () => {
  it('normalise la casse pour que les regroupements soient justes', () => {
    expect(declarer({ formeJuridique: 'sas' }).formeJuridique).toBe('SAS');
    expect(declarer({ formeJuridique: ' Sarl ' }).formeJuridique).toBe('SARL');
  });

  it("n'est pas une énumération : les formes étrangères passent", () => {
    expect(declarer({ formeJuridique: 'GmbH' }).formeJuridique).toBe('GMBH');
    expect(
      declarer({ formeJuridique: 'SA de droit luxembourgeois' }).formeJuridique,
    ).toBe('SA DE DROIT LUXEMBOURGEOIS');
  });

  it('refuse une saisie qui ne ressemble à aucun sigle', () => {
    expect(champFautif(() => declarer({ formeJuridique: 'S@S' }))).toBe(
      'formeJuridique',
    );
  });
});

describe('IdentiteLegale — le greffe ne va pas sans le SIREN', () => {
  it("refuse une ville de RCS sans numéro d'immatriculation", () => {
    expect(champFautif(() => declarer({ rcsVille: 'Paris' }))).toBe('siren');
  });

  it('accepte le couple complet', () => {
    const identite = declarer({ siren: SIREN, rcsVille: 'Paris' });

    expect(identite.siren).toBe(SIREN);
    expect(identite.rcsVille).toBe('Paris');
    expect(identite.estImmatriculee()).toBe(true);
  });

  it('accepte un SIREN seul — toutes les sociétés ne déclarent pas leur greffe', () => {
    expect(declarer({ siren: SIREN }).rcsVille).toBeNull();
  });

  it('ne se dit pas immatriculée sans numéro', () => {
    expect(declarer().estImmatriculee()).toBe(false);
  });
});

describe('IdentiteLegale.restore', () => {
  it('relit une ligne incohérente écrite avant la règle', () => {
    // Refuser au chargement rendrait le profil inaccessible — y compris pour
    // corriger la donnée fautive.
    const identite = IdentiteLegale.restore({
      raisonSociale: 'X',
      formeJuridique: 'sas',
      siren: '123',
      rcsVille: 'Paris',
    });

    expect(identite.raisonSociale).toBe('X');
    expect(identite.formeJuridique).toBe('sas');
    expect(identite.siren).toBe('123');
  });

  it('compare par valeur', () => {
    const a = declarer({ siren: SIREN });
    const b = declarer({ siren: SIREN });
    const c = declarer();

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
