import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Une donnée posée à l'ouverture d'un dossier ne respecte pas une règle métier.
 *
 * `field` voyage dans `details` plutôt que d'être seulement noyé dans le
 * message, pour que le front puisse désigner l'entrée fautive sans parser une
 * phrase française. Le message ne reprend jamais la valeur reçue : la réponse
 * d'erreur finit dans les logs applicatifs comme dans ceux du reverse proxy.
 *
 * Jumelle de `ChampProfilInvalideError` du contexte Profiles, dont la fabrique
 * KYC se servait avant le découpage. Le `code` change en conséquence —
 * `CHAMP_KYC_INVALIDE` et non plus `CHAMP_PROFIL_INVALIDE` : un dossier de
 * vérification d'identité n'est pas un profil, et aucun des deux chemins qui
 * lèvent cette erreur n'est atteignable depuis une entrée utilisateur
 * (`utilisateurId` vient du JWT, `fournisseur` n'est jamais fourni par
 * l'appelant).
 *
 * @param label libellé du champ tel qu'affiché, en tête de phrase, pour que le
 *   message se lise seul.
 * @param field nom technique du champ.
 */
export class ChampKycInvalideError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(label: string, raison: string, field: string) {
    super(`${label} ${raison}`, {
      code: 'CHAMP_KYC_INVALIDE',
      details: { field },
    });
  }
}
