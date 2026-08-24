import type { DomainEvent } from 'src/shared/kernel/domain/domain-event';

/**
 * **Le fait central du Core Domain** (§3.4) : à l'ouverture de la collecte,
 * la réservation est devenue un investissement, en priorité de rang.
 *
 * C'est le contrat publié (Published Language) de la relation
 * `reservation → subscription` : le contexte aval ne connaît jamais l'agrégat
 * `Reservation`, seulement ce fait et ses champs. Perdre ce fait, c'est un
 * investisseur qui a payé sans jamais recevoir son obligation — le jour où la
 * conversion automatique est branchée, sa publication devra passer par un
 * Outbox (§19), pas par un `publish` après commit.
 *
 * Personne ne le publie encore : la conversion est aujourd'hui un geste manuel
 * du back-office. Le fait est défini ici pour que `subscription` se construise
 * contre le contrat, pas contre l'agrégat.
 */
export class ReservationConvertieDomainEvent implements DomainEvent {
  constructor(
    public readonly reservationId: string,
    public readonly projetId: string,
    public readonly utilisateurId: number,
    public readonly montant: number,
    public readonly rang: number | null,
    public readonly investissementId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
