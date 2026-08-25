import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { ComplianceError, ComplianceErrorKind } from './compliance.error';

const LIBELLE: Record<NatureDeDossier, string> = {
  [NatureDeDossier.PP]: 'personne physique',
  [NatureDeDossier.PM]: 'personne morale',
};

/**
 * Ce compte relève déjà de l'autre régime de vérification.
 *
 * Un titulaire est soit une personne physique, soit une personne morale —
 * jamais les deux : ce qu'il faut vérifier de lui, et sous quel régime il
 * souscrit, en dépend entièrement (voir {@link NatureDeDossier}). L'erreur
 * porte les deux natures, celle qu'on a voulu ouvrir et celle qui fait déjà
 * foi, parce que le message utile n'est pas « c'est interdit » mais « votre
 * compte est déjà un dossier personne morale ».
 *
 * `CONFLICT` et non `INVALID_INPUT` : rien n'est fautif dans ce qui a été
 * envoyé, c'est l'état du compte qui interdit l'opération.
 */
export class NatureDeDossierIncompatibleError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor(
    readonly demandee: NatureDeDossier,
    readonly etablie: NatureDeDossier,
  ) {
    super(
      `Ce compte a déjà un dossier ${LIBELLE[etablie]} : il ne peut pas ouvrir de dossier ${LIBELLE[demandee]}.`,
      {
        code: 'NATURE_DE_DOSSIER_INCOMPATIBLE',
        details: { demandee, etablie },
      },
    );
  }
}
