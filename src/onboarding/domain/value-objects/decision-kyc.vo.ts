import { KycStatus } from 'src/onboarding/domain/enums/kyc-status.enum';
import { dateCivileOuNull } from './date-civile';

export interface DecisionKycSnapshot {
  statut: KycStatus;
  motifRefus: string | null;
  /**
   * Date civile `AAAA-MM-JJ`, pas un instant : la colonne Postgres est de type
   * `date`, et une échéance de validité n'a ni heure ni fuseau — cf.
   * `DateNaissance` pour le détail du piège.
   */
  valideJusquAu: string | null;
}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les formes que rend
 * réellement le driver Postgres, et sur les colonnes absentes d'un `save()`
 * partiel.
 */
export interface DecisionKycSnapshotBrut extends Omit<
  DecisionKycSnapshot,
  'motifRefus' | 'valideJusquAu'
> {
  motifRefus?: string | null;
  valideJusquAu?: Date | string | null;
}

/**
 * Où en est la vérification d'identité : son statut, le motif d'un refus, et
 * l'échéance d'une validation.
 *
 * Les trois champs ne se séparent pas, et c'est le seul groupe du dossier qui
 * partage un invariant — les autres (niveau d'examen, score de risque, données
 * du fournisseur) sont des valeurs indépendantes qu'aucune règle ne lie deux à
 * deux, donc restées à plat sur l'agrégat (même raisonnement que `ProfilPM`).
 * Ici, au contraire :
 *
 * - un motif de refus sans refus n'a pas de sens, et affiché tel quel au
 *   titulaire d'un dossier validé, il serait franchement trompeur ;
 * - une échéance de validité sans validation non plus — `KycValidatedGuard` la
 *   lit pour rouvrir l'accès aux actions financières, donc une échéance
 *   orpheline est un problème de sécurité, pas d'affichage.
 *
 * **Immuable, mais transitionnable** : {@link tranchee} rend un nouveau bloc
 * plutôt que de muter celui-ci. Les changements de statut passaient par des
 * `UPDATE` directs du repository (`updateStatus`, `updateSession`), c'est-à-dire
 * une décision réglementaire prise dans la couche de persistance ; ils ont
 * désormais leur domicile ici.
 */
export class DecisionKyc {
  private constructor(private readonly etat: DecisionKycSnapshot) {}

  /**
   * Dossier qui vient d'être ouvert : rien n'a encore été vérifié.
   *
   * `NON_DEMARRE` n'est pas un défaut technique mais une décision, au même
   * titre que `EvaluationInvestisseur.initiale()` : c'est le seul statut qu'un
   * dossier puisse avoir avant qu'un fournisseur ait examiné une pièce
   * d'identité. Le rendre déclarable ouvrirait la porte à un dossier né
   * `VALIDE`, donc à un compte autorisé à déposer, investir et retirer sans
   * qu'aucune identité ait été contrôlée — `KycValidatedGuard` ne regarde que
   * ce statut.
   */
  static initiale(): DecisionKyc {
    return new DecisionKyc({
      statut: KycStatus.NON_DEMARRE,
      motifRefus: null,
      valideJusquAu: null,
    });
  }

  /**
   * Le dossier passe à un nouveau statut.
   *
   * Le motif n'accompagne qu'un statut qui en appelle un — un refus, une mise
   * en revue. Le passer à `VALIDE` l'efface : garder « pièce illisible » sur un
   * dossier validé donnerait à lire deux choses contradictoires au RCCI comme
   * au titulaire.
   *
   * `valideJusquAu` est **reconduit tel quel**, jamais calculé ici : l'échéance
   * de validité relève de la politique de re-vérification périodique, qui n'est
   * pas branchée (voir `KycStatus.RENOUVELLEMENT`). L'inventer maintenant
   * ferait expirer des dossiers selon une règle que personne n'a arrêtée.
   */
  tranchee(statut: KycStatus, motif?: string | null): DecisionKyc {
    return new DecisionKyc({
      statut,
      motifRefus: statut === KycStatus.VALIDE ? null : (motif ?? null),
      valideJusquAu: this.etat.valideJusquAu,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: DecisionKycSnapshotBrut): DecisionKyc {
    return new DecisionKyc({
      statut: snapshot.statut,
      motifRefus: snapshot.motifRefus ?? null,
      valideJusquAu: dateCivileOuNull(snapshot.valideJusquAu),
    });
  }

  /**
   * Dossier soumis à une revue manuelle, en attente d'une décision humaine.
   *
   * C'est le seul état dans lequel un administrateur a la main : le reste du
   * temps, la décision appartient à Stripe Identity. La comparaison était
   * écrite littéralement dans `ProfileController.patchKycStatus`, c'est-à-dire
   * une règle métier dans la couche présentation (§12.5).
   */
  estEnRevueManuelle(): boolean {
    return this.etat.statut === KycStatus.EN_REVUE;
  }

  get statut(): KycStatus {
    return this.etat.statut;
  }
  get motifRefus(): string | null {
    return this.etat.motifRefus;
  }
  get valideJusquAu(): string | null {
    return this.etat.valideJusquAu;
  }

  toSnapshot(): DecisionKycSnapshot {
    return { ...this.etat };
  }
}
