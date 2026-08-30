import { CategoriePsfp } from '../enums/categorie-psfp.enum';
import { plafondConseillePour } from '../domain-services/plafond-psfp.domain-service';

/**
 * Le classement tel que la table le range — à plat, en primitives.
 *
 * Les trois colonnes existent pour tout le monde parce qu'une table est
 * rectangulaire ; le modèle, lui, ne l'est pas. Deux des trois catégories
 * n'ont rien à y écrire, et {@link ClassementPsfp.toSnapshot} est le seul
 * endroit où cette asymétrie se replie en `null` (§16 — l'ORM est un détail).
 */
export interface ClassementPsfpSnapshot {
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
}

/**
 * Le classement PSFP d'un titulaire : sa catégorie, et ce que cette catégorie
 * lui impose.
 *
 * C'était un enregistrement plat de trois champs — catégorie, patrimoine
 * déclaré, montant conseillé — porté à l'identique par les trois catégories.
 * **Deux d'entre elles n'en utilisaient jamais que le premier.** Un
 * professionnel n'a pas de plafond conseillé : le règlement l'en dispense. Un
 * averti non plus. Et ni l'un ni l'autre ne déclare de patrimoine, puisque
 * l'étape 3 du questionnaire — d'où sort ce chiffre — ne leur est jamais posée
 * (`ResultatAdequation.calculer`). Ils portaient donc deux champs
 * structurellement nuls, que rien ne lisait et que rien n'empêchait de remplir.
 *
 * Trois classes le disent mieux qu'un enregistrement et deux `null` :
 *
 * | Classe              | Porte en plus                            |
 * | ------------------- | ---------------------------------------- |
 * | `ProfessionnelPsfp` | rien                                     |
 * | `AvertiPsfp`        | rien                                     |
 * | `NonAvertiPsfp`     | patrimoine déclaré, montant conseillé     |
 *
 * Le gain n'est pas seulement de place : {@link plafondConseille} était un `if`
 * sur la catégorie, écrit dans la racine — « si ce n'est pas un non-averti,
 * rendre `null` ». C'est désormais la classe qui répond, et la règle
 * réglementaire est là où la catégorie est décidée plutôt qu'à côté (§38.2 —
 * State : le comportement dépend de ce que l'objet **est**).
 *
 * `ProfessionnelPsfp` et `AvertiPsfp` ont aujourd'hui le même contenu — rien —
 * et restent deux classes : ce sont deux catégories réglementaires distinctes,
 * que le règlement traite différemment ailleurs (délai de rétractation,
 * information précontractuelle). Les fondre demanderait de les redistinguer au
 * premier de ces sujets qu'on modélisera.
 *
 * **Immuable** — cf. `Identite`. Un classement ne se modifie pas, il est
 * rétabli : repasser le questionnaire en produit un nouveau.
 */
export abstract class ClassementPsfp {
  abstract readonly categorie: CategoriePsfp;

  // ── Fabriques ─────────────────────────────────────────────────────────────

  /**
   * Le classement de qui n'a jamais répondu au questionnaire.
   *
   * `NON_AVERTI` et non « inconnu » : c'est le régime le plus protecteur du
   * règlement PSFP, et le seul défaut acceptable — se tromper dans l'autre sens
   * lèverait un plafond et un délai de rétractation. Le classement se gagne, il
   * ne se présume pas.
   */
  static initial(): ClassementPsfp {
    return new NonAvertiPsfp(null, null);
  }

  /**
   * Le classement qu'établit le questionnaire.
   *
   * La catégorie **choisit la classe**, et c'est elle qui décide si les deux
   * autres valeurs ont un sens : les passer pour un professionnel ne les
   * enregistre nulle part, ce qui rend impossible le dossier incohérent qu'un
   * enregistrement plat acceptait sans broncher.
   *
   * Une catégorie absente ou inconnue retombe sur le non-averti : c'est le
   * repli des lignes anciennes, écrites avant que la colonne n'existe.
   */
  static etabli(
    categorie: CategoriePsfp | null,
    patrimoineDeclare: number | null,
    montantMaxConseille: number | null,
  ): ClassementPsfp {
    switch (categorie) {
      case CategoriePsfp.PROFESSIONNEL:
        return new ProfessionnelPsfp();
      case CategoriePsfp.AVERTI:
        return new AvertiPsfp();
      default:
        return new NonAvertiPsfp(patrimoineDeclare, montantMaxConseille);
    }
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: ClassementPsfpSnapshot): ClassementPsfp {
    return ClassementPsfp.etabli(
      snapshot.categoriePsfp,
      snapshot.patrimoineDeclare,
      snapshot.montantMaxConseille,
    );
  }

