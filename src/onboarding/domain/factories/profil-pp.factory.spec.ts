import { CreerProfilPPProps, ProfilPPFactory } from './profil-pp.factory';
import { ProfilPP } from 'src/onboarding/domain/aggregates/profil-pp';
import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';
import { ChampProfilInvalideError } from 'src/onboarding/domain/errors';

function creer(champs: Partial<CreerProfilPPProps> = {}): ProfilPP {
  return ProfilPPFactory.creer({ userId: 42, ...champs });
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

describe('ProfilPPFactory — répartition entre les blocs', () => {
  it('confie chaque déclaration au bloc qui la porte', () => {
    const profil = creer({
      nationalite: 'ci',
      ville: 'Abidjan',
      profession: 'Ingénieur',
      residenceFiscale: 'CI',
      nif: '1234567890',
    });

    expect(profil.identite.nationalite).toBe('CI');
    expect(profil.coordonnees.ville).toBe('Abidjan');
    expect(profil.situationProfessionnelle.profession).toBe('Ingénieur');
    expect(profil.situationFiscale.nif).toBe('1234567890');
  });

  it('laisse chaque bloc refuser sa part', () => {
    // La fabrique ne valide rien elle-même hors de la clé : elle passe la main.
    expect(champFautif(() => creer({ nationalite: 'ZZ' }))).toBe('nationalite');
    expect(champFautif(() => creer({ codePostal: '1000', pays: 'FR' }))).toBe(
      'codePostal',
    );
    expect(champFautif(() => creer({ nif: '1234567890' }))).toBe(
      'residenceFiscale',
    );
  });

  it("n'accepte plus l'état civil, qui appartient au compte", () => {
    // `prenom` et `nom` ne sont plus des props : le dossier ne peut donc plus
    // en garder une copie divergente de `user`. Le téléphone, lui, est une
    // coordonnée déclarée du dossier — il y a sa place.
    const profil = creer({
      prenom: 'Awa',
      nom: 'Koné',
      telephone: '0612345678',
    } as unknown as Partial<CreerProfilPPProps>);

    expect(Object.keys(profil.toJSON())).not.toContain('prenom');
    expect(Object.keys(profil.toJSON())).not.toContain('nom');
  });

  it('retient le téléphone déclaré, avec le reste des coordonnées', () => {
    const profil = creer({ telephone: '06 12 34 56 78' });

    expect(profil.toJSON().telephone).toBe('0612345678');
  });
});

describe('ProfilPPFactory — ce que la fabrique décide seule', () => {
  it('refuse un identifiant utilisateur qui ne désigne aucun compte', () => {
    expect(champFautif(() => creer({ userId: 0 }))).toBe('userId');
    expect(champFautif(() => creer({ userId: -1 }))).toBe('userId');
  });

  it('ne retient aucun classement, quelle que soit la demande', () => {
    // Le DTO ne propose pas la catégorie, mais un import ou un script pourrait
    // la glisser. Elle n'est pas un paramètre — et le profil n'a plus où la
    // mettre : c'est `EvaluationDAdequation` qui classe, sur la foi du
    // questionnaire d'adéquation.
    const profil = creer({
      categoriePsfp: CategoriePsfp.PROFESSIONNEL,
      patrimoineDeclare: 10_000_000,
    } as unknown as Partial<CreerProfilPPProps>);

    const publie = profil.toJSON() as unknown as Record<string, unknown>;
    expect(publie.categoriePsfp).toBeUndefined();
    expect(publie.patrimoineDeclare).toBeUndefined();
  });

  it('ne déclare personne politiquement exposé par défaut', () => {
    expect(creer().estPep()).toBe(false);
    expect(creer({ pep: true }).estPep()).toBe(true);
  });

  it('laisse la persistance attribuer les dates', () => {
    const profil = creer();

    expect(profil.createdAt).toBeUndefined();
    expect(profil.updatedAt).toBeUndefined();
  });
});
