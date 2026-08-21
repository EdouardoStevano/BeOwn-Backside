import { IamError, IamErrorKind } from './iam.error';

/** Aucun profil personne morale n'a encore été créé pour ce compte. */
export class ProfilPMIntrouvableError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;

  constructor() {
    super('Profil PM non trouvé', { code: 'PROFIL_PM_INTROUVABLE' });
  }
}
