import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import { ProfilPP } from 'src/compliance/domain/aggregates/profil-pp';

export const PROFIL_PP_REPOSITORY = Symbol('PROFIL_PP_REPOSITORY');

/** Ce que le questionnaire d'adéquation reporte sur le profil. */
export interface ClassementPsfp {
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
}

/** Ce que le calcul de risque reporte sur le profil. */
export interface SuiviRisque {
  niveauRisque: NiveauRisque;
  prochainContactDu: Date;
}

/**
 * Accès en persistance au profil personne physique.
 *
 * Le port vit dans le **domaine** et non dans la couche applicative : c'est le
 * domaine qui déclare ce dont il a besoin, l'infrastructure qui s'y plie
 * (§4 — DIP). Le placer sous `application/` laissait entendre l'inverse, alors
 * que rien dans cette interface ne parle d'orchestration.
 *
 * Un port par agrégat, et non un `ProfilRepository` fourre-tout : les onze
 * méthodes du profil PP, du profil PM et du KYC vivaient dans une seule
 * interface, si bien qu'un consommateur n'ayant besoin que de lire un KYC —
 * `PaymentController` — dépendait quand même de la sauvegarde d'un profil
 * moral (§4 — ISP). Le mock de cet unique consommateur devait, en toute
 * rigueur, déclarer les onze.
 *
 * Les méthodes perdent du même coup leur suffixe : `saveProfilPP` dans une
 * interface qui ne parle que de profils PP répétait deux fois la même chose.
 */
export interface ProfilPPRepository {
  save(profil: ProfilPP): Promise<ProfilPP>;
  findByUserId(userId: number): Promise<ProfilPP | null>;
  update(profil: ProfilPP): Promise<ProfilPP>;

  /**
   * Reporte sur le profil le classement issu du questionnaire d'adéquation.
   *
   * Écriture ciblée, et non `save(profil)`, pour la raison exposée par
   * `EvaluationInvestisseur` : ces trois colonnes ne sont pas déclarables
   * depuis l'agrégat, qui les expose en lecture seule. Charger le profil pour
   * les y écrire rouvrirait justement la porte qu'on a fermée — et écraserait
   * au passage tout ce qui aurait changé sur le profil entre le chargement et
   * la sauvegarde.
   *
   * Sans effet si le compte n'a pas de profil PP : répondre au questionnaire
   * avant d'avoir complété son profil reste permis.
   */
  enregistrerClassementPsfp(
    utilisateurId: number,
    classement: ClassementPsfp,
  ): Promise<void>;

  /** Reporte le niveau de risque et la date du prochain contact. Mêmes raisons. */
  enregistrerSuiviRisque(
    utilisateurId: number,
    suivi: SuiviRisque,
  ): Promise<void>;

  /**
   * Profils dont la prise de contact périodique est due — surveillance PSFP.
   *
   * Y figurent aussi les profils vulnérables jamais contactés, dont la date de
   * prochain contact est encore vide.
   */
  listerContactsDus(limite: number): Promise<ProfilPP[]>;
}
