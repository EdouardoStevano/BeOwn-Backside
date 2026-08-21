import { ChampsDeclaresProfilPP, ProfilPP } from './profil-pp';
import {
  CreerProfilPPProps,
  ProfilPPFactory,
} from '../factories/profil-pp.factory';
import { CategoriePsfp } from '../enums/categorie-psfp.enum';
import { ChampProfilInvalideError } from '../errors';

/** Date de naissance calculée pour ne jamais périmer le test. */
function ilYA(annees: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - annees);
  return date.toISOString().slice(0, 10);
}

function creer(champs: Partial<CreerProfilPPProps> = {}): ProfilPP {
  return ProfilPPFactory.creer({ utilisateurId: 42, ...champs });
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

describe('ProfilPP.mettreAJour', () => {
  it('répartit les champs entre les blocs concernés', () => {
    const profil = creer({ ville: 'Abidjan', profession: 'Ingénieur' });

    profil.mettreAJour({ ville: 'Paris', nationalite: 'FR' });

    expect(profil.coordonnees.ville).toBe('Paris');
    expect(profil.identite.nationalite).toBe('FR');
    expect(profil.situationProfessionnelle.profession).toBe('Ingénieur');
  });

  it('signale si quelque chose a réellement changé', () => {
    const profil = creer({ ville: 'Paris' });

    expect(profil.mettreAJour({ ville: 'Paris' })).toBe(false);
    expect(profil.mettreAJour({ ville: 'Lyon' })).toBe(true);
    expect(profil.mettreAJour({ pep: true })).toBe(true);
  });

  it('laisse le profil intact quand un bloc refuse la déclaration', () => {
    // Les blocs sont tous construits avant la moindre affectation : la ville
    // valide ne doit pas être écrite si la nationalité est rejetée.
    const profil = creer({ ville: 'Paris' });

    expect(
      champFautif(() =>
        profil.mettreAJour({ ville: 'Lyon', nationalite: 'ZZ' }),
      ),
    ).toBe('nationalite');
    expect(profil.coordonnees.ville).toBe('Paris');
    expect(profil.identite.nationalite).toBeNull();
  });

  it('ne laisse aucune prise pour changer la catégorie PSFP', () => {
    const profil = creer();

    profil.mettreAJour({
      categoriePsfp: CategoriePsfp.PROFESSIONNEL,
      patrimoineDeclare: 10_000_000,
    } as unknown as ChampsDeclaresProfilPP);

    expect(profil.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(profil.patrimoineDeclare).toBeNull();
  });
});

describe('ProfilPP — règles qui traversent les blocs', () => {
  it("considère le profil entamé dès qu'une donnée KYC est déclarée", () => {
    expect(creer().aRenseigneSonProfil()).toBe(false);
    expect(creer({ profession: 'Ingénieur' }).aRenseigneSonProfil()).toBe(
      false,
    );
    expect(creer({ nationalite: 'FR' }).aRenseigneSonProfil()).toBe(true);
    expect(creer({ dateNaissance: ilYA(30) }).aRenseigneSonProfil()).toBe(true);
    expect(
      creer({ adresseLigne1: '12 rue de la Paix' }).aRenseigneSonProfil(),
    ).toBe(true);
  });
});

describe('ProfilPP.toJSON', () => {
  it('publie exactement les clés attendues par le front, et rien de privé', () => {
    const json = JSON.parse(
      JSON.stringify(creer({ nationalite: 'FR' })),
    ) as Record<string, unknown>;

    expect(Object.keys(json).sort()).toEqual(
      [
        'adresseLigne1',
        'adresseLigne2',
        'categoriePsfp',
        'civilite',
        'codePostal',
        'dateNaissance',
        'dernierContactAdmin',
        'lieuNaissance',
        'montantMaxConseille',
        'nationalite',
        'nif',
        'niveauRisque',
        'nomNaissance',
        'patrimoineDeclare',
        'pays',
        'paysNaissance',
        'pep',
        'prochainContactDu',
        'profession',
        'residenceFiscale',
        'secteurActivite',
        'utilisateurId',
        'ville',
      ].sort(),
    );
    // `createdAt` / `updatedAt` sont attribués par la persistance : absents du
    // JSON tant que le profil n'a pas été sauvegardé.
    expect(json.nationalite).toBe('FR');
    // Le découpage en blocs ne doit pas fuir dans la réponse HTTP.
    expect(json.identite).toBeUndefined();
    expect(Object.keys(json).some((cle) => cle.startsWith('_'))).toBe(false);
  });
});
