import { RegistreDesBeneficiaires } from 'src/onboarding/domain/aggregates/registre-des-beneficiaires';

export const REGISTRE_DES_BENEFICIAIRES_REPOSITORY = Symbol(
  'REGISTRE_DES_BENEFICIAIRES_REPOSITORY',
);

/**
 * Accès en persistance au registre des bénéficiaires effectifs d'une société.
 *
 * Trois opérations orientées métier, et pas de `findAll` générique (§10) : on
 * charge le registre **d'une société** pour y déclarer ou en retirer quelqu'un.
 * `retirer` est séparé de `save` parce qu'une suppression n'est pas une
 * écriture d'agrégat comme une autre — TypeORM ne déduit pas d'un tableau
 * raccourci qu'il faut effacer une ligne.
 */
export interface RegistreDesBeneficiairesRepository {
  /**
   * Le registre d'une société — **jamais `null`**.
   *
   * Une société sans bénéficiaire déclaré a un registre vide, pas une absence
   * de registre : c'est l'état de départ normal, et rendre `null` obligerait
   * chaque appelant à le traduire, en l'oubliant parfois.
   */
  parSociete(societeId: string): Promise<RegistreDesBeneficiaires>;

  save(registre: RegistreDesBeneficiaires): Promise<RegistreDesBeneficiaires>;

  /** Efface une déclaration, dont la racine a déjà vérifié l'appartenance. */
  retirer(societeId: string, beneficiaireId: string): Promise<void>;
}
