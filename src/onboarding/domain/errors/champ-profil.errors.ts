import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Une donnée déclarée sur un profil — personne physique ou morale — ne
 * respecte pas une règle métier : format, borne, ou cohérence avec un autre
 * champ.
 *
 * `field` voyage dans `details` plutôt que d'être seulement noyé dans le
 * message : le front peut ainsi surligner l'entrée fautive du formulaire de
 * complétion sans avoir à parser une phrase française.
 *
 * Le message ne reprend jamais la valeur saisie. Ces champs — date de
 * naissance, NIF, téléphone, SIREN — sont des données personnelles ou
 * d'entreprise, et la réponse d'erreur finit dans les logs applicatifs comme
 * dans ceux du reverse proxy.
 *
 * Cette classe vivait dans `profil-pp.errors.ts`, ce qui laissait croire
 * qu'elle appartenait au profil physique ; elle sert les deux, d'où ce fichier
 * neutre.
 *
 * @param label libellé du champ tel qu'affiché à l'utilisateur, en tête de
 *   phrase (« La raison sociale »), pour que le message se lise seul.
 * @param field nom technique du champ, celui du DTO.
 */
export class ChampProfilInvalideError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(label: string, raison: string, field: string) {
    super(`${label} ${raison}`, {
      code: 'CHAMP_PROFIL_INVALIDE',
      details: { field },
    });
  }
}
