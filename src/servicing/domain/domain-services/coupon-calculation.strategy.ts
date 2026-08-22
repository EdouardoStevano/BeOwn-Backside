import { EcheanceStatus, RemboursementMode } from '../enums/echeance.enum';
import type { EcheanceNaissante } from '../entities/echeance';

/** Ce dont le calcul d'un échéancier a besoin, et rien de plus. */
export interface EchelonnementDemande {
  investissementId: string;
  /** Capital souscrit, base du calcul des intérêts. */
  montant: number;
  /** TRI cible **annuel**, en pourcentage (8 = 8 %). */
  triAnnuel: number;
  /** Nombre d'échéances mensuelles. */
  dureeMois: number;
  /** Ancre du calendrier : l'échéance n°1 tombe un mois après. */
  origine: Date;
}

/**
 * **Mode de remboursement** (RG-ECH-02) — plusieurs algorithmes de calcul de
 * coupons, interchangeables derrière une interface commune (§38.1).
 *
 * Strategy et non Policy : le mode est un choix *connu et figé à la
 * signature* de l'investissement, pas une décision métier volatile — c'est la
 * distinction que §38.1 pose entre les deux noms.
 */
export interface CouponCalculationStrategy {
  calculer(demande: EchelonnementDemande): EcheanceNaissante[];
}

/**
 * **In fine** : l'investisseur touche ses intérêts tous les mois et récupère
 * l'intégralité de son capital à la dernière échéance. Le capital ne
 * s'amortissant pas, l'assiette des intérêts reste constante.
 */
export class InFineStrategy implements CouponCalculationStrategy {
  calculer(demande: EchelonnementDemande): EcheanceNaissante[] {
    const { montant, dureeMois } = demande;
    const tauxMensuel = tauxMensuelDe(demande.triAnnuel);
    const interets = round2(montant * tauxMensuel);

    return echelonner(demande, (numero) => {
      const capital = numero === dureeMois ? montant : 0;
      return { capital, interets };
    });
  }
}

/**
 * **Amortissable constant** : une part de capital identique à chaque échéance,
 * et des intérêts calculés sur le capital restant dû — donc décroissants.
 */
export class AmortissableConstantStrategy implements CouponCalculationStrategy {
  calculer(demande: EchelonnementDemande): EcheanceNaissante[] {
    const { montant, dureeMois } = demande;
    const tauxMensuel = tauxMensuelDe(demande.triAnnuel);
    const capitalMensuel = montant / dureeMois;
    let capitalRestantDu = montant;

    return echelonner(demande, () => {
      const interets = round2(capitalRestantDu * tauxMensuel);
      const capital = round2(capitalMensuel);
      capitalRestantDu -= capital;
      return { capital, interets };
    });
  }
}

/**
 * Le mode de remboursement d'un investissement décide de sa stratégie.
 *
 * > ⚠️ `BULLET_INTERETS_TRIMESTRIELS` n'a pas encore de stratégie propre et
 * > retombe sur l'amortissable — c'est exactement ce que faisait le `else` du
 * > `generateEcheances` qu'il remplace, où seul `IN_FINE` était distingué. Le
 * > mode existe dans l'enum et dans RG-ECH-02, mais aucun calcul trimestriel
 * > n'a jamais été écrit : l'échéancier produit reste mensuel. À clarifier
 * > avec le métier avant d'écrire la stratégie manquante — la corriger ici
 * > silencieusement changerait l'échéancier d'investissements existants.
 */
export function strategieDeRemboursement(
  mode: RemboursementMode,
): CouponCalculationStrategy {
  return mode === RemboursementMode.IN_FINE
    ? new InFineStrategy()
    : new AmortissableConstantStrategy();
}

/**
 * Le squelette commun aux deux stratégies : `dureeMois` échéances mensuelles à
 * partir de l'origine, chacune numérotée, chaque stratégie ne fournissant que
 * la ventilation capital / intérêts de son rang.
 */
function echelonner(
  demande: EchelonnementDemande,
  ventiler: (numero: number) => { capital: number; interets: number },
): EcheanceNaissante[] {
  const echeances: EcheanceNaissante[] = [];

  for (let numero = 1; numero <= demande.dureeMois; numero++) {
    const { capital, interets } = ventiler(numero);

    echeances.push({
      investissementId: demande.investissementId,
      numero,
      datePrevue: moisApres(demande.origine, numero),
      montantCapital: capital,
      montantInterets: interets,
      montantTotal: capital + interets,
      prelevementIR: 0,
      prelevementCSG: 0,
      statut: EcheanceStatus.A_VENIR,
      payeLe: null,
      statutChangeLe: null,
      rappelJ7Envoye: false,
      rappelJ1Envoye: false,
    });
  }

  return echeances;
}

const tauxMensuelDe = (triAnnuel: number): number => triAnnuel / 100 / 12;

const round2 = (montant: number): number => Math.round(montant * 100) / 100;

const moisApres = (origine: Date, mois: number): Date => {
  const date = new Date(origine);
  date.setMonth(date.getMonth() + mois);
  return date;
};
