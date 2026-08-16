import { ProfilesError, ProfilesErrorKind } from './profiles.error';

/**
 * Une donnée déclarée sur le profil personne physique ne respecte pas une
 * règle métier : format, borne, ou cohérence avec un autre champ.
 *
 * `field` voyage dans `details` plutôt que d'être seulement noyé dans le
 * message : le front peut ainsi surligner l'entrée fautive du formulaire de
 * complétion sans avoir à parser une phrase française.
 *
 * Le message ne reprend jamais la valeur saisie. Ces champs — date de
 * naissance, NIF, téléphone — sont des données personnelles au sens du RGPD,
 * et la réponse d'erreur finit dans les logs applicatifs comme dans ceux du
 * reverse proxy.
 *
 * @param label libellé du champ tel qu'affiché à l'utilisateur, en tête de
 *   phrase (« La date de naissance »), pour que le message se lise seul.
 * @param field nom technique du champ, celui du DTO.
 */
export class ChampProfilInvalideError extends ProfilesError {
  readonly kind = ProfilesErrorKind.INVALID_INPUT;

  constructor(label: string, raison: string, field: string) {
    super(`${label} ${raison}`, {
      code: 'CHAMP_PROFIL_INVALIDE',
      details: { field },
    });
  }
}

/**
 * Un profil personne physique existe déjà pour ce compte.
 *
 * Le profil PP est en relation 1–1 avec l'utilisateur (clé primaire =
 * `utilisateurId`) : le créer deux fois écraserait silencieusement le premier,
 * puisque `save()` sur une entité dont la PK existe déjà est un UPDATE. La
 * mise à jour a sa propre route.
 */
export class ProfilPPDejaExistantError extends ProfilesError {
  readonly kind = ProfilesErrorKind.CONFLICT;

  constructor() {
    super('Profil PP déjà existant.', { code: 'PROFIL_PP_DEJA_EXISTANT' });
  }
}

/** Aucun profil personne physique n'a encore été créé pour ce compte. */
export class ProfilPPIntrouvableError extends ProfilesError {
  readonly kind = ProfilesErrorKind.NOT_FOUND;

  constructor() {
    super('Profil PP non trouvé', { code: 'PROFIL_PP_INTROUVABLE' });
  }
}
