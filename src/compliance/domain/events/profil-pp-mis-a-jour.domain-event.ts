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
 * Il porte le numéro déclaré pour la même raison que son jumeau : le dossier
 * ne le garde pas, il appartient au compte. `undefined` signifie « le
 * formulaire n'en portait pas », ce qui n'est pas `null` — voir
 * `User.changerTelephone`.
 */
export class ProfilPPMisAJourDomainEvent implements DomainEvent {
  constructor(
    public readonly utilisateurId: number,
    public readonly telephoneDeclare: string | undefined,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
