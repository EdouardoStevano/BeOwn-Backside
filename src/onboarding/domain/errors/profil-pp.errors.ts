import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Un profil personne physique existe déjà pour ce compte.
 *
 * Le profil PP est en relation 1–1 avec l'utilisateur (clé primaire =
 * `utilisateurId`) : le créer deux fois écraserait silencieusement le premier,
 * puisque `save()` sur une entité dont la PK existe déjà est un UPDATE. La
 * mise à jour a sa propre route.
 */
export class ProfilPPDejaExistantError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor() {
    super('Profil PP déjà existant.', { code: 'PROFIL_PP_DEJA_EXISTANT' });
  }
}

/** Aucun profil personne physique n'a encore été créé pour ce compte. */
export class ProfilPPIntrouvableError extends ComplianceError {
  readonly kind = ComplianceErrorKind.NOT_FOUND;

  constructor() {
    super('Profil PP non trouvé', { code: 'PROFIL_PP_INTROUVABLE' });
  }
}
