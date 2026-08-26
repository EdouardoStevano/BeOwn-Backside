import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import { ProfilPP } from 'src/compliance/domain/aggregates/profil-pp';
import type { ClassementPsfp } from 'src/compliance/domain/aggregates/investor-compliance-profile';

export const PROFIL_PP_REPOSITORY = Symbol('PROFIL_PP_REPOSITORY');

/**
 * Ce que le questionnaire d'adéquation reporte sur le profil.
 *
 * Le type est défini par la racine — c'est elle qui décide de ce que le
 * classement impose (§3.2, RG-KYC-13) — et réexporté ici pour les appelants qui
 * ne connaissent que ce port.
 */
export type { ClassementPsfp };

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
 *
 * Trois méthodes, et **aucune écriture ciblée**. Il en portait trois de plus —
 * `enregistrerClassementPsfp`, `enregistrerSuiviRisque`, `listerContactsDus` —
 * qui écrivaient et lisaient un classement PSFP et un suivi de risque que le
 * profil ne calculait pas : il n'en tenait qu'une copie du questionnaire.
 * `InvestorComplianceProfile` en est le propriétaire, et le port de lecture
 * `PROFIL_CONFORMITE_QUERY` les sert aux contextes en aval.
 */
export interface ProfilPPRepository {
  save(profil: ProfilPP): Promise<ProfilPP>;
  findByUserId(userId: number): Promise<ProfilPP | null>;
  update(profil: ProfilPP): Promise<ProfilPP>;
}
