import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Un profil investisseur personne physique vient d'être modifié.
 *
 * Jumeau de `ProfilPPCreeDomainEvent`, et distinct de lui parce que ce sont
 * deux faits : compléter son dossier pour la première fois n'est pas le
 * corriger. Les abonnés d'aujourd'hui réagissent aux deux de la même façon,
 * ceux de demain n'en voudront peut-être qu'un — une relance d'onboarding
 * n'a de sens qu'à la création.
 *
 * Comme son jumeau, il ne transporte que l'identifiant du dossier : un abonné
 * qui a besoin de ce qui vient d'être déclaré relit le dossier.
 */
export class ProfilPPMisAJourDomainEvent implements DomainEvent {
  constructor(
    public readonly utilisateurId: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
