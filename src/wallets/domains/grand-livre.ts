/**
 * Grand livre interne — invariant comptable de la plateforme.
 *
 * Toute opération purement interne (souscription, ajout de fractions,
 * rétractation, remboursement d'une collecte échouée, libération d'escrow)
 * DÉPLACE des fonds entre wallets : elle n'en crée ni n'en détruit. La somme
 * des variations sur l'ensemble des wallets doit donc valoir exactement zéro.
 *
 * L'unité de mesure de l'invariant est le **fonds détenu** par un wallet,
 * c'est-à-dire `solde + soldeBloque` :
 *  - `solde` est la part immédiatement disponible pour le titulaire ;
 *  - `soldeBloque` est la part engagée mais encore réversible (délai de
 *    réflexion accordé par BeOwn, cf. `investments/domains/retractation.ts`).
 *
 * Raisonner sur le seul `solde` serait faux : le blocage d'escrow déplace des
 * fonds d'une poche à l'autre À L'INTÉRIEUR du même wallet, sans qu'aucun
 * euro n'entre ni ne sorte. C'est la somme des deux poches qui se conserve.
 *
 * Seuls les mouvements ayant une contrepartie EXTERNE (dépôt par carte,
 * retrait bancaire, versement au porteur constaté hors plateforme) font
 * légitimement varier le total détenu : ils ne relèvent pas de cet invariant.
 */

/** Position d'un wallet : ce qu'il détient, disponible et engagé confondus. */
export interface PositionWallet {
  solde: number | string;
  soldeBloque?: number | string | null;
}

/** Variation d'un wallet produite par une opération du grand livre. */
export interface MouvementWallet {
  walletId: string;
  deltaSolde: number;
  deltaBloque?: number;
}

/**
 * Tolérance d'arrondi de l'invariant : un dixième de centime. Les montants
 * sont stockés en `decimal(18,2)` ; toute dérive supérieure trahit une
 * écriture manquante, pas un arrondi.
 */
export const TOLERANCE_INVARIANT_EUR = 0.001;

/** Fonds réellement détenus par un wallet : disponible + engagé. */
export function fondsDetenus(position: PositionWallet): number {
  return Number(position.solde ?? 0) + Number(position.soldeBloque ?? 0);
}

/** Variation des fonds détenus induite par un mouvement. */
export function variationFondsDetenus(mouvement: MouvementWallet): number {
  return mouvement.deltaSolde + (mouvement.deltaBloque ?? 0);
}

/** Somme algébrique des variations — doit valoir zéro sur une opération interne. */
export function variationTotale(mouvements: MouvementWallet[]): number {
  return mouvements.reduce(
    (somme, mouvement) => somme + variationFondsDetenus(mouvement),
    0,
  );
}

/** Vrai si l'ensemble des mouvements se compense exactement. */
export function grandLivreEquilibre(
  mouvements: MouvementWallet[],
  tolerance: number = TOLERANCE_INVARIANT_EUR,
): boolean {
  return Math.abs(variationTotale(mouvements)) <= tolerance;
}

/**
 * Écriture du grand livre telle qu'elle est persistée : un montant, un
 * portefeuille débité, un portefeuille crédité. Un côté à NULL signale une
 * contrepartie EXTERNE (dépôt par carte, retrait bancaire, versement au
 * porteur) — l'écriture reste une seule ligne, jamais deux colonnes du même
 * côté.
 */
export interface EcritureGrandLivre {
  walletSource?: string | null;
  walletDestination?: string | null;
  montant: number | string;
}

/** Écart constaté sur un portefeuille entre sa position réelle et le registre. */
export interface EcartRapprochement {
  walletId: string;
  /** `solde + soldeBloque` lu sur le portefeuille. */
  fondsDetenus: number;
  /** Σ crédits − Σ débits reconstitués depuis les écritures. */
  grandLivre: number;
  /** `fondsDetenus − grandLivre` : non nul = écriture manquante ou mal orientée. */
  ecart: number;
}

