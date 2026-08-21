import { ProjectStatus } from '../enums/project-status.enum';
import { TransitionStatutProjetInvalideError } from '../errors/project.errors';
import { StatutProjet } from './statut-projet.vo';

describe('StatutProjet', () => {
  it('naît brouillon', () => {
    expect(StatutProjet.initial().valeur).toBe(ProjectStatus.BROUILLON);
  });

  describe('allerVers', () => {
    it.each([
      [ProjectStatus.BROUILLON, ProjectStatus.ANNONCE],
      [ProjectStatus.ANNONCE, ProjectStatus.PRE_INVESTISSEMENT],
      [ProjectStatus.ANNONCE, ProjectStatus.EN_COLLECTE],
      [ProjectStatus.PRE_INVESTISSEMENT, ProjectStatus.EN_COLLECTE],
      [ProjectStatus.EN_COLLECTE, ProjectStatus.FINANCE],
      [ProjectStatus.EN_COLLECTE, ProjectStatus.ECHEC],
      [ProjectStatus.FINANCE, ProjectStatus.EN_EXPLOITATION],
      [ProjectStatus.EN_EXPLOITATION, ProjectStatus.CLOTURE],
    ])('autorise %s → %s', (depuis, vers) => {
      expect(StatutProjet.restore(depuis).allerVers(vers).valeur).toBe(vers);
    });

    it.each([
      [ProjectStatus.BROUILLON, ProjectStatus.EN_COLLECTE],
      [ProjectStatus.EN_COLLECTE, ProjectStatus.ANNULE],
      [ProjectStatus.FINANCE, ProjectStatus.CLOTURE],
      [ProjectStatus.CLOTURE, ProjectStatus.EN_COLLECTE],
      [ProjectStatus.ECHEC, ProjectStatus.ANNONCE],
      [ProjectStatus.ANNULE, ProjectStatus.BROUILLON],
    ])('refuse %s → %s', (depuis, vers) => {
      expect(() => StatutProjet.restore(depuis).allerVers(vers)).toThrow(
        TransitionStatutProjetInvalideError,
      );
    });

    it('refuse de rester sur place — rejouer une ouverture de collecte relancerait la diffusion', () => {
      expect(() =>
        StatutProjet.restore(ProjectStatus.EN_COLLECTE).allerVers(
          ProjectStatus.EN_COLLECTE,
        ),
      ).toThrow(TransitionStatutProjetInvalideError);
    });
  });

  describe('cloturerApresSortie', () => {
    it.each([ProjectStatus.FINANCE, ProjectStatus.EN_EXPLOITATION])(
      'clôture depuis %s',
      (depuis) => {
        expect(StatutProjet.restore(depuis).cloturerApresSortie().valeur).toBe(
          ProjectStatus.CLOTURE,
        );
      },
    );

    it('refuse depuis un projet encore en collecte', () => {
      expect(() =>
        StatutProjet.restore(ProjectStatus.EN_COLLECTE).cloturerApresSortie(),
      ).toThrow(TransitionStatutProjetInvalideError);
    });
  });

  describe('visibilité', () => {
    it('un brouillon n’est ni public ni ouvert aux investisseurs', () => {
      const brouillon = StatutProjet.restore(ProjectStatus.BROUILLON);
      expect(brouillon.estBrouillon).toBe(true);
      expect(brouillon.estPublic).toBe(false);
      expect(brouillon.estOuvertAuxInvestisseurs).toBe(false);
    });

    it('une annonce est publique mais pas encore ouverte aux investisseurs', () => {
      const annonce = StatutProjet.restore(ProjectStatus.ANNONCE);
      expect(annonce.estPublic).toBe(true);
      expect(annonce.estOuvertAuxInvestisseurs).toBe(false);
    });

    it('un projet financé reste public et ouvert', () => {
      const finance = StatutProjet.restore(ProjectStatus.FINANCE);
      expect(finance.estPublic).toBe(true);
      expect(finance.estOuvertAuxInvestisseurs).toBe(true);
    });

    it('un projet annulé sort du catalogue', () => {
      expect(StatutProjet.restore(ProjectStatus.ANNULE).estPublic).toBe(false);
    });
  });
});
