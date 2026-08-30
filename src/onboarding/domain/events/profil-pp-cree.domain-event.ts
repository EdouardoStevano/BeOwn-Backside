import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Un profil investisseur personne physique vient d'être complété.
 *
 * Il est levé une fois le dossier persisté : avant, il n'y aurait rien à
 * annoncer, et un abonné agirait sur un profil dont la création peut encore
 * échouer.
 *
 * **Il ne transporte que l'identifiant du dossier.** Il a porté un temps le
 * numéro de téléphone déclaré, du temps où celui-ci vivait sur le compte et
 * devait lui être relayé. Le dossier le garde désormais avec le reste de ses
 * coordonnées : un abonné qui a besoin de ce qui a été déclaré relit le
 * dossier, comme pour n'importe quel autre champ.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; interface marqueur,
 * importée en `import type`, donc absente du code compilé (§6 / §12.1).
 */
export class ProfilPPCreeDomainEvent implements DomainEvent {
  constructor(
    public readonly utilisateurId: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
