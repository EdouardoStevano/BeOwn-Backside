/**
 * Tableau d'affichage — art. 25 du règlement (UE) 2020/1503.
 *
 * Le règlement autorise un prestataire à exploiter un tableau d'affichage sur
 * lequel ses clients ANNONCENT un intérêt à acheter ou vendre. Il pose en
 * contrepartie une limite stricte, art. 25(1) : ce tableau
 *
 *   « ne consiste pas à rapprocher des intérêts acheteurs et vendeurs de
 *     manière à aboutir à un contrat »
 *
 * — ce qui serait la définition d'un système multilatéral de négociation,
 * réservé aux entreprises de marché agréées sous MiFID II et donc INTERDIT à
 * un prestataire de services de financement participatif.
 *
 * D'où l'architecture retenue : le prestataire publie des annonces et met en
 * relation, mais n'apparie jamais. La rencontre des volontés passe par une
 * acceptation EXPLICITE du vendeur ; sans elle, aucun contrat n'est formé.
 *
 * Art. 25(2) : les investisseurs doivent être informés que le prestataire
 * n'exploite pas un système de négociation et que l'achat comme la vente
 * relèvent de leur seule appréciation et responsabilité.
 *
 * Art. 25(4) : lorsqu'un prix de référence est suggéré, le prestataire doit
 * indiquer s'il est contraignant ou non et justifier sa méthode de valorisation.
 */

// Enum de domaine pur (aucune dépendance framework ni ORM) : l'importer évite
// de dupliquer ici le littéral d'un statut appartenant au domaine `projects`.
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

/** Le prix affiché est indicatif : les parties restent libres de leur accord. */
export const PRIX_REFERENCE_CONTRAIGNANT = false;

/** Art. 25(2) — mention à afficher partout où des annonces sont présentées. */
export const MENTION_NON_SYSTEME_DE_NEGOCIATION =
  "BeOwn n'exploite pas un système de négociation. Ce tableau d'affichage permet " +
  "uniquement à des investisseurs de faire connaître leur intérêt à acheter ou à " +
  "vendre. Aucune offre n'est appariée automatiquement : la cession suppose " +
  "l'accord explicite du vendeur et de l'acheteur, sous leur seule responsabilité. " +
  "Rien ne garantit qu'un acheteur se manifeste, ni dans quel délai, ni à quel prix.";

/** Art. 25(4) — justification de la méthode de valorisation du prix indicatif. */
export const METHODE_PRIX_REFERENCE =
  "Le prix de référence affiché est celui fixé librement par le vendeur. BeOwn ne " +
  "le valide pas et n'émet aucune opinion sur sa pertinence. Il n'est pas " +
  "contraignant : il ne préjuge ni de la valeur réelle des parts, ni du prix " +
  "auquel une cession pourra effectivement intervenir.";

/**
 * Étapes de vie d'une annonce. `INTERET_EXPRIME` est le point de bascule qui
 * distingue un tableau d'affichage d'un carnet d'ordres : l'intérêt d'un
 * acheteur ne fait rien d'autre que solliciter le vendeur.
 */
export enum EtapeAnnonce {
  /** Publiée, visible, sans intérêt exprimé. */
  PUBLIEE = 'publiee',
  /** Un acheteur s'est manifesté ; le vendeur doit se prononcer. */
  INTERET_EXPRIME = 'interet_exprime',
  /** Le vendeur a accepté : les parties peuvent contracter. */
  ACCEPTEE = 'acceptee',
  /** La cession est réalisée. */
  EXECUTEE = 'executee',
}

export interface ExpressionInteret {
  acheteurId: number;
  vendeurId: number;
  nbFractionsDemandees: number;
  nbFractionsDisponibles: number;
}

export interface VerdictInteret {
  recevable: boolean;
  motif: string | null;
}

/**
 * Contrôle la recevabilité d'une expression d'intérêt. Volontairement pauvre :
 * le prestataire vérifie la cohérence de la demande, rien de plus. Il ne
 * classe pas, ne priorise pas et n'attribue pas — trois comportements qui
 * feraient basculer le tableau d'affichage en système de négociation.
 */
