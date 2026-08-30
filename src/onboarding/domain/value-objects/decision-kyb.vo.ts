import { StatutKyb } from '../enums/statut-kyb.enum';
import { KybPasEnInstructionError } from '../errors/kyb.errors';
import { dateCivileOuNull } from './date-civile';

/**
 * La décision KYB telle que la table la range — à plat, en primitives.
 *
 * Les cinq clés sont exactement les colonnes de `investor_compliance_profile`,
 * comme celles de {@link ClassementPsfpSnapshot} et de
 * {@link SuiviInvestisseurSnapshot} : le repository les répand telles quelles
 * (§16 — l'ORM est un détail, mais la forme plate est celle de la table).
 *
 * Toutes préfixées `kyb` : la racine porte déjà un classement et une
 * surveillance sur la même ligne, et un `statut` nu n'y dirait pas de quoi.
 */
export interface DecisionKybSnapshot {
  kybStatut: StatutKyb;
  kybMotifRefus: string | null;
  /**
   * Date civile `AAAA-MM-JJ`, pas un instant : la colonne Postgres est de type
   * `date`, et une échéance de validité n'a ni heure ni fuseau — cf.
   * `DateNaissance` pour le détail du piège.
   */
  kybValideJusquAu: string | null;
  kybDecideeLe: Date | null;
  /** Le compte de l'agent conformité qui a tranché — jamais le titulaire. */
  kybDecideePar: number | null;
}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les formes que rend
 * réellement le driver Postgres, et sur les colonnes absentes des lignes
 * écrites avant que ces cinq-là n'existent.
 */
export interface DecisionKybSnapshotBrut {
  kybStatut?: StatutKyb | null;
  kybMotifRefus?: string | null;
  kybValideJusquAu?: Date | string | null;
  kybDecideeLe?: Date | string | null;
  kybDecideePar?: number | null;
}

/**
 * Où en est le dossier de conformité d'une société : son statut, ce qui
 * l'explique, jusqu'à quand il vaut, et qui l'a tranché.
 *
 * **C'est le verdict KYB rendu opposable.** Il était jusqu'ici recomposé à
 * chaque lecture par `aptitudeDeLaSociete`, depuis trois agrégats — le dossier
 * du représentant, la société, ses pièces. Un verdict recalculé bascule
 * silencieusement : le jour où un KBIS se périme ou qu'un bénéficiaire est
 * déclaré de plus, la société cesse ou recommence de pouvoir opérer sans
 * qu'aucune décision ait été prise, sans date et sans auteur. Ce n'est pas
 * opposable au régulateur, qui attend de savoir *qui* a validé *quoi* et
 * *quand*.
 *
 * Un **Value Object**, et non une entité comme `KycCase` : il n'a pas
 * d'identité propre, pas de cycle de vie hors de sa racine, et cinq attributs.
 * C'est la situation de `ClassementPsfp` et de `SuiviInvestisseur`, qui vivent
 * en colonnes à plat sur la même ligne. `KycCase` est une entité parce qu'elle
 * porte treize attributs, des références de fournisseur et un rapport de
 * vérification — rien de tout cela ici : l'instruction d'un KYB est humaine,
 * et ses pièces vivent dans `DossierDePieces`.
 *
 * **Immuable, mais transitionnable** — cf. `DecisionKyc` : chaque geste rend un
 * nouveau bloc plutôt que de muter celui-ci.
 *
 * Les quatre transitions se lisent comme le parcours réel :
 *
 * | Geste             | Depuis                     | Vers               |
 * | ----------------- | -------------------------- | ------------------ |
 * | {@link soumise}   | `EN_CONSTITUTION`          | `EN_INSTRUCTION`   |
 * | {@link validee}   | `EN_INSTRUCTION`           | `VALIDE`           |
 * | {@link refusee}   | `EN_INSTRUCTION`           | `REFUSE`           |
 * | {@link rouverte}  | n'importe lequel           | `EN_CONSTITUTION`  |
 */
export class DecisionKyb {
  private constructor(private readonly etat: DecisionKybSnapshot) {}

