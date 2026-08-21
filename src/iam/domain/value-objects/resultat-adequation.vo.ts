import { CategoriePsfp } from 'src/iam/domain/enums/categorie-psfp.enum';
import { CapaciteDePerte } from './capacite-de-perte.vo';
import { PreQualificationPsfp } from './pre-qualification-psfp.vo';
import { QualificationPsfp } from './qualification-psfp.vo';

export interface ResultatAdequationSnapshot {
  resultCategorie: CategoriePsfp | null;
  resultMontantMaxConseille: number | null;
}

/** La colonne `decimal` revient en chaîne du driver Postgres. */
export interface ResultatAdequationSnapshotBrut extends Omit<
  ResultatAdequationSnapshot,
  'resultMontantMaxConseille'
> {
  resultMontantMaxConseille: number | string | null;
}

/**
 * Le classement qui découle des réponses : catégorie PSFP, et montant conseillé
 * par investissement quand il y a lieu d'en conseiller un.
 *
 * **Ce bloc n'est jamais déclaré, il est calculé** — comme
 * `EvaluationInvestisseur` côté profil, et pour la même raison : se déclarer
 * « professionnel » dispense du délai de rétractation et du plafond
 * d'investissement. La seule porte d'entrée depuis l'extérieur est
 * {@link restore}, qui relit ce que la base a gardé ; toute autre valeur passe
 * par {@link calculer}, qui ne lit que les réponses.
 *
 * L'enchaînement des trois étapes est ici, et non dans le use case qui le
 * portait : c'est la règle réglementaire elle-même, celle qui décide ce qu'un
 * investisseur a le droit de faire. Elle se relit d'un trait, et se teste sans
 * base de données ni conteneur Nest.
 */
export class ResultatAdequation {
  private constructor(private readonly etat: ResultatAdequationSnapshot) {}

  /**
   * Classement PSFP en trois temps, dans cet ordre :
   *
   * 1. **pré-qualification** — deux critères sur trois font un professionnel,
   *    qui n'a ni plafond conseillé ni étape suivante ;
   * 2. **qualification** — sinon, quatre critères sur cinq font un averti, qui
   *    accepte le risque en connaissance de cause et n'est pas plafonné non
   *    plus ;
   * 3. **simulation** — sinon le titulaire est non averti, et c'est le seul cas
   *    où un montant conseillé est calculé, à partir de son patrimoine.
   *
   * L'ordre n'est pas un détail d'implémentation : un titulaire peut réunir les
   * critères des étapes 1 et 2, et c'est la première qui l'emporte.
   */
  static calculer(
    preQualification: PreQualificationPsfp,
    qualification: QualificationPsfp,
    capacite: CapaciteDePerte,
  ): ResultatAdequation {
    if (preQualification.estProfessionnel()) {
      return new ResultatAdequation({
        resultCategorie: CategoriePsfp.PROFESSIONNEL,
        resultMontantMaxConseille: null,
      });
    }

    if (qualification.estAverti()) {
      return new ResultatAdequation({
        resultCategorie: CategoriePsfp.AVERTI,
        resultMontantMaxConseille: null,
      });
    }

    return new ResultatAdequation({
      resultCategorie: CategoriePsfp.NON_AVERTI,
      resultMontantMaxConseille: capacite.plafondConseille(),
    });
  }

  /**
   * Reconstitution depuis la persistance, **sans rejouer le classement**.
   *
   * Ce que la base garde est la décision telle qu'elle a été prise, avec les
   * seuils en vigueur ce jour-là. La recalculer à la lecture ferait changer
   * rétroactivement la catégorie de tout le monde le jour où un seuil bouge —
   * y compris sur des dossiers déjà instruits. Le classement ne se refait qu'en
   * répondant à nouveau au questionnaire.
   */
  static restore(snapshot: ResultatAdequationSnapshotBrut): ResultatAdequation {
    const montant = snapshot.resultMontantMaxConseille;
    const valeur =
      montant === null || montant === undefined ? null : Number(montant);

    return new ResultatAdequation({
      resultCategorie: snapshot.resultCategorie ?? null,
      resultMontantMaxConseille:
        valeur !== null && Number.isFinite(valeur) ? valeur : null,
    });
  }

  get categorie(): CategoriePsfp | null {
    return this.etat.resultCategorie;
  }
  get montantMaxConseille(): number | null {
    return this.etat.resultMontantMaxConseille;
  }

  estProfessionnel(): boolean {
    return this.etat.resultCategorie === CategoriePsfp.PROFESSIONNEL;
  }
  estAverti(): boolean {
    return this.etat.resultCategorie === CategoriePsfp.AVERTI;
  }

  toSnapshot(): ResultatAdequationSnapshot {
    return { ...this.etat };
  }
}