export function verifierInteret(interet: ExpressionInteret): VerdictInteret {
  if (interet.acheteurId === interet.vendeurId) {
    return {
      recevable: false,
      motif: 'Vous ne pouvez pas vous porter acquéreur de votre propre annonce.',
    };
  }
  if (interet.nbFractionsDemandees < 1) {
    return { recevable: false, motif: 'Le nombre de fractions doit être au moins de 1.' };
  }
  if (interet.nbFractionsDemandees > interet.nbFractionsDisponibles) {
    return {
      recevable: false,
      motif: `L'annonce ne porte que sur ${interet.nbFractionsDisponibles} fraction(s).`,
    };
  }
  return { recevable: true, motif: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Éligibilité d'un investissement à la mise en vente
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Durée minimale de détention avant qu'une participation puisse être annoncée.
 *
 * Ce n'est pas une contrainte technique mais une promesse faite publiquement
 * sur la page du marché secondaire. Elle est appliquée ici, au plus près de la
 * règle, pour qu'aucun chemin d'appel ne puisse la contourner.
 */
export const DUREE_DETENTION_MINIMALE_MOIS = 6;

/**
 * Statuts de projet ouvrant droit à la revente.
 *
 * Tant que le bien n'est pas exploité, la valeur de la part n'a pas de
 * référence observable : céder à ce stade reviendrait à échanger sur une
 * valorisation purement déclarative.
 */
export const STATUTS_PROJET_CESSIBLES: readonly string[] = [
  ProjectStatus.EN_EXPLOITATION,
];

/** Codes métier STABLES : le client les branche, ils ne changent jamais. */
export const CODE_DETENTION_TROP_RECENTE = 'SECONDARY_HOLDING_TOO_RECENT';
export const CODE_PROJET_NON_ELIGIBLE = 'SECONDARY_PROJECT_NOT_ELIGIBLE';

export type MotifRefusMiseEnVente =
  | typeof CODE_DETENTION_TROP_RECENTE
  | typeof CODE_PROJET_NON_ELIGIBLE;

export interface DemandeMiseEnVente {
  /** Date d'entrée en détention de la participation. */
  dateAcquisition: Date;
  /** Statut du projet sous-jacent, tel que porté par le domaine `projects`. */
  statutProjet: string;
  /** Instant d'évaluation — injecté pour que la règle se teste sans horloge. */
  maintenant: Date;
}

export interface VerdictMiseEnVente {
  eligible: boolean;
  code: MotifRefusMiseEnVente | null;
  motif: string | null;
  /** Date à partir de laquelle la durée de détention minimale est atteinte. */
  cessibleAPartirDu: Date;
}

/**
 * Date à laquelle la détention atteint `mois` mois révolus.
 *
 * Le calcul est calendaire, pas en jours : six mois après le 31 août tombe le
 * 28 (ou 29) février, jamais le 3 mars. Le jour est donc borné au dernier jour
 * du mois cible.
 */
export function dateCessibiliteMinimale(
  dateAcquisition: Date,
  mois: number = DUREE_DETENTION_MINIMALE_MOIS,
): Date {
  const jour = dateAcquisition.getDate();
  const cible = new Date(dateAcquisition.getTime());
  // On se pose au 1er du mois avant de décaler : sans cela, un 31 janvier
  // décalé de 1 mois déborderait sur mars.
  cible.setDate(1);
  cible.setMonth(cible.getMonth() + mois);
  const dernierJourDuMoisCible = new Date(
    cible.getFullYear(),
    cible.getMonth() + 1,
    0,
  ).getDate();
  cible.setDate(Math.min(jour, dernierJourDuMoisCible));
  return cible;
}

/**
 * Décide si une participation peut être annoncée sur le tableau d'affichage.
 *
 * Fonction pure : aucune horloge, aucune base, aucun framework. Les deux
 * conditions sont évaluées dans un ordre stable pour que le code de refus soit
 * déterministe quand les deux sont en défaut — le vendeur lit d'abord la cause
 * qu'il ne peut pas corriger.
 */
export function verifierEligibiliteMiseEnVente(
  demande: DemandeMiseEnVente,
): VerdictMiseEnVente {
  const cessibleAPartirDu = dateCessibiliteMinimale(demande.dateAcquisition);

  if (!STATUTS_PROJET_CESSIBLES.includes(demande.statutProjet)) {
    return {
      eligible: false,
      code: CODE_PROJET_NON_ELIGIBLE,
      motif:
        "Les parts de ce projet ne peuvent pas encore être cédées : le projet n'est pas en exploitation.",
      cessibleAPartirDu,
    };
  }

  if (demande.maintenant.getTime() < cessibleAPartirDu.getTime()) {
    return {
      eligible: false,
      code: CODE_DETENTION_TROP_RECENTE,
      motif:
        `Une participation ne peut être mise en vente qu'après ${DUREE_DETENTION_MINIMALE_MOIS} mois de détention. ` +
        `La vôtre le sera à partir du ${cessibleAPartirDu.toLocaleDateString('fr-FR')}.`,
      cessibleAPartirDu,
    };
  }

  return { eligible: true, code: null, motif: null, cessibleAPartirDu };
}

// ═══════════════════════════════════════════════════════════════════════════
// Assiette des frais de cession
// ═══════════════════════════════════════════════════════════════════════════

const arrondi2 = (n: number): number => Math.round(n * 100) / 100;

export interface AssietteCession {
  nbFractions: number;
  /** Prix unitaire demandé par le vendeur. */
  prixUnitaire: number;
  /**
   * Prix de revient unitaire du vendeur. `null` quand il est inconnu : la
   * plus-value est alors réputée nulle plutôt que devinée — mieux vaut
   * sous-estimer des frais annoncés que les gonfler sur une hypothèse.
   */
  prixRevientUnitaire: number | null;
}

export interface BaseCalculFraisCession {
  /** Montant de la cession, avant frais. */
  montantBrut: number;
  /** Plus-value du vendeur, plancher à zéro (aucun frais sur moins-value). */
  plusValueVendeur: number;
}

/**
 * Calcule l'assiette sur laquelle porteront les frais de cession.
 *
 * Séparé du calcul des frais lui-même : l'assiette relève du domaine (ce que
 * l'on vend, à quel prix, avec quel gain), les taux relèvent d'une grille
 * administrable qui vit hors du domaine.
 */
export function calculerAssietteCession(
  assiette: AssietteCession,
): BaseCalculFraisCession {
  const montantBrut = arrondi2(assiette.nbFractions * assiette.prixUnitaire);
  if (assiette.prixRevientUnitaire == null) {
    return { montantBrut, plusValueVendeur: 0 };
  }
  const gain = arrondi2(
    (assiette.prixUnitaire - assiette.prixRevientUnitaire) * assiette.nbFractions,
  );
  return { montantBrut, plusValueVendeur: gain > 0 ? gain : 0 };
}
