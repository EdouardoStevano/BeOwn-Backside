import { ChampsDeclaresProfilPM, ProfilPM } from './profil-pm';
import {
  CreerProfilPMProps,
  ProfilPMFactory,
} from '../factories/profil-pm.factory';
import { ChampProfilInvalideError } from '../errors';

/** SIREN valides au sens de la clé de Luhn — voir `siren.vo.spec.ts`. */
const SIREN = '404833048';
const AUTRE_SIREN = '552100554';

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

describe('ProfilPM.mettreAJour', () => {
  it('répartit les champs entre le bloc et les valeurs à plat', () => {
    const profil = creer({ secteurActivite: 'Immobilier' });

    profil.mettreAJour({ raisonSociale: 'BeOwn SAS', capitalSocial: 50_000 });

    expect(profil.identiteLegale.raisonSociale).toBe('BeOwn SAS');
    expect(profil.capitalSocial).toBe(50_000);
    expect(profil.secteurActivite).toBe('Immobilier');
  });

  it('ne touche que les champs présents', () => {
    const profil = creer({ siren: SIREN, siegeAdresse: '12 rue de la Paix' });

    profil.mettreAJour({ secteurActivite: 'Immobilier' });

    expect(profil.identiteLegale.siren).toBe(SIREN);
    expect(profil.siegeAdresse).toBe('12 rue de la Paix');
  });

  it('distingue « ne pas toucher » (undefined) de « effacer » (null)', () => {
    const profil = creer({ secteurActivite: 'Immobilier' });

    profil.mettreAJour({ secteurActivite: undefined });
    expect(profil.secteurActivite).toBe('Immobilier');

    profil.mettreAJour({ secteurActivite: null });
    expect(profil.secteurActivite).toBeNull();
  });

  it('soumet la mise à jour aux règles de la création', () => {
    const profil = creer({ siren: SIREN });

    expect(champFautif(() => profil.mettreAJour({ siren: '404833049' }))).toBe(
      'siren',
    );
    expect(champFautif(() => profil.mettreAJour({ capitalSocial: -1 }))).toBe(
      'capitalSocial',
    );
    // Le SIREN d'origine est intact : rien n'a été écrit.
    expect(profil.identiteLegale.siren).toBe(SIREN);
  });

  it("refuse d'effacer la raison sociale — la colonne est NOT NULL", () => {
    const profil = creer();

    expect(champFautif(() => profil.mettreAJour({ raisonSociale: null }))).toBe(
      'raisonSociale',
    );
    expect(profil.identiteLegale.raisonSociale).toBe('BeOwn');
  });

  it("rejoue la cohérence sur tout l'état, pas sur les seuls champs fournis", () => {
    const profil = creer({ siren: SIREN, rcsVille: 'Paris' });

    // La requête ne parle pas du greffe, et le laisse pourtant orphelin.
    expect(champFautif(() => profil.mettreAJour({ siren: null }))).toBe(
      'siren',
    );
    expect(profil.identiteLegale.siren).toBe(SIREN);
    expect(profil.identiteLegale.rcsVille).toBe('Paris');
  });

  it('laisse le profil intact quand un champ est refusé', () => {
    // Tout est construit avant la moindre affectation : le secteur valide ne
    // doit pas être écrit si le SIREN est rejeté.
    const profil = creer({ secteurActivite: 'Immobilier' });

    expect(
      champFautif(() =>
        profil.mettreAJour({ secteurActivite: 'Énergie', siren: '111111111' }),
      ),
    ).toBe('siren');
    expect(profil.secteurActivite).toBe('Immobilier');
  });

  it('signale si quelque chose a réellement changé', () => {
    const profil = creer({ secteurActivite: 'Immobilier' });

    expect(profil.mettreAJour({ secteurActivite: 'Immobilier' })).toBe(false);
    expect(profil.mettreAJour({ secteurActivite: 'Énergie' })).toBe(true);
    expect(profil.mettreAJour({ siren: SIREN })).toBe(true);
    expect(profil.mettreAJour({ siren: AUTRE_SIREN })).toBe(true);
  });

  it("n'offre aucune prise pour se désigner représentant légal", () => {
    // La clé existe dans le domaine — un import peut légitimement la poser —
    // mais le mapper applicatif ne la transmet jamais depuis un DTO.
    const profil = creer();

    profil.mettreAJour({
      representantId: 999,
      utilisateurId: 1,
    } as unknown as ChampsDeclaresProfilPM);

    expect(profil.aUnRepresentant()).toBe(true);
    expect(profil.utilisateurId).toBe(42);
  });
});
