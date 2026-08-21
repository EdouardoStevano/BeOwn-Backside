import { ProjectInstrument } from '../enums/project-status.enum';
import { ChampProjetInvalideError } from '../errors/project.errors';

export interface ConditionsFinancieresSnapshot {
  capitalCible: number;
  capitalMinimum: number;
  ticketMinimum: number;
  ticketMaximum: number | null;
  triCible: number | null;
  /** Échelle de risque 1 (très faible) à 5 (très élevé). */
  indiceRisque: number;
  dureeMois: number;
  instrument: ProjectInstrument;
  estPreInvestissable: boolean;
  plafondPreInvestissement: number | null;
  nbFractions: number | null;
  prixFraction: number | null;
}

export interface ConditionsFinancieresProps {
  capitalCible: number;
  capitalMinimum: number;
  dureeMois: number;
  instrument: ProjectInstrument;
  ticketMinimum?: number | null;
  ticketMaximum?: number | null;
  triCible?: number | null;
  indiceRisque?: number | null;
  estPreInvestissable?: boolean | null;
  plafondPreInvestissement?: number | null;
  nbFractions?: number | null;
  prixFraction?: number | null;
}

/**
 * À quelles conditions on investit dans ce projet.
 *
 * Le seul bloc de l'agrégat dont les champs se contraignent réellement entre
 * eux — c'est le critère qui justifie un Value Object, pas le fait d'avoir un
 * nom commun (cf. `DecisionKyc`, et la mise en garde qu'elle cite à propos de
 * `ProfilPM`). Ici :
 *
 * - un **capital minimum** au-dessus du capital cible rend la collecte
 *   impossible à clôturer : elle réussit à `capitalMinimum` et s'arrête à
 *   `capitalCible` ;
 * - un **ticket maximum** sous le ticket minimum n'autorise aucun montant ;
 * - un ticket minimum au-dessus du capital cible n'autorise aucun
 *   investisseur ;
 * - le **plafond de pré-investissement** ne peut pas dépasser le capital cible,
 *   qu'il plafonnerait alors sans jamais mordre.
 *
 * Aucune de ces règles n'était écrite : les DTO validaient les champs un par un
 * (`@IsPositive`, `@Min(1)`), jamais deux ensemble, et
 * `UpdateProjectUseCase` en modifiait un sans regarder les autres.
 *
 * ⚠️ Changement de comportement assumé : ces combinaisons étaient acceptées et
 * sont désormais refusées en 400. Aucune ne décrit un projet finançable.
 */
export class ConditionsFinancieres {
  /**
   * Plafond réglementaire PSFP d'une offre de financement participatif.
   * La borne était posée par le seul DTO de création (`@Max(5_000_000)`) : une
   * mise à jour pouvait la franchir sans rien croiser.
   */
  static readonly CAPITAL_CIBLE_MAX = 5_000_000;

  static readonly TICKET_MINIMUM_PAR_DEFAUT = 100;

  /** Risque moyen — le défaut de la colonne, et celui des deux use cases. */
  static readonly INDICE_RISQUE_PAR_DEFAUT = 3;

  private constructor(private readonly etat: ConditionsFinancieresSnapshot) {}

