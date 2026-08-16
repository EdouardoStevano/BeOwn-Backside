import { ProfilesError, ProfilesErrorKind } from './profiles.error';

/**
 * Une décision manuelle a été prise sur un dossier qui n'est pas en revue.
 *
 * Le KYC est validé **automatiquement** par Stripe Identity (webhook
 * `identity.verification_session.verified`). L'administration n'intervient que
 * lorsque le fournisseur n'a pas su trancher : le dossier passe alors en
 * `EN_REVUE` et attend une décision humaine. Un dossier déjà auto-validé, ou
 * pas encore soumis, est en lecture seule pour l'admin — sans cette règle, une
 * validation manuelle pourrait recouvrir une décision du fournisseur, ou
 * valider un dossier dont aucune pièce n'a jamais été examinée.
 *
 * La règle vivait dans `ProfileController.patchKycStatus`, qui levait une
 * `ConflictException` : du métier dans la couche présentation (§12.5), et une
 * règle inaccessible à tout autre point d'entrée. Le message est repris mot
 * pour mot, et `ProfilesErrorFilter` rend le même 409 — avec un `code` stable
 * en plus.
 */
export class KycPasEnRevueManuelleError extends ProfilesError {
  readonly kind = ProfilesErrorKind.CONFLICT;

  constructor() {
    super(
      "Ce dossier n'est pas en revue manuelle : il a été validé automatiquement par Stripe Identity, ou n'a pas encore été soumis pour vérification. Seuls les dossiers en revue manuelle peuvent faire l'objet d'une décision manuelle.",
      { code: 'KYC_PAS_EN_REVUE_MANUELLE' },
    );
  }
}
