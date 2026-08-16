import { ProfilPM } from 'src/profiles/domains/profil-pm';

export const PROFIL_PM_REPOSITORY = Symbol('PROFIL_PM_REPOSITORY');

/**
 * Accès en persistance au profil personne morale.
 *
 * Pas de `update` : le profil PM n'a aujourd'hui aucun flux de modification —
 * `save` sur une clé primaire existante ferait un UPDATE, mais aucun use case
 * ne l'emprunte. Le port décrit ce dont le domaine a besoin, pas ce que
 * TypeORM sait faire ; la méthode viendra avec le use case qui la réclame.
 *
 * Voir {@link ProfilPPRepository} pour le pourquoi du découpage par agrégat.
 */
export interface ProfilPMRepository {
  save(profil: ProfilPM): Promise<ProfilPM>;
  findByUserId(userId: number): Promise<ProfilPM | null>;
}
