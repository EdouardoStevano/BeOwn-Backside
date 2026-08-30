/**
 * Publication des taux de défaut — art. 20 du règlement (UE) 2020/1503,
 * méthodologie du règlement délégué (UE) 2022/2115.
 *
 * L'article impose au prestataire de publier ANNUELLEMENT les taux de défaut
 * des projets proposés sur sa plateforme, portant sur au moins les TRENTE-SIX
 * DERNIERS MOIS, et de le faire à un endroit accessible aux investisseurs.
 * Un indicateur de back-office ne satisfait pas cette obligation.
 *
 * Domaine pur : la fenêtre, le regroupement par cohorte annuelle et le calcul
 * vivent ici ; la lecture des échéances reste à la charge de l'appelant.
 */

/** Art. 20(1) : profondeur minimale de la publication. */
export const PROFONDEUR_PUBLICATION_MOIS = 36;

/** Un projet est en défaut lorsqu'une échéance dépasse quatre-vingt-dix jours de retard. */
export const SEUIL_DEFAUT_JOURS = 90;

export interface ProjetObserve {
  projetId: string;
  /** Date d'ouverture de la collecte : situe le projet dans sa cohorte. */
  ouvertLe: Date;
  /** Capital effectivement collecté auprès des investisseurs. */
  capitalCollecte: number;
  /** Vrai si au moins une échéance dépasse le seuil de défaut. */
  enDefaut: boolean;
  /** Capital constaté en perte définitive. */
  capitalPerteDefinitive: number;
}

export interface CohorteAnnuelle {
  annee: number;
  nbProjets: number;
  nbProjetsEnDefaut: number;
  capitalCollecte: number;
  capitalPerteDefinitive: number;
  /** Part des projets de la cohorte en situation de défaut, en pourcentage. */
  tauxDefautProjets: number;
  /** Part du capital collecté définitivement perdu, en pourcentage. */
  tauxPerteCapital: number;
}

export interface PublicationTauxDefaut {
  /** Début de la fenêtre de publication. */
  debutPeriode: Date;
  finPeriode: Date;
  profondeurMois: number;
  cohortes: CohorteAnnuelle[];
  /** Agrégat toutes cohortes confondues. */
  global: Omit<CohorteAnnuelle, 'annee'>;
  methodologie: string;
}

export const METHODOLOGIE_TAUX_DEFAUT =
  "Un projet est réputé en défaut lorsqu'au moins une échéance due aux " +
  `investisseurs dépasse ${SEUIL_DEFAUT_JOURS} jours de retard. Le taux de défaut ` +
  "rapporte le nombre de projets en défaut au nombre de projets de la cohorte, " +
  "définie par l'année d'ouverture de la collecte. Le taux de perte rapporte le " +
  "capital constaté en perte définitive au capital collecté. Les projets encore " +
  "en collecte sont exclus. Cette publication est une démarche de transparence " +
  "propre à BeOwn : elle ne relève d'aucun régime d'agrément et n'est encadrée " +
  "par aucune autorité de marché.";

/** Début de la fenêtre de publication de trente-six mois. */
export function debutPeriodePublication(reference: Date): Date {
  const debut = new Date(reference.getTime());
  debut.setMonth(debut.getMonth() - PROFONDEUR_PUBLICATION_MOIS);
  return debut;
}

/**
 * Construit la publication annuelle à partir des projets observés.
 *
 * Une cohorte sans projet n'apparaît pas : publier une ligne à 0 % pour une
 * année sans activité donnerait une image flatteuse et fausse.
 */
export function construirePublication(
  projets: ProjetObserve[],
  reference: Date = new Date(),
): PublicationTauxDefaut {
  const debutPeriode = debutPeriodePublication(reference);

  const dansLaFenetre = projets.filter(
    (projet) => new Date(projet.ouvertLe).getTime() >= debutPeriode.getTime(),
  );

  const parAnnee = new Map<number, ProjetObserve[]>();
  for (const projet of dansLaFenetre) {
    const annee = new Date(projet.ouvertLe).getFullYear();
    const liste = parAnnee.get(annee) ?? [];
    liste.push(projet);
    parAnnee.set(annee, liste);
  }

  const cohortes = [...parAnnee.entries()]
    .map(([annee, liste]) => ({ annee, ...agreger(liste) }))
    .sort((a, b) => a.annee - b.annee);

  return {
    debutPeriode,
    finPeriode: reference,
    profondeurMois: PROFONDEUR_PUBLICATION_MOIS,
    cohortes,
    global: agreger(dansLaFenetre),
    methodologie: METHODOLOGIE_TAUX_DEFAUT,
  };
}

function agreger(projets: ProjetObserve[]): Omit<CohorteAnnuelle, 'annee'> {
  const nbProjets = projets.length;
  const nbProjetsEnDefaut = projets.filter((p) => p.enDefaut).length;
  const capitalCollecte = projets.reduce((total, p) => total + p.capitalCollecte, 0);
  const capitalPerteDefinitive = projets.reduce(
    (total, p) => total + p.capitalPerteDefinitive,
    0,
  );

  return {
    nbProjets,
    nbProjetsEnDefaut,
    capitalCollecte: arrondir(capitalCollecte),
    capitalPerteDefinitive: arrondir(capitalPerteDefinitive),
    tauxDefautProjets: nbProjets > 0 ? pourcent(nbProjetsEnDefaut / nbProjets) : 0,
    tauxPerteCapital:
      capitalCollecte > 0 ? pourcent(capitalPerteDefinitive / capitalCollecte) : 0,
  };
}

function pourcent(ratio: number): number {
  return Math.round(ratio * 10000) / 100;
}

function arrondir(montant: number): number {
  return Math.round(montant * 100) / 100;
}