  // ── Ce que la catégorie impose ────────────────────────────────────────────

  estProfessionnel(): boolean {
    return false;
  }

  estAverti(): boolean {
    return false;
  }

  estNonAverti(): boolean {
    return false;
  }

  /**
   * Montant conseillé par investissement — `null` par défaut.
   *
   * Ce n'est pas « pas encore calculé » mais « ne s'applique pas » : la
   * recommandation ne concerne ni le professionnel ni l'averti, qui acceptent
   * le risque en connaissance de cause. Seul {@link NonAvertiPsfp} la redéfinit.
   */
  plafondConseille(): number | null {
    return null;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * La forme plate de la table, et rien d'autre.
   *
   * Chaque classe la produit elle-même : c'est ici, et seulement ici, que les
   * deux colonnes sans objet redeviennent des `null`. Aucun appelant n'a donc à
   * demander un patrimoine à un professionnel pour s'entendre répondre `null`.
   */
  abstract toSnapshot(): ClassementPsfpSnapshot;
}

/**
 * Deux critères sur trois à l'étape 1 : le titulaire est un investisseur
 * professionnel.
 *
 * Ni plafond conseillé ni délai de rétractation, et aucune étape suivante à
 * passer — le questionnaire est clos pour lui dès l'étape 1.
 */
export class ProfessionnelPsfp extends ClassementPsfp {
  readonly categorie = CategoriePsfp.PROFESSIONNEL;

  override estProfessionnel(): boolean {
    return true;
  }

  toSnapshot(): ClassementPsfpSnapshot {
    return {
      categoriePsfp: this.categorie,
      patrimoineDeclare: null,
      montantMaxConseille: null,
    };
  }
}

/**
 * Quatre critères sur cinq à l'étape 2 : le titulaire est un investisseur
 * averti.
 *
 * Il accepte le risque en connaissance de cause : pas de plafond conseillé, et
 * pas de simulation de capacité de perte à passer.
 */
export class AvertiPsfp extends ClassementPsfp {
  readonly categorie = CategoriePsfp.AVERTI;

  override estAverti(): boolean {
    return true;
  }

  toSnapshot(): ClassementPsfpSnapshot {
    return {
      categoriePsfp: this.categorie,
      patrimoineDeclare: null,
      montantMaxConseille: null,
    };
  }
}

/**
 * Le titulaire n'est ni professionnel ni averti : le régime protecteur
 * s'applique.
 *
 * **La seule des trois catégories à porter des chiffres**, et c'est ce qui
 * justifie la hiérarchie : le plafond conseillé et le patrimoine qui le fonde
 * ne veulent rien dire ailleurs. Ils viennent de l'étape 3 du questionnaire,
 * que lui seul a à passer.
 *
 * Les deux montants coexistent sans faire double emploi :
 *
 * - `montantMaxConseille` est la **décision prise** au moment du questionnaire,
 *   avec les seuils en vigueur ce jour-là — ce que la base garde, et ce que
 *   `ResultatAdequation.restore` refuse expressément de recalculer à la
 *   lecture ;
 * - {@link plafondConseille} est le montant **applicable aujourd'hui**, obtenu
 *   en réappliquant la formule au patrimoine déclaré.
 *
 * Les deux coïncident tant qu'aucun seuil n'a bougé. Ce comportement est celui
 * qu'avait la racine avant cette classe, et il est repris tel quel : le
 * questionnaire garde la trace, le classement oppose la règle du jour.
 */
export class NonAvertiPsfp extends ClassementPsfp {
  readonly categorie = CategoriePsfp.NON_AVERTI;

  constructor(
    readonly patrimoineDeclare: number | null,
    readonly montantMaxConseille: number | null,
  ) {
    super();
  }

  override estNonAverti(): boolean {
    return true;
  }

  /** Le plus élevé du plancher réglementaire et de 5 % du patrimoine déclaré. */
  override plafondConseille(): number {
    return plafondConseillePour(this.patrimoineDeclare);
  }

  toSnapshot(): ClassementPsfpSnapshot {
    return {
      categoriePsfp: this.categorie,
      patrimoineDeclare: this.patrimoineDeclare,
      montantMaxConseille: this.montantMaxConseille,
    };
  }
}
