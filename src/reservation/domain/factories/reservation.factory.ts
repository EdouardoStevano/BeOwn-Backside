import { ReservationNaissante } from '../aggregates/reservation';
import { ReservationCapacity } from '../aggregates/reservation-capacity';
import { ReservationStatus } from '../enums/reservation-status.enum';
import {
  MontantReserveInvalideError,
  PreInvestissementNonActiveError,
  ProjetHorsFenetreDePreInvestissementError,
  TicketAuDessusDuMaximumError,
  TicketSousLeMinimumError,
} from '../errors/reservation.errors';
import type { ReservationRankingPolicy } from '../policies/reservation-ranking.policy';
import type { ProjetReservable } from '../value-objects/projet-reservable';

export interface DemandeDeReservation {
  projet: ProjetReservable;
  utilisateurId: number;
  montant: number;
}

/**
 * **Naissance d'une réservation** (§23) : le seul endroit où un engagement
 * de pré-investissement peut se former.
 *
 * La Factory éprouve, dans l'ordre, tout ce qui conditionne la naissance :
 *
 * 1. le projet est dans la fenêtre ANNONCÉ et le pré-investissement y est
 *    activé (RG-RES) ;
 * 2. le montant est positif et respecte les bornes de ticket du projet
 *    (RG-INV-02/03 appliqués à la réservation) ;
 * 3. la file a encore la capacité de l'accueillir — c'est
 *    {@link ReservationCapacity.allouer} qui tranche (RG-RES-05) et attribue
 *    le rang selon la politique en vigueur (RG-RES-07).
 *
 * Ces règles vivaient éparpillées dans `CreateReservationUseCase`, en cinq
 * `if` sur l'agrégat d'un autre contexte ; le rang venait d'un `MAX+1` posé
 * par le repository. La Factory ne rend jamais une réservation à moitié
 * légitime : soit toutes les portes passent et l'engagement naît `EN_ATTENTE`
 * avec son rang, soit une erreur de domaine dit laquelle a refusé.
 *
 * L'éligibilité de l'investisseur (RG-RES-03 : KYC validé) n'est pas éprouvée
 * ici : elle appartient à `compliance`, en amont (§3.4) — aujourd'hui via le
 * `KycValidatedGuard` monté devant la route. Le jour où `compliance` publie
 * un verdict consommable, c'est une `EligibleInvestorSpecification` (§22)
 * qui viendra s'insérer en porte 0, commune avec `subscription`.
 */
export class ReservationFactory {
  static creer(
    demande: DemandeDeReservation,
    capacite: ReservationCapacity,
    politique: ReservationRankingPolicy,
  ): ReservationNaissante {
    const { projet, montant } = demande;

    if (!projet.enPhaseAnnonce) {
      throw new ProjetHorsFenetreDePreInvestissementError(projet.projetId);
    }
    if (!projet.preInvestissementActive) {
      throw new PreInvestissementNonActiveError(projet.projetId);
    }

    if (!Number.isFinite(montant) || montant <= 0) {
      throw new MontantReserveInvalideError(montant);
    }
    if (montant < projet.ticketMinimum) {
      throw new TicketSousLeMinimumError(projet.ticketMinimum);
    }
    if (projet.ticketMaximum !== null && montant > projet.ticketMaximum) {
      throw new TicketAuDessusDuMaximumError(projet.ticketMaximum);
    }

    const rang = capacite.allouer(montant, politique);

    return {
      projetId: projet.projetId,
      utilisateurId: demande.utilisateurId,
      montantReserve: montant,
      rangFile: rang.valeur,
      statut: ReservationStatus.EN_ATTENTE,
      confirmationJusquAu: null,
      investissementId: null,
    };
  }
}
