import type { CollecteCapacity } from '../aggregates/collecte-capacity';
import type { InvestmentNaissant } from '../aggregates/investment';
import { InvestmentStatus } from '../enums/investment-status.enum';
import {
  PlafondPsfpDepasseSansConsentementError,
  ProjetDejaFinanceError,
  ProjetHorsCollecteError,
  TicketAuDessusDuMaximumError,
} from '../errors/subscription.errors';
import type { EligibilitePsfp } from '../value-objects/eligibilite-psfp';
import type { ProjetSouscriptible } from '../value-objects/projet-souscriptible';

/** Fenêtre légale de rétractation PSFP ouverte aux investisseurs non-avertis. */
export const DELAI_RETRACTATION_JOURS = 4;

/** Ce que tout chemin de souscription exige, quel que soit le mode de règlement. */
export interface DemandeDeSouscription {
  projet: ProjetSouscriptible;
  utilisateurId: number;
  nbFractions: number;
  /** Renseigné quand la souscription naît de la conversion d'une réservation. */
  reservationId?: string | null;
}

/**
 * Ce qu'exige en plus la souscription directe : le verdict réglementaire de
 * `compliance` sur l'investisseur (§3.4), sans lequel ni le plafond conseillé
 * ni la fenêtre de rétractation ne peuvent se décider.
 */
export interface DemandeDeSouscriptionDirecte extends DemandeDeSouscription {
  eligibilite: EligibilitePsfp;
  /** L'investisseur assume explicitement le dépassement du plafond conseillé. */
  consentementDepassementLimite?: boolean;
}

/**
 * **Naissance d'un investissement** (§23, §36.1) : le seul endroit où une
 * souscription peut se former.
 *
 * La Factory éprouve, dans l'ordre, tout ce qui conditionne la naissance :
 *
 * 1. le projet est **en collecte** — et « déjà financé » se distingue de « pas
 *    encore ouvert », deux refus au message différent (RG-INV) ;
 * 2. la collecte a encore **assez de fractions** — c'est
 *    {@link CollecteCapacity.allouer} qui tranche, seul propriétaire de
 *    l'invariant d'anti-survente (§6) ;
 * 3. le montant respecte le **ticket plafond** du projet (RG-INV-03) ;
 * 4. l'investisseur ne franchit pas le **plafond conseillé PSFP** sans
 *    consentement explicite (art. 21).
 *
 * Ces règles vivaient éparpillées dans `CreateInvestmentUseCase`, en une
 * douzaine de `if` mêlés à des verrous pessimistes, des débits de wallet et
 * des appels de notification. La Factory ne rend jamais un investissement à
 * moitié légitime : soit toutes les portes passent, soit une erreur de domaine
 * dit laquelle a refusé.
 *
 * L'éligibilité réglementaire de base (KYC validé) n'est pas éprouvée ici :
 * elle appartient à `compliance`, en amont (§3.4) — aujourd'hui via le
 * `KycValidatedGuard` monté devant la route, exactement comme sur
 * `reservation`.
 */
export class InvestmentFactory {
  /**
   * **Souscription directe** : les fonds sont débités dans la foulée, la
   * souscription naît ferme (`CONFIRME`) et la fenêtre de rétractation PSFP
   * s'ouvre pour les non-avertis.
   */
  static souscrire(
    demande: DemandeDeSouscriptionDirecte,
    capacite: CollecteCapacity,
    maintenant: Date = new Date(),
  ): InvestmentNaissant {
    const montant = InvestmentFactory.eprouverEtAllouer(demande, capacite);
    InvestmentFactory.eprouverPlafondPsfp(demande, montant);

    return {
      ...InvestmentFactory.entete(demande, montant),
      statut: InvestmentStatus.CONFIRME,
      delaiRetractationJusquAu: demande.eligibilite.estNonAverti
        ? finDeLaFenetreDeRetractation(maintenant)
        : null,
    };
  }

  /**
   * **Souscription par signature** : l'investissement naît `INITIE`, sans
   * débit, le temps que l'investisseur signe son bulletin chez le prestataire
   * de signature électronique. Il occupe déjà des fractions — d'où la même
   * allocation de capacité que la souscription directe.
   *
   * > ⚠️ Ce chemin n'éprouve **pas** le plafond conseillé PSFP, là où la
   * > souscription directe le fait. L'écart est celui du code d'origine, repris
   * > tel quel : le corriger ici resserrerait silencieusement une porte
   * > réglementaire sur un parcours en production. À trancher avec le RCCI —
   * > si le plafond doit s'appliquer partout (ce que §3.1 laisse entendre :
   * > « aucune opération financière ne doit pouvoir le contourner »), il suffit
   * > d'appeler `eprouverPlafondPsfp` ici aussi.
   */
  static initier(
    demande: DemandeDeSouscription,
    capacite: CollecteCapacity,
  ): InvestmentNaissant {
    const montant = InvestmentFactory.eprouverEtAllouer(demande, capacite);

    return {
      ...InvestmentFactory.entete(demande, montant),
      statut: InvestmentStatus.INITIE,
      delaiRetractationJusquAu: null,
    };
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  /** Portes 1 à 3 : projet ouvert, capacité disponible, ticket dans les bornes. */
  private static eprouverEtAllouer(
    demande: DemandeDeSouscription,
    capacite: CollecteCapacity,
  ): number {
    const { projet, nbFractions } = demande;

    if (!projet.enCollecte) {
      throw projet.dejaFinance
        ? new ProjetDejaFinanceError(projet.projetId)
        : new ProjetHorsCollecteError(projet.projetId);
    }

    capacite.allouer(nbFractions);

    const montant = nbFractions * projet.prixFraction;
    if (projet.ticketMaximum !== null && montant > projet.ticketMaximum) {
      throw new TicketAuDessusDuMaximumError(projet.ticketMaximum);
    }

    return montant;
  }

  /**
   * Porte 4 : le plafond conseillé par la catégorie PSFP de l'investisseur.
   * `null` = son statut ne recommande aucun plafond, la porte est ouverte.
   */
  private static eprouverPlafondPsfp(
    demande: DemandeDeSouscriptionDirecte,
    montant: number,
  ): void {
    const { plafondConseille } = demande.eligibilite;

    if (plafondConseille === null) return;
    if (montant <= plafondConseille) return;
    if (demande.consentementDepassementLimite) return;

    throw new PlafondPsfpDepasseSansConsentementError(
      plafondConseille,
      demande.eligibilite.patrimoineDeclare,
      demande.eligibilite.plancherPlafond,
      montant,
    );
  }

  /** La part de l'état qui ne dépend pas du chemin de souscription. */
  private static entete(demande: DemandeDeSouscription, montant: number) {
    return {
      projetId: demande.projet.projetId,
      utilisateurId: demande.utilisateurId,
      montant,
      instrument: demande.projet.instrument,
      nbTitres: demande.nbFractions,
      valeurTitre: demande.projet.prixFraction,
      bulletinDocId: null,
      signatureId: null,
      reservationId: demande.reservationId ?? null,
    };
  }
}

const finDeLaFenetreDeRetractation = (depuis: Date): Date => {
  const fin = new Date(depuis);
  fin.setDate(fin.getDate() + DELAI_RETRACTATION_JOURS);
  return fin;
};
