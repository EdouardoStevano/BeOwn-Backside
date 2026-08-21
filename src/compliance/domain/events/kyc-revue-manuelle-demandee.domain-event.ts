import type { IEvent } from '@nestjs/cqrs';

/**
 * Le titulaire d'un dossier vient de demander une revue manuelle — le fait
 * métier, pas l'ordre de prévenir qui que ce soit.
 *
 * Il est levé une fois le dossier passé en `EN_REVUE` : avant, il n'y aurait
 * rien à annoncer, et la compliance pourrait être appelée sur un dossier dont
 * le passage en revue échoue ensuite.
 *
 * Ce que l'événement porte est volontairement mince — de quoi identifier le
 * dossier et son titulaire, pas l'état complet du KYC. Un abonné qui a besoin
 * de plus relit le dossier : l'état aura de toute façon pu changer entre
 * l'émission et la réaction (le webhook Stripe écrit sur la même ligne).
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; c'est une interface
 * marqueur, importée en `import type` et donc absente du code compilé. Le
 * domaine reste sans dépendance à l'exécution (§6 l'admet explicitement pour
 * les Domain Events, §12.1 l'interdit pour tout le reste).
 */
export class KycRevueManuelleDemandeeDomainEvent implements IEvent {
  constructor(
    public readonly kycId: string,
    public readonly utilisateurId: number,
    /** Ce qui a été inscrit au dossier comme cause du passage en revue. */
    public readonly motif: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
