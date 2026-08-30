export const BENEFICIAIRES_DE_LA_SOCIETE_QUERY = Symbol(
  'BENEFICIAIRES_DE_LA_SOCIETE_QUERY',
);

/** Ce que le dossier de pièces a besoin de savoir d'un bénéficiaire. */
export interface BeneficiaireDeclare {
  id: string;
  prenom: string;
  nom: string;
}

/**
 * Les bénéficiaires effectifs déclarés par une société.
 *
 * Un port de **lecture seule**, et volontairement pauvre : le dossier de pièces
 * n'a besoin que de savoir combien de personnes attendent une pièce d'identité,
 * et comment les nommer à l'écran. Le pourcentage de détention, la date de
 * naissance et la nationalité ne le regardent pas.
 *
 * Il existe parce que la règle de complétude en dépend — « une pièce d'identité
 * pour chacun de ces bénéficiaires » — et que les bénéficiaires appartiennent à
 * `ProfilPM`, pas au dossier de pièces (§6.2). Sans lui, le use case injecterait
 * un `Repository` TypeORM, ce qu'une classe d'`application/` ne fait pas
 * (§12.3) — c'est d'ailleurs ce que fait encore
 * `BeneficiaireEffectifController`, et qui reste à reprendre.
 */
export interface BeneficiairesDeLaSocieteQuery {
  parSociete(societeId: string): Promise<BeneficiaireDeclare[]>;
}
