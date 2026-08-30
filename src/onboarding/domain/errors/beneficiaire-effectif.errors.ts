import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Ce bénéficiaire effectif n'appartient pas à cette société — ou n'existe pas.
 *
 * Les deux cas rendent le même message, comme pour les pièces justificatives
 * et le profil moral : distinguer « introuvable » de « appartient à quelqu'un
 * d'autre » confirmerait l'existence d'un identifiant à qui n'y a pas droit.
 */
export class BeneficiaireEffectifIntrouvableError extends ComplianceError {
  readonly kind = ComplianceErrorKind.NOT_FOUND;

  constructor(readonly beneficiaireId: string) {
    super('Ce bénéficiaire effectif est introuvable.', {
      code: 'BENEFICIAIRE_EFFECTIF_INTROUVABLE',
      details: { beneficiaireId },
    });
  }
}

/**
 * Les parts détenues **en direct** dépassent le capital de la société.
 *
 * L'invariant du registre, et sa raison d'être en tant qu'agrégat : il porte
 * sur l'ensemble des bénéficiaires, jamais sur un seul. Déclarer trois
 * associés à 40 % chacun est arithmétiquement impossible, et un registre qui
 * l'accepte produit un DBE-S1 que le greffe rejettera.
 *
 * Ne vise que les détentions directes : les indirectes se superposent — une
 * personne contrôlant une holding qui détient 60 % est bénéficiaire à 60 %
 * indirects, part qui recouvre celle de la holding. Les additionner ferait
 * refuser des registres réguliers.
 *
 * `CONFLICT` et non `INVALID_INPUT` : la part déclarée n'est pas fautive en
 * elle-même, c'est l'état du registre qui la rend impossible.
 */
export class DetentionDirecteExcessiveError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor(
    readonly totalDirect: number,
    readonly partDemandee: number,
  ) {
    super(
      `Les détentions directes atteindraient ${totalDirect} % : elles ne peuvent pas dépasser 100 % du capital.`,
      {
        code: 'DETENTION_DIRECTE_EXCESSIVE',
        details: { totalDirect, partDemandee },
      },
    );
  }
}
