import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import { TOLERANCE_INVARIANT_EUR } from './grand-livre';

/**
 * État financier d'un projet, vu du grand livre interne.
 *
 * Tout est dérivé des écritures du wallet technique du projet : rien n'est
 * recalculé depuis la table des investissements, qui décrit des engagements
 * et non des mouvements de fonds. Le grand livre est la seule source de
 * vérité de ce qui est dû au porteur.
 *
 * AUCUN de ces montants ne déclenche de virement. Le versement au porteur est
 * un geste manuel, constaté a posteriori — voir docs/adr/ADR-grand-livre-interne.md.
 */

/** Agrégats bruts lus sur le grand livre pour un projet. */
export interface AgregatsLedgerProjet {
  devise: string;
  /** Σ des crédits acquis au projet (souscriptions définitives + libérations d'escrow). */
  credite: number;
  /** Σ des remboursements débités du wallet projet (collecte échouée ou annulée). */
  rembourse: number;
  /**
   * Σ des APPORTS DU PORTEUR (`APPORT_PORTEUR`) : l'argent qu'il a lui-même
   * mis dans son projet pour en servir la dette.
   *
   * Compté à part parce que ce n'est PAS de la collecte : le confondre avec
   * les souscriptions gonflait le « Collecté » affiché au back-office d'un
   * montant qui ne vient d'aucun investisseur — un projet peu souscrit mais
   * bien alimenté par son porteur paraissait avoir levé plus qu'il n'avait
   * réellement levé.
   *
   * Optionnel : les appelants qui ne le fournissent pas (états financiers
   * historiques, tests antérieurs) valent zéro — le comportement précédent.
   */
  apportPorteur?: number;
  /** Σ des frais de plateforme prélevés sur le wallet projet. */
  fraisRetenus: number;
  /** Σ des versements au porteur déjà constatés (sorties hors plateforme). */
  dejaVerse: number;
  /**
   * Σ des AUTRES débits du wallet projet : remboursements de capital et
   * paiements d'intérêts aux investisseurs, distributions… Tout ce qui est
   * déjà sorti sans être ni un remboursement de collecte, ni des frais, ni un
   * versement au porteur. Sans cette catégorie, le montant dû au porteur
   * serait surestimé de tout ce que le projet a déjà servi.
   */
  autresDecaissements: number;
  /** Engagements encore couverts par un délai de réflexion : pas encore acquis. */
  enDelaiReflexion: number;
  /** Solde réel du wallet technique du projet, pour contrôle de cohérence. */
  soldeWalletProjet: number;
}

/** Contrat de lecture exposé au back-office (GET /admin/projets/:id/etat-financier). */
export interface EtatFinancierProjet {
  projetId: string;
  devise: string;
  /** Fonds définitivement acquis au projet, remboursements déduits. */
  collecte: number;
  /** Part de `collecte` provenant du PORTEUR lui-même, et non d'investisseurs. */
  apportPorteur: number;
  /**
   * Ce que les INVESTISSEURS ont réellement engagé : `collecte − apportPorteur`.
   *
   * C'est ce chiffre que le back-office doit afficher sous « Collecté ».
   * `collecte` reste la somme des entrées du portefeuille et sert au contrôle
   * de cohérence — les mélanger ferait mentir l'un ou l'autre.
   */
  collecteInvestisseurs: number;
  /** Fonds engagés mais encore rétractables : ils ne sont pas dans `collecte`. */
  enDelaiReflexion: number;
  fraisRetenus: number;
  /** Déjà servi aux investisseurs (capital, intérêts, distributions). */
  autresDecaissements: number;
  /** Ce que le projet doit au porteur avant tout versement. */
  netAVerser: number;
  dejaVerse: number;
  /** Ce qu'il reste à verser au porteur, hors plateforme. */
  restantDu: number;
  /** Solde du wallet technique — doit égaler `restantDu`. */
  soldeWalletProjet: number;
  /** `soldeWalletProjet − restantDu` : non nul = grand livre désaligné. */
  ecartReconciliation: number;
  coherent: boolean;
}

/**
 * Calcule l'état financier à partir des agrégats du grand livre.
 *
 * Fonction pure : aucune dépendance base de données, testable seule.
 */
export function calculerEtatFinancierProjet(
  projetId: string,
  agregats: AgregatsLedgerProjet,
): EtatFinancierProjet {
  const collecte = round2(agregats.credite - agregats.rembourse);
  const apportPorteur = round2(agregats.apportPorteur ?? 0);
  // Retranché de l'AFFICHAGE, jamais de l'arithmétique de réconciliation :
  // l'apport est bien dans le portefeuille, et l'en soustraire ferait
  // apparaître un faux écart entre le solde réel et le restant dû.
  const collecteInvestisseurs = round2(collecte - apportPorteur);
  const fraisRetenus = round2(agregats.fraisRetenus);
  const autresDecaissements = round2(agregats.autresDecaissements);
  const netAVerser = round2(collecte - fraisRetenus - autresDecaissements);
  const dejaVerse = round2(agregats.dejaVerse);
  const restantDu = round2(netAVerser - dejaVerse);
  const soldeWalletProjet = round2(agregats.soldeWalletProjet);
  const ecartReconciliation = round2(soldeWalletProjet - restantDu);

  return {
    projetId,
    devise: agregats.devise,
    collecte,
    apportPorteur,
    collecteInvestisseurs,
    enDelaiReflexion: round2(agregats.enDelaiReflexion),
    fraisRetenus,
    autresDecaissements,
    netAVerser,
    dejaVerse,
    restantDu,
    soldeWalletProjet,
    ecartReconciliation,
    coherent: Math.abs(ecartReconciliation) <= TOLERANCE_INVARIANT_EUR,
  };
}

/**
 * État d'un projet SANS wallet technique — donc sans aucun mouvement au grand
 * livre — mais qui peut déjà porter des engagements.
 *
 * ANO-03 : c'est exactement la situation d'un projet EN COLLECTE. Tant que les
 * souscriptions sont dans leur délai de rétractation, les fonds restent bloqués
 * sur les wallets des investisseurs : aucun euro n'a atteint le projet, aucun
 * wallet technique n'a été créé. Renvoyer un état intégralement nul ferait
 * croire au back-office que le projet ne porte rien, alors que des engagements
 * rétractables existent — c'est le seul agrégat calculable sans wallet, et il
 * doit remonter.
 *
 * `coherent` reste vrai : il n'y a pas d'écart de réconciliation à constater
 * puisqu'il n'y a ni écriture ni solde à rapprocher.
 */
export function etatFinancierSansMouvement(
  projetId: string,
  options: { devise?: string; enDelaiReflexion?: number } = {},
): EtatFinancierProjet {
  return calculerEtatFinancierProjet(projetId, {
    devise: options.devise ?? 'EUR',
    credite: 0,
    rembourse: 0,
    fraisRetenus: 0,
    dejaVerse: 0,
    autresDecaissements: 0,
    enDelaiReflexion: options.enDelaiReflexion ?? 0,
    soldeWalletProjet: 0,
  });
}

/** État d'un projet dont aucun mouvement ni engagement n'a été enregistré. */
export function etatFinancierVide(
  projetId: string,
  devise = 'EUR',
): EtatFinancierProjet {
  return etatFinancierSansMouvement(projetId, { devise });
}
