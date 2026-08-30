import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/** Aucun profil personne morale n'a encore été créé pour ce compte. */
export class ProfilPMIntrouvableError extends ComplianceError {
  readonly kind = ComplianceErrorKind.NOT_FOUND;

  constructor() {
    super('Profil PM non trouvé', { code: 'PROFIL_PM_INTROUVABLE' });
  }
}