  // ── Fabriques ─────────────────────────────────────────────────────────────

  /**
   * Le dossier d'une société dont aucune pièce n'a encore été réunie.
   *
   * `EN_CONSTITUTION` n'est pas un défaut technique mais une décision, au même
   * titre que `DecisionKyc.initiale()` : c'est le seul état qu'un dossier
   * puisse avoir avant que l'équipe conformité ait lu quoi que ce soit. Le
   * rendre déclarable ouvrirait la porte à un dossier né `VALIDE`, donc à une
   * société autorisée à déposer, souscrire et retirer sans qu'aucun
   * justificatif ait été examiné.
   */
  static initiale(): DecisionKyb {
    return new DecisionKyb({
      kybStatut: StatutKyb.EN_CONSTITUTION,
      kybMotifRefus: null,
      kybValideJusquAu: null,
      kybDecideeLe: null,
      kybDecideePar: null,
    });
  }

  /**
   * Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`).
   *
   * Une ligne sans statut est en constitution : c'est le repli des dossiers
   * écrits avant que ces colonnes n'existent, et le seul défaut acceptable —
   * se tromper dans l'autre sens laisserait opérer une société jamais
   * instruite.
   */
  static restore(brut: DecisionKybSnapshotBrut): DecisionKyb {
    return new DecisionKyb({
      kybStatut: brut.kybStatut ?? StatutKyb.EN_CONSTITUTION,
      kybMotifRefus: brut.kybMotifRefus ?? null,
      kybValideJusquAu: dateCivileOuNull(brut.kybValideJusquAu),
      kybDecideeLe: instantOuNull(brut.kybDecideeLe),
      kybDecideePar: brut.kybDecideePar ?? null,
    });
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Le dossier réunit toutes ses pièces : il part en instruction.
   *
   * **Sans effet depuis les trois autres états, plutôt qu'une erreur.** Ce
   * geste répond à un événement — le dossier vient de devenir complet — et un
   * événement se redélivre. Lever ici ferait échouer un abonné pour un fait
   * déjà acquis, exactement ce que `KycCase.accueille` évite par
   * `SuiteDuVerdict.DEJA_APPLIQUE`.
   *
   * Un dossier déjà `VALIDE` ou `REFUSE` ne repart donc pas en instruction sur
   * une acceptation de pièce : il n'y revient que par {@link rouverte}, c'est
   * -à-dire quand quelque chose a réellement défait la décision.
   */
  soumise(le: Date): DecisionKyb {
    if (this.etat.kybStatut !== StatutKyb.EN_CONSTITUTION) return this;

    return new DecisionKyb({
      ...this.etat,
      kybStatut: StatutKyb.EN_INSTRUCTION,
      kybMotifRefus: null,
      kybDecideeLe: le,
    });
  }

  /**
   * L'équipe conformité valide le dossier.
   *
   * `valideJusquAu` est **fourni**, jamais calculé ici : la cadence de
   * re-vérification d'une personne morale relève d'une politique que personne
   * n'a arrêtée, et l'inventer maintenant ferait expirer des dossiers selon une
   * règle qui n'existe pas (même parti pris que `DecisionKyc.tranchee`).
   * `null` signifie « sans échéance », ce que {@link estValide} traite comme
   * valable indéfiniment.
   *
   * Le motif est effacé : garder « KBIS illisible » sur un dossier validé
   * donnerait à lire deux choses contradictoires au RCCI comme au titulaire.
   *
   * @throws KybPasEnInstructionError si le dossier n'est pas en instruction.
   */
  validee(valideJusquAu: string | null, par: number, le: Date): DecisionKyb {
    this.exigerLInstruction();

    return new DecisionKyb({
      kybStatut: StatutKyb.VALIDE,
      kybMotifRefus: null,
      kybValideJusquAu: dateCivileOuNull(valideJusquAu),
      kybDecideeLe: le,
      kybDecideePar: par,
    });
  }

  /**
   * L'équipe conformité rejette le dossier, motif à l'appui.
   *
   * L'échéance est effacée : une validité qui survivrait à un refus rouvrirait
   * l'accès aux opérations financières à la première relecture de
   * {@link estValide} qui ne regarderait que la date.
   *
   * @throws KybPasEnInstructionError si le dossier n'est pas en instruction.
   */
  refusee(motif: string, par: number, le: Date): DecisionKyb {
    this.exigerLInstruction();

    return new DecisionKyb({
      kybStatut: StatutKyb.REFUSE,
      kybMotifRefus: motif,
      kybValideJusquAu: null,
      kybDecideeLe: le,
      kybDecideePar: par,
    });
  }

  /**
   * Le dossier retombe en constitution : une pièce a été refusée, remplacée,
   * ou s'est périmée.
   *
   * **Légal depuis n'importe quel état, et c'est délibéré.** Une pièce peut
   * être refusée à tout moment, y compris longtemps après la validation — c'est
   * ainsi qu'un KYB validé se révoque, et le seul chemin par lequel une société
   * cesse de pouvoir opérer sans attendre son échéance.
   *
   * L'échéance et l'auteur sont effacés : ils documentaient une décision que ce
   * geste vient de défaire.
   */
  rouverte(motif: string): DecisionKyb {
    return new DecisionKyb({
      kybStatut: StatutKyb.EN_CONSTITUTION,
      kybMotifRefus: motif,
      kybValideJusquAu: null,
      kybDecideeLe: null,
      kybDecideePar: null,
    });
  }

  /** @throws KybPasEnInstructionError — voir {@link KybPasEnInstructionError}. */
  private exigerLInstruction(): void {
    if (this.etat.kybStatut !== StatutKyb.EN_INSTRUCTION) {
      throw new KybPasEnInstructionError(this.etat.kybStatut);
    }
  }

  // ── Ce que la décision impose ─────────────────────────────────────────────

  /**
   * Cette société peut-elle réaliser des opérations financières ?
   *
   * Deux conditions cumulatives, et la seconde compte autant que la première :
   * le dossier est validé, et sa validité n'est pas périmée. Un KYB validé il y
   * a trois ans ne prouve plus rien — c'est la règle que `peutOperer` applique
   * déjà à la vérification d'identité, et elle est reprise **à l'identique**
   * pour que les deux natures de titulaire expirent le même jour à la même
   * heure.
   *
   * @param maintenant injecté pour que la règle s'éprouve sans dépendre de
   *   l'horloge (§26).
   */
  estValide(maintenant: Date = new Date()): boolean {
    if (this.etat.kybStatut !== StatutKyb.VALIDE) return false;

    const echeance = this.etat.kybValideJusquAu;
    return echeance === null || new Date(echeance) >= maintenant;
  }

  /** Le dossier attend-il une décision de l'équipe conformité ? */
  estEnInstruction(): boolean {
    return this.etat.kybStatut === StatutKyb.EN_INSTRUCTION;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get statut(): StatutKyb {
    return this.etat.kybStatut;
  }
  /** Ce qui explique un refus ou une remise en constitution, `null` sinon. */
  get motifRefus(): string | null {
    return this.etat.kybMotifRefus;
  }
  get valideJusquAu(): string | null {
    return this.etat.kybValideJusquAu;
  }
  get decideeLe(): Date | null {
    return this.etat.kybDecideeLe;
  }
  get decideePar(): number | null {
    return this.etat.kybDecideePar;
  }

  toSnapshot(): DecisionKybSnapshot {
    return { ...this.etat };
  }
}

/**
 * `kybDecideeLe` est une colonne `timestamptz` : le driver rend un `Date`, mais
 * un `save()` qui vient d'écrire la valeur rend ce qu'on lui a passé, et une
 * ligne ancienne rend `undefined`. Les trois formes se ramènent ici — à la
 * différence de l'échéance, qui est une date civile et perdrait son sens à être
 * gardée comme instant.
 */
function instantOuNull(raw: Date | string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;
  return raw instanceof Date ? raw : new Date(raw);
}
