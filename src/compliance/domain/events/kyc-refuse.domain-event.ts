import type { IEvent } from '@nestjs/cqrs';

/**
 * Un dossier vient d'être refusé par une décision humaine.
 *
 * Événement distinct de {@link KycValideDomainEvent} plutôt qu'une « décision »
 * unique portant un statut : ce sont deux faits différents, dont les
 * conséquences n'ont rien en commun — l'un ouvre l'accès aux opérations
 * financières, l'autre demande au titulaire de recommencer. Un abonné à venir
 * (déblocage du wallet, relance à J+7) ne concernera jamais que l'un des deux,
 * et le refus est le seul à porter un motif : le fondre dans un événement
 * commun y laisserait un champ vide une fois sur deux.
 *
 * `IEvent` est le seul emprunt de ce fichier à NestJS ; interface marqueur,
 * importée en `import type`, donc absente du code compilé (§6 / §12.1).
 */
export class KycRefuseDomainEvent implements IEvent {
  constructor(
    public readonly kycId: string,
    public readonly utilisateurId: number,
    /** Ce qui est opposé au titulaire ; `null` si l'admin n'a rien motivé. */
    public readonly motifRefus: string | null,
    /** Compte de l'administrateur qui a tranché — tracé pour l'audit. */
    public readonly decidePar: number,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
