import { AdequacyError, AdequacyErrorKind } from './adequacy.error';

/**
 * Une donnée déclarée au questionnaire d'adéquation ne respecte pas une règle
 * métier : format, borne, ou cohérence avec un autre champ.
 *
 * `field` voyage dans `details` plutôt que d'être seulement noyé dans le
 * message : le front peut ainsi surligner l'entrée fautive du formulaire sans
 * avoir à parser une phrase française.
 *
 * Le message ne reprend jamais la valeur saisie. Patrimoine, revenus et budget
 * sont des données personnelles, et la réponse d'erreur finit dans les logs
 * applicatifs comme dans ceux du reverse proxy.
 *
 * **Le nom de classe et le `code` sont ceux du contexte d'entrée en relation**,
 * qui porte la même erreur pour les champs de profil. C'est un doublon assumé,
 * pour la raison que §25 donne des socles d'erreurs : chaque contexte porte le
 * sien. Le `code` reste `CHAMP_PROFIL_INVALIDE` parce que c'est le contrat que
 * le front consomme — le scinder aurait fait de ce déplacement de fichiers un
 * changement d'API.
 *
 * @param label libellé du champ tel qu'affiché à l'utilisateur, en tête de
 *   phrase (« Le patrimoine net »), pour que le message se lise seul.
 * @param field nom technique du champ, celui du DTO.
 */
export class ChampProfilInvalideError extends AdequacyError {
  readonly kind = AdequacyErrorKind.INVALID_INPUT;

  constructor(label: string, raison: string, field: string) {
    super(`${label} ${raison}`, {
      code: 'CHAMP_PROFIL_INVALIDE',
      details: { field },
    });
  }
}
