import { ProfilPP } from 'src/profiles/domains/profil-pp';

export const PROFIL_PP_REPOSITORY = Symbol('PROFIL_PP_REPOSITORY');

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
}
