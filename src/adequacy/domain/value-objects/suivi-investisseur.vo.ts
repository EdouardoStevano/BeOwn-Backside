import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';

/** Ce que la surveillance périodique retient d'un investisseur. */
export interface SuiviInvestisseurSnapshot {
  niveauRisque: NiveauRisque | null;
  dernierContactAdmin: Date | null;
  prochainContactDu: Date | null;
}

/**
 * La surveillance périodique d'un investisseur — PSFP art. 21.
 *
 * **Le seul état que la racine possède en propre.** Tout le reste de ce qu'elle
 * publie — catégorie, plafond, patrimoine — est *dérivé* du questionnaire, et
 * n'est donc stocké nulle part ; ces trois valeurs-ci, non : une date de
 * dernier contact ne se recalcule pas, et le niveau de risque est figé à
 * l'instant du calcul pour que la cadence ne change pas sous les pieds de
 * l'équipe conformité entre deux passages du CRON.
 *
 * Il vivait sur `ProfilPP`, dans `EvaluationInvestisseur`, aux côtés du
 * classement PSFP. Deux erreurs en une : le classement n'y était qu'une copie
 * du questionnaire, et **une personne morale n'a pas de profil PP** — donc
 * aucun suivi possible, quel que soit son niveau de risque.
 */
export class SuiviInvestisseur {
  private constructor(private readonly etat: SuiviInvestisseurSnapshot) {}

  /** Titulaire jamais évalué : traité comme vulnérable jusqu'à preuve du contraire. */
  static jamaisEvalue(): SuiviInvestisseur {
    return new SuiviInvestisseur({
      niveauRisque: null,
      dernierContactAdmin: null,
      prochainContactDu: null,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(
    snapshot: Partial<SuiviInvestisseurSnapshot>,
  ): SuiviInvestisseur {
    return new SuiviInvestisseur({
      niveauRisque: snapshot.niveauRisque ?? null,
      dernierContactAdmin: snapshot.dernierContactAdmin ?? null,
      prochainContactDu: snapshot.prochainContactDu ?? null,
    });
  }

  /**
   * Nouveau niveau de risque, et la date de contact qu'il appelle.
   *
   * Immuable : rend un nouveau bloc plutôt que de muter celui-ci. La date est
   * fournie par l'appelant — c'est `prochainContactApres` qui connaît la
   * cadence, et la lui faire calculer ici ferait dépendre un Value Object d'un
   * Domain Service.
   */
  reevalue(niveauRisque: NiveauRisque, prochainContactDu: Date) {
    return new SuiviInvestisseur({
      niveauRisque,
      dernierContactAdmin: this.etat.dernierContactAdmin,
      prochainContactDu,
    });
  }

  /**
   * Le contact est-il dû ?
   *
   * Un titulaire jamais évalué dont on ignore la cadence est dû dès lors qu'il
   * est vulnérable : c'est le repli le plus prudent, et se tromper dans ce sens
   * ne coûte qu'un appel de trop.
   */
  contactEstDu(maintenant: Date = new Date()): boolean {
    if (this.etat.prochainContactDu !== null) {
      return this.etat.prochainContactDu <= maintenant;
    }
    return this.etat.niveauRisque === NiveauRisque.VULNERABLE;
  }

  get niveauRisque(): NiveauRisque | null {
    return this.etat.niveauRisque;
  }
  get dernierContactAdmin(): Date | null {
    return this.etat.dernierContactAdmin;
  }
  get prochainContactDu(): Date | null {
    return this.etat.prochainContactDu;
  }

  toSnapshot(): SuiviInvestisseurSnapshot {
    return { ...this.etat };
  }
}
