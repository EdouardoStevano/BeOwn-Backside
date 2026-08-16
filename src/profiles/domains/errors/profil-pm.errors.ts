import { ProfilesError, ProfilesErrorKind } from './profiles.error';

/** Aucun profil personne morale n'a encore été créé pour ce compte. */
export class ProfilPMIntrouvableError extends ProfilesError {
  readonly kind = ProfilesErrorKind.NOT_FOUND;

  constructor() {
    super('Profil PM non trouvé', { code: 'PROFIL_PM_INTROUVABLE' });
  }
}
