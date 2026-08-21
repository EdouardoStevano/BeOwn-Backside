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
