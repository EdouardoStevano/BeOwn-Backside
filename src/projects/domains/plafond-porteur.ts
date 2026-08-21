/**
 * Plafond de collecte par porteur de projet — art. 1(2)(c) du règlement
 * (UE) 2020/1503.
 *
 * Le règlement plafonne à 5 000 000 € la contrepartie totale des offres d'un
 * MÊME porteur de projet, calculée sur une période GLISSANTE de douze mois.
 * Ce n'est donc pas un plafond par projet : trois collectes de 3 M€ ouvertes la
 * même année dépassent le plafond, même si aucune ne dépasse 5 M€ isolément.
 *
 * Domaine pur : la fenêtre et l'arithmétique vivent ici, la lecture des offres
 * passées reste à la charge de l'appelant.
 */

export const PLAFOND_PORTEUR_12_MOIS_EUR = 5_000_000;
export const FENETRE_GLISSANTE_MOIS = 12;

export interface OffrePorteur {
  /** Montant de la contrepartie offerte, en euros. */
  montant: number;
  /**
   * Date d'ouverture de l'offre au public. C'est elle qui situe l'offre dans
   * la fenêtre glissante, pas la date de création du brouillon.
   */
  ouverteLe: Date;
}

export interface ResultatPlafondPorteur {
  /** Somme des offres du porteur déjà situées dans la fenêtre. */
  dejaCollecte: number;
  /** Marge restante avant d'atteindre le plafond. */
  disponible: number;
  /** Faux si la nouvelle offre ferait franchir le plafond. */
  autorise: boolean;
  /** Début de la fenêtre glissante retenue. */
  debutFenetre: Date;
}

/** Début de la fenêtre glissante de douze mois se terminant à `reference`. */
export function debutFenetreGlissante(reference: Date): Date {
  const debut = new Date(reference.getTime());
  debut.setMonth(debut.getMonth() - FENETRE_GLISSANTE_MOIS);
  return debut;
}

/**
 * Vérifie qu'une nouvelle offre de `montantEnvisage` respecte le plafond, au
 * regard des offres déjà ouvertes par le même porteur.
 *
 * Les offres hors fenêtre sont ignorées ; c'est le principe même du caractère
 * glissant du plafond.
 */
export function verifierPlafondPorteur(
  offresExistantes: OffrePorteur[],
  montantEnvisage: number,
  reference: Date = new Date(),
): ResultatPlafondPorteur {
  const debutFenetre = debutFenetreGlissante(reference);

  const dejaCollecte = offresExistantes
    .filter((offre) => new Date(offre.ouverteLe).getTime() >= debutFenetre.getTime())
    .reduce((total, offre) => total + Number(offre.montant), 0);

  const disponible = Math.max(0, PLAFOND_PORTEUR_12_MOIS_EUR - dejaCollecte);

  return {
    dejaCollecte: arrondir(dejaCollecte),
    disponible: arrondir(disponible),
    autorise: dejaCollecte + montantEnvisage <= PLAFOND_PORTEUR_12_MOIS_EUR,
    debutFenetre,
  };
}

function arrondir(montant: number): number {
  return Math.round(montant * 100) / 100;
}
