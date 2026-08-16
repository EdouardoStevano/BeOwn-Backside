import { CreerProfilPMProps, ProfilPMFactory } from './profil-pm.factory';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { ChampProfilInvalideError } from 'src/profiles/domains/errors';

/** SIREN valide au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';

function creer(champs: Partial<CreerProfilPMProps> = {}): ProfilPM {
  return ProfilPMFactory.creer({
    utilisateurId: 42,
    raisonSociale: 'BeOwn',
    ...champs,
  });
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

describe('ProfilPMFactory — répartition', () => {
  it("confie l'identité légale à son bloc et garde le reste à plat", () => {
    const profil = creer({
      formeJuridique: 'sas',
      siren: SIREN,
      rcsVille: 'Paris',
      capitalSocial: 50_000,
      siegeAdresse: '12 rue de la Paix',
      secteurActivite: 'Immobilier',
    });

    expect(profil.identiteLegale.raisonSociale).toBe('BeOwn');
    expect(profil.identiteLegale.formeJuridique).toBe('SAS');
    expect(profil.identiteLegale.siren).toBe(SIREN);
    expect(profil.capitalSocial).toBe(50_000);
    expect(profil.siegeAdresse).toBe('12 rue de la Paix');
    expect(profil.secteurActivite).toBe('Immobilier');
  });

  it('laisse le bloc refuser sa part', () => {
    // La fabrique ne valide rien elle-même hors des identifiants.
    expect(champFautif(() => creer({ siren: '404833049' }))).toBe('siren');
    expect(champFautif(() => creer({ rcsVille: 'Paris' }))).toBe('siren');
    expect(champFautif(() => creer({ raisonSociale: '' }))).toBe(
      'raisonSociale',
    );
  });
});

describe('ProfilPMFactory — ce que la fabrique décide seule', () => {
  it('refuse un identifiant utilisateur qui ne désigne aucun compte', () => {
    expect(champFautif(() => creer({ utilisateurId: 0 }))).toBe(
      'utilisateurId',
    );
    expect(champFautif(() => creer({ utilisateurId: -1 }))).toBe(
      'utilisateurId',
    );
  });

  it('refuse un représentant légal qui ne désigne aucun compte', () => {
    expect(champFautif(() => creer({ representantId: 0 }))).toBe(
      'representantId',
    );
    expect(creer({ representantId: null }).aUnRepresentant()).toBe(false);
    expect(creer({ representantId: 7 }).aUnRepresentant()).toBe(true);
  });

  it('laisse la persistance attribuer les dates', () => {
    const profil = creer();

    expect(profil.createdAt).toBeUndefined();
    expect(profil.updatedAt).toBeUndefined();
  });
});

describe('ProfilPMFactory — capital social', () => {
  it("refuse un capital négatif : ça n'existe pas en droit des sociétés", () => {
    expect(champFautif(() => creer({ capitalSocial: -1 }))).toBe(
      'capitalSocial',
    );
  });

  it("accepte zéro — une SAS peut être constituée au capital d'un euro", () => {
    expect(creer({ capitalSocial: 0 }).capitalSocial).toBe(0);
    expect(creer({ capitalSocial: 1 }).capitalSocial).toBe(1);
  });

  it('refuse une valeur non numérique', () => {
    expect(champFautif(() => creer({ capitalSocial: 'beaucoup' }))).toBe(
      'capitalSocial',
    );
  });

  it('arrondit au centime plutôt que de refuser une conversion maladroite', () => {
    expect(creer({ capitalSocial: 1234.567 }).capitalSocial).toBe(1234.57);
  });

  it('traite le vide comme « non renseigné »', () => {
    expect(creer().capitalSocial).toBeNull();
    expect(creer({ capitalSocial: null }).capitalSocial).toBeNull();
  });
});