  static of(props: ConditionsFinancieresProps): ConditionsFinancieres {
    const capitalCible = Number(props.capitalCible);
    const capitalMinimum = Number(props.capitalMinimum);
    const ticketMinimum = Number(
      props.ticketMinimum ?? ConditionsFinancieres.TICKET_MINIMUM_PAR_DEFAUT,
    );
    const ticketMaximum = nombreOuNull(props.ticketMaximum);
    const indiceRisque = Number(
      props.indiceRisque ?? ConditionsFinancieres.INDICE_RISQUE_PAR_DEFAUT,
    );
    const dureeMois = Number(props.dureeMois);
    const estPreInvestissable = props.estPreInvestissable ?? false;
    const plafondPreInvestissement = nombreOuNull(
      props.plafondPreInvestissement,
    );
    const nbFractions = nombreOuNull(props.nbFractions);
    const prixFraction = nombreOuNull(props.prixFraction);
    const triCible = nombreOuNull(props.triCible);

    exigerPositif('capitalCible', capitalCible);
    if (capitalCible > ConditionsFinancieres.CAPITAL_CIBLE_MAX) {
      throw new ChampProjetInvalideError(
        'capitalCible',
        `plafond réglementaire PSFP : ${ConditionsFinancieres.CAPITAL_CIBLE_MAX}.`,
      );
    }
    exigerPositif('capitalMinimum', capitalMinimum);
    if (capitalMinimum > capitalCible) {
      throw new ChampProjetInvalideError(
        'capitalMinimum',
        'ne peut pas dépasser le capital cible — la collecte serait inclôturable.',
      );
    }
    exigerPositif('ticketMinimum', ticketMinimum);
    if (ticketMinimum > capitalCible) {
      throw new ChampProjetInvalideError(
        'ticketMinimum',
        'ne peut pas dépasser le capital cible — aucun investisseur ne pourrait entrer.',
      );
    }
    if (ticketMaximum !== null && ticketMaximum < ticketMinimum) {
      throw new ChampProjetInvalideError(
        'ticketMaximum',
        'ne peut pas être inférieur au ticket minimum.',
      );
    }
    if (
      !Number.isInteger(indiceRisque) ||
      indiceRisque < 1 ||
      indiceRisque > 5
    ) {
      throw new ChampProjetInvalideError(
        'indiceRisque',
        'échelle attendue : entier de 1 (très faible) à 5 (très élevé).',
      );
    }
    exigerPositif('dureeMois', dureeMois);
    if (plafondPreInvestissement !== null) {
      exigerPositif('plafondPreInvestissement', plafondPreInvestissement);
      if (plafondPreInvestissement > capitalCible) {
        throw new ChampProjetInvalideError(
          'plafondPreInvestissement',
          'ne peut pas dépasser le capital cible.',
        );
      }
    }
    if (nbFractions !== null) exigerPositif('nbFractions', nbFractions);
    if (prixFraction !== null) exigerPositif('prixFraction', prixFraction);

    return new ConditionsFinancieres({
      capitalCible,
      capitalMinimum,
      ticketMinimum,
      ticketMaximum,
      triCible,
      indiceRisque,
      dureeMois,
      instrument: props.instrument,
      estPreInvestissable,
      plafondPreInvestissement,
      nbFractions,
      prixFraction,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `Localisation`). */
  static restore(
    snapshot: ConditionsFinancieresSnapshot,
  ): ConditionsFinancieres {
    return new ConditionsFinancieres({
      capitalCible: Number(snapshot.capitalCible),
      capitalMinimum: Number(snapshot.capitalMinimum),
      ticketMinimum: Number(snapshot.ticketMinimum),
      ticketMaximum: nombreOuNull(snapshot.ticketMaximum),
      triCible: nombreOuNull(snapshot.triCible),
      indiceRisque:
        snapshot.indiceRisque != null
          ? Number(snapshot.indiceRisque)
          : ConditionsFinancieres.INDICE_RISQUE_PAR_DEFAUT,
      dureeMois: Number(snapshot.dureeMois),
      instrument: snapshot.instrument,
      estPreInvestissable: snapshot.estPreInvestissable ?? false,
      plafondPreInvestissement: nombreOuNull(snapshot.plafondPreInvestissement),
      nbFractions: nombreOuNull(snapshot.nbFractions),
      prixFraction: nombreOuNull(snapshot.prixFraction),
    });
  }

  /**
   * Nouvelles conditions où seuls les champs fournis changent, **revalidées
   * ensemble**.
   *
   * C'est tout l'intérêt du bloc : `UpdateProjectUseCase` posait
   * `capitalCible` sans regarder `capitalMinimum`, et pouvait donc laisser un
   * projet dans un état que la création aurait refusé.
   */
  avec(props: Partial<ConditionsFinancieresProps>): ConditionsFinancieres {
    const e = this.etat;
    return ConditionsFinancieres.of({
      capitalCible: props.capitalCible ?? e.capitalCible,
      capitalMinimum: props.capitalMinimum ?? e.capitalMinimum,
      dureeMois: props.dureeMois ?? e.dureeMois,
      instrument: props.instrument ?? e.instrument,
      ticketMinimum:
        props.ticketMinimum !== undefined
          ? props.ticketMinimum
          : e.ticketMinimum,
      ticketMaximum:
        props.ticketMaximum !== undefined
          ? props.ticketMaximum
          : e.ticketMaximum,
      triCible: props.triCible !== undefined ? props.triCible : e.triCible,
      indiceRisque:
        props.indiceRisque !== undefined ? props.indiceRisque : e.indiceRisque,
      estPreInvestissable:
        props.estPreInvestissable !== undefined
          ? props.estPreInvestissable
          : e.estPreInvestissable,
      plafondPreInvestissement:
        props.plafondPreInvestissement !== undefined
          ? props.plafondPreInvestissement
          : e.plafondPreInvestissement,
      nbFractions:
        props.nbFractions !== undefined ? props.nbFractions : e.nbFractions,
      prixFraction:
        props.prixFraction !== undefined ? props.prixFraction : e.prixFraction,
    });
  }

  // ── Dérivés ───────────────────────────────────────────────────────────────

  /**
   * Prix effectif d'une fraction : le **ticket minimum**, pas `prixFraction`.
   *
   * Contre-intuitif, et pourtant c'est le prix qui fait foi partout où une
   * fraction est vendue — `CreateInvestmentUseCase`, `TopUpInvestmentUseCase`,
   * les deux enrichissements du read-model. `prixFraction` est une colonne
   * d'affichage, renseignée sur une partie seulement du catalogue. La règle
   * était recopiée à l'identique dans ces quatre endroits ; elle est énoncée
   * ici une fois.
   */
  get prixUnitaireFraction(): number {
    return this.etat.ticketMinimum;
  }

  /**
   * Nombre total de fractions : celui déclaré, ou celui qu'implique le capital
   * cible au prix de la fraction. Même duplication que ci-dessus.
   */
  get nbFractionsTotal(): number {
    return (
      this.etat.nbFractions ??
      Math.floor(this.etat.capitalCible / this.prixUnitaireFraction)
    );
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get capitalCible(): number {
    return this.etat.capitalCible;
  }
  get capitalMinimum(): number {
    return this.etat.capitalMinimum;
  }
  get ticketMinimum(): number {
    return this.etat.ticketMinimum;
  }
  get ticketMaximum(): number | null {
    return this.etat.ticketMaximum;
  }
  get triCible(): number | null {
    return this.etat.triCible;
  }
  get indiceRisque(): number {
    return this.etat.indiceRisque;
  }
  get dureeMois(): number {
    return this.etat.dureeMois;
  }
  get instrument(): ProjectInstrument {
    return this.etat.instrument;
  }
  get estPreInvestissable(): boolean {
    return this.etat.estPreInvestissable;
  }
  get plafondPreInvestissement(): number | null {
    return this.etat.plafondPreInvestissement;
  }
  get nbFractions(): number | null {
    return this.etat.nbFractions;
  }
  get prixFraction(): number | null {
    return this.etat.prixFraction;
  }

  toSnapshot(): ConditionsFinancieresSnapshot {
    return { ...this.etat };
  }
}

function nombreOuNull(valeur: number | null | undefined): number | null {
  return valeur == null ? null : Number(valeur);
}

function exigerPositif(champ: string, valeur: number): void {
  if (!Number.isFinite(valeur) || valeur <= 0) {
    throw new ChampProjetInvalideError(champ, 'attendu strictement positif.');
  }
}
