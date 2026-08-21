import { ProjectsError, ProjectsErrorKind } from './projects.error';

/**
 * Un compte ne donne qu'un avis par projet.
 *
 * ⚠️ Cette règle appartient au contexte **Avis**, pas à Projects. Elle est
 * énoncée ici parce que les deux routes qui la portent — `GET/POST
 * /projects/:id/avis` — sont publiées par ce contexte et sont, aujourd'hui, le
 * seul chemin d'écriture d'un avis. Les sortir de `ProjectController` (où elles
 * fabriquaient l'agrégat `Avis` à la main, §12.5) est le premier pas ; le
 * second est de les déplacer dans `src/avis/`, avec cette erreur. Voir
 * `SoumettreAvisProjetUseCase`.
 *
 * `INVALID_INPUT` et non `CONFLICT` : la `BadRequestException` remplacée
 * rendait un 400, et le front s'appuie dessus.
 */
export class AvisDejaSoumisError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor() {
    super('Vous avez déjà soumis un avis pour ce projet.', {
      code: 'AVIS_DEJA_SOUMIS',
    });
  }
}
