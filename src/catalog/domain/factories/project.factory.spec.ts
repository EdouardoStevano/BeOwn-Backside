import { ModeleEconomique } from '../enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from '../enums/project-status.enum';
import { ChampProjetInvalideError } from '../errors/project.errors';
import { CreerProjetProps, ProjectFactory } from './project.factory';

const valides: CreerProjetProps = {
  titre: 'Résidence Les Arcs — Lyon',
  type: ProjectType.RESIDENTIEL,
  capitalCible: 500_000,
  capitalMinimum: 300_000,
  dureeMois: 24,
  instrument: ProjectInstrument.OBLIGATION,
};

const creer = (surcharge: Partial<CreerProjetProps> = {}) =>
  ProjectFactory.creer({ ...valides, ...surcharge });

describe('ProjectFactory', () => {
  describe('slug', () => {
    it('le dérive du titre : minuscules, accents dépliés, ponctuation retirée', () => {
      expect(creer().slug).toBe('residence-les-arcs-lyon');
    });

    it('respecte celui qui est fourni', () => {
      expect(creer({ slug: 'mon-slug' }).slug).toBe('mon-slug');
    });

    it('ne laisse pas de tiret de bord — le trim se fait avant le découpage', () => {
      expect(creer({ titre: '  Résidence  ' }).slug).toBe('residence');
    });

    it('refuse un titre dont il ne reste rien de lisible', () => {
      expect(() => creer({ titre: '???' })).toThrow(ChampProjetInvalideError);
    });

    it('refuse un titre vide', () => {
      expect(() => creer({ titre: '   ' })).toThrow(ChampProjetInvalideError);
    });
  });

  describe('statut de départ', () => {
    it('est brouillon par défaut', () => {
      expect(creer().statut).toBe(ProjectStatus.BROUILLON);
    });

    it('accepte annonce — la première case de la table des transitions', () => {
      expect(creer({ statut: ProjectStatus.ANNONCE }).statut).toBe(
        ProjectStatus.ANNONCE,
      );
    });

    it.each([
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.FINANCE,
      ProjectStatus.CLOTURE,
      ProjectStatus.ANNULE,
    ])('refuse de naître %s', (statut) => {
      expect(() => creer({ statut })).toThrow(ChampProjetInvalideError);
    });
  });

  describe('ce que l’appelant ne décide pas', () => {
    it('aucun horodatage de diffusion', () => {
      const projet = creer();
      expect(projet.broadcastAnnonceAt).toBeNull();
      expect(projet.broadcastCollecteAt).toBeNull();
    });

    it('modèle économique obligataire par défaut', () => {
      expect(creer().modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
    });

    it('pas de porteur si le dossier n’en désigne pas', () => {
      expect(creer().porteurId).toBeNull();
    });
  });

  it('éprouve les blocs à la naissance', () => {
    expect(() => creer({ capitalMinimum: 999_999 })).toThrow(
      ChampProjetInvalideError,
    );
    expect(() => creer({ latitude: 45.75 })).toThrow(ChampProjetInvalideError);
    expect(() =>
      creer({
        datePublication: '2026-06-01',
        dateOuvertureCollecte: '2026-01-01',
      }),
    ).toThrow(ChampProjetInvalideError);
  });
});