/**
 * Position de chaque portefeuille reconstituée depuis les seules écritures :
 * Σ des montants reçus moins Σ des montants versés.
 *
 * Les mouvements intra-portefeuille (source = destination, tel un blocage
 * d'escrow) se compensent d'eux-mêmes et n'ont pas à être exclus : ils
 * créditent et débitent le même portefeuille du même montant.
 */
export function positionsDepuisEcritures(
  ecritures: readonly EcritureGrandLivre[],
): Map<string, number> {
  const positions = new Map<string, number>();
  const cumuler = (walletId: string, delta: number) =>
    positions.set(walletId, (positions.get(walletId) ?? 0) + delta);

  for (const ecriture of ecritures) {
    const montant = Number(ecriture.montant ?? 0);
    if (ecriture.walletDestination) cumuler(ecriture.walletDestination, montant);
    if (ecriture.walletSource) cumuler(ecriture.walletSource, -montant);
  }
  return positions;
}

/**
 * Rapproche le registre des positions réelles : pour CHAQUE portefeuille,
 * `solde + soldeBloque` doit égaler « Σ crédits − Σ débits ».
 *
 * C'est le contrôle qui manquait (ANO-02) : une écriture inscrite du mauvais
 * côté laisse le solde juste et le registre faux — seul ce rapprochement le
 * révèle. Il vaut pour TOUS les types de mouvement, contrepartie externe
 * comprise : un dépôt crédite `walletDestination` et fait donc bien monter la
 * position du bénéficiaire ; l'inscrire côté source la ferait baisser.
 *
 * @returns un écart par portefeuille hors tolérance ; tableau vide = rapproché.
 */
export function rapprocherGrandLivre(
  positionsReelles: ReadonlyMap<string, PositionWallet>,
  ecritures: readonly EcritureGrandLivre[],
  tolerance: number = TOLERANCE_INVARIANT_EUR,
): EcartRapprochement[] {
  const registre = positionsDepuisEcritures(ecritures);
  const walletIds = new Set<string>([
    ...positionsReelles.keys(),
    ...registre.keys(),
  ]);

  const ecarts: EcartRapprochement[] = [];
  for (const walletId of walletIds) {
    const position = positionsReelles.get(walletId);
    const detenus = position ? fondsDetenus(position) : 0;
    const grandLivre = registre.get(walletId) ?? 0;
    const ecart = detenus - grandLivre;
    if (Math.abs(ecart) > tolerance) {
      ecarts.push({ walletId, fondsDetenus: detenus, grandLivre, ecart });
    }
  }
  return ecarts;
}

/** Vrai si chaque portefeuille est rapproché de son registre, à la tolérance près. */
export function grandLivreRapproche(
  positionsReelles: ReadonlyMap<string, PositionWallet>,
  ecritures: readonly EcritureGrandLivre[],
  tolerance: number = TOLERANCE_INVARIANT_EUR,
): boolean {
  return rapprocherGrandLivre(positionsReelles, ecritures, tolerance).length === 0;
}

/**
 * Dérive les mouvements en comparant l'état des wallets avant et après une
 * opération. Un wallet absent d'un des deux instantanés est traité comme une
 * position nulle : la création d'un wallet à solde nul n'est pas un mouvement,
 * mais son alimentation en est un.
 *
 * C'est la primitive de vérification de l'invariant : elle ne présume rien du
 * chemin de code emprunté, seulement du résultat observable en base.
 */
export function mouvementsDepuisInstantanes(
  avant: ReadonlyMap<string, PositionWallet>,
  apres: ReadonlyMap<string, PositionWallet>,
): MouvementWallet[] {
  const walletIds = new Set<string>([...avant.keys(), ...apres.keys()]);
  const mouvements: MouvementWallet[] = [];

  for (const walletId of walletIds) {
    const positionAvant = avant.get(walletId);
    const positionApres = apres.get(walletId);
    const deltaSolde =
      Number(positionApres?.solde ?? 0) - Number(positionAvant?.solde ?? 0);
    const deltaBloque =
      Number(positionApres?.soldeBloque ?? 0) -
      Number(positionAvant?.soldeBloque ?? 0);
    if (deltaSolde === 0 && deltaBloque === 0) continue;
    mouvements.push({ walletId, deltaSolde, deltaBloque });
  }

  return mouvements;
}
