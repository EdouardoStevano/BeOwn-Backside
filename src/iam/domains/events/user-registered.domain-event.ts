import type { IEvent } from '@nestjs/cqrs';

/**
 * Un compte vient d'être créé — le fait métier, pas l'ordre de faire quelque
 * chose. Il est levé une fois l'utilisateur persisté : avant, il n'y aurait
 * rien à annoncer, et un abonné pourrait réagir à une inscription qui échoue
 * ensuite.
 *
 * Ce que l'événement porte est volontairement mince : de quoi identifier le
 * compte et l'annoncer, pas son état complet. Un abonné qui a besoin de plus
 * relit le compte — l'état aura de toute façon pu changer entre l'émission et
 * la réaction.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; c'est une interface
 * marqueur, importée en `import type` et donc absente du code compilé. Le
 * domaine reste sans dépendance à l'exécution (§6 l'admet explicitement pour
 * les Domain Events, §12.1 l'interdit pour tout le reste).
 */
export class UserRegisteredDomainEvent implements IEvent {
  constructor(
    public readonly userId: number,
    public readonly email: string,
    public readonly firstname: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
