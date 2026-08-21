import { ProjectsError, ProjectsErrorKind } from './projects.error';

/**
 * Un champ de la société de projet ne respecte pas sa règle métier.
 *
 * La SPV naissait jusqu'ici dans `ProjectController.createSpv` : douze
 * affectations sur un objet vide, valeurs par défaut comprises (§12.5). Aucune
 * de ses règles n'était donc énoncée quelque part — `raisonSociale` pouvait
 * être une chaîne d'espaces, `capitalSocial` négatif.
 */
export class ChampSpvInvalideError extends ProjectsError {
  readonly kind = ProjectsErrorKind.INVALID_INPUT;

  constructor(champ: string, raison: string) {
    super(`Champ « ${champ} » invalide : ${raison}`, {
      code: 'CHAMP_SPV_INVALIDE',
      details: { champ },
    });
  }
}
