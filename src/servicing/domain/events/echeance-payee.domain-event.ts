import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * Une échéance a été réglée : l'investisseur a été crédité du net, et la
 * retenue à la source a été versée aux wallets séquestres IR et CSG
 * (RG-ECH-04/05).
 *
 * `regulatory-reporting` consomme ce fait pour l'IFU (§3.3) — les montants
 * fiscaux sont calculés ici, une fois, et jamais recalculés en aval.
 */
export class EcheancePayeeDomainEvent implements DomainEvent {
  constructor(
    public readonly echeanceId: string,
    public readonly investissementId: string,
    public readonly projetId: string,
    public readonly montantNet: number,
    public readonly prelevementIR: number,
    public readonly prelevementCSG: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
