import { DemandeAccesPorteur } from 'src/porteur-access/domains/demande-acces-porteur';
import { CGU_VERSION_COURANTE } from 'src/porteur-access/domains/cgu-version';
import { DemandeAccesPorteurEntity } from '../entities/demande-acces-porteur.entity';

/**
 * Traduction entre le modèle de persistance et le modèle de domaine.
 *
 * Le mapping est EXPLICITE, champ par champ : un `Object.assign` laisserait
 * passer silencieusement une colonne ajoutée à l'entité et jamais lue par le
 * domaine — c'est exactement le bug qui a rendu `PATCH /users/me/type`
 * inopérant (ADR rôle relu en base, § 3).
 */
export const DemandeAccesPorteurMapper = {
  toDomain(entity: DemandeAccesPorteurEntity): DemandeAccesPorteur {
    return DemandeAccesPorteur.restaurer({
      id: entity.id,
      utilisateurId: entity.utilisateurId,
      statut: entity.statut,
      motivation: entity.motivation,
      // Défaut de repli : une ligne écrite avant la pose de la colonne sur un
      // environnement déployé n'a pas de version — on ne la fabrique pas, on
      // reprend celle qui était en vigueur au moment de la pose.
      cguVersionAcceptee: entity.cguVersionAcceptee ?? CGU_VERSION_COURANTE,
      soumiseLe: entity.soumiseLe,
      decideeLe: entity.decideeLe,
      decideurAdminId: entity.decideurAdminId,
      motifRefus: entity.motifRefus,
      motifRefusComplement: entity.motifRefusComplement,
    });
  },

  toPersistence(
    demande: DemandeAccesPorteur,
  ): Partial<DemandeAccesPorteurEntity> {
    const etat = demande.snapshot();
    return {
      // `id` omis quand il est null : c'est la base qui l'attribue.
      ...(etat.id ? { id: etat.id } : {}),
      utilisateurId: etat.utilisateurId,
      statut: etat.statut,
      motivation: etat.motivation,
      cguVersionAcceptee: etat.cguVersionAcceptee,
      soumiseLe: etat.soumiseLe,
      decideeLe: etat.decideeLe,
      decideurAdminId: etat.decideurAdminId,
      motifRefus: etat.motifRefus,
      motifRefusComplement: etat.motifRefusComplement,
    };
  },
};
