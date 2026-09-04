import { readFileSync } from 'fs';
import { join } from 'path';
import { sync as glob } from 'glob';
import {
  EXCEPTION_FILTERS_METADATA,
  FILTER_CATCH_EXCEPTIONS,
} from '@nestjs/common/constants';
import { ConflitsInteretsErrorFilter } from './conflits-interets-error.filter';
import { InvestmentController } from 'src/investments/presenters/http/investment.controller';
import { ReservationController } from 'src/reservations/presenters/http/reservation.controller';
import { SecondaryMarketController } from 'src/secondarymarket/presenters/http/secondary-market.controller';
import { ProjectController } from 'src/projects/presenters/http/project.controller';

/**
 * COMPLÉTUDE du branchement — le défaut que le commentaire du filtre craignait.
 *
 * La traduction des refus de conflit d'intérêts repose sur un `@UseFilters` de
 * portée CONTRÔLEUR (voir `conflits-interets-statut-http.spec.ts` pour la
 * raison : un attrape-tout global passe avant tout `APP_FILTER`). Cette
 * mécanique a un défaut connu — il suffit d'un contrôleur oublié, aujourd'hui
 * ou dans six mois, pour qu'une porte d'entrée reparte en 500.
 *
 * Ce fichier ferme la porte de deux façons :
 *  1. par une lecture des SOURCES : tout fichier `*.controller.ts` du dépôt qui
 *     référence un use case gardé doit déclarer le filtre. Un contrôleur
 *     nouveau, où qu'il vive, est donc couvert sans qu'on ait à l'inscrire ici ;
 *  2. par les MÉTADONNÉES Nest réelles des quatre contrôleurs branchés — un
 *     `@UseFilters` mal écrit, ou perdu à la faveur d'un refactor de
 *     décorateurs, ne passerait pas.
 */

/** Racine `src/`, quel que soit le répertoire d'exécution de Jest. */
const RACINE_SRC = join(__dirname, '..', '..', '..', '..');

/**
 * Use cases portant la garde D5. Cette liste est la seule chose à tenir à jour
 * quand un huitième flux sera gardé — et le test de câblage ci-dessous dira
 * aussitôt quels contrôleurs doivent suivre.
 */
const USE_CASES_GARDES = [
  'CreateInvestmentUseCase',
  'InitiateInvestmentUseCase',
  'TopUpInvestmentUseCase',
  'CreateReservationUseCase',
  'InitiateBuyUseCase',
  'ExprimerInteretUseCase',
  'RepondreInteretUseCase',
  'CreateProjectUseCase',
];

describe('Conflits d’intérêts — complétude du branchement', () => {
  it('tout contrôleur qui consomme un use case gardé déclare le filtre', () => {
    const controleurs = glob('**/*.controller.ts', {
      cwd: RACINE_SRC,
      ignore: ['**/*.spec.ts'],
    });

    // Garde-fou du garde-fou : si le glob ne trouve plus rien (chemin cassé),
    // le test passerait à vide et ne protégerait plus personne.
    expect(controleurs.length).toBeGreaterThan(5);

    const manquants = controleurs.filter((chemin) => {
      const source = readFileSync(join(RACINE_SRC, chemin), 'utf-8');
      const consommeUnFluxGarde = USE_CASES_GARDES.some((useCase) =>
        source.includes(useCase),
      );
      if (!consommeUnFluxGarde) return false;
      return !source.includes('ConflitsInteretsErrorFilter');
    });

    expect(manquants).toEqual([]);
  });

  it.each([
    ['InvestmentController', InvestmentController],
    ['ReservationController', ReservationController],
    ['SecondaryMarketController', SecondaryMarketController],
    ['ProjectController', ProjectController],
  ])(
    '%s porte réellement le filtre dans ses métadonnées Nest',
    (_nom, controleur) => {
      const filtres: unknown[] =
        Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, controleur) ?? [];

      // Les métadonnées portent des INSTANCES ou des classes selon l'écriture ;
      // on accepte les deux, comme Nest lui-même.
      const porteLeFiltre = filtres.some(
        (f) =>
          f === ConflitsInteretsErrorFilter ||
          f instanceof ConflitsInteretsErrorFilter,
      );

      expect(porteLeFiltre).toBe(true);
    },
  );

  it('le filtre n’attrape QUE les erreurs de conflit d’intérêts', () => {
    // Un `@Catch()` élargi par mégarde ferait de ce filtre un second
    // attrape-tout — exactement le problème qu'on vient de corriger.
    const attrapees: unknown[] =
      Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, ConflitsInteretsErrorFilter) ??
      [];

    expect(attrapees).toHaveLength(1);
    expect((attrapees[0] as { name: string }).name).toBe('ConflitsInteretsError');
  });
});
