import { Inject, Injectable } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import type { KycIdentiteExtrait } from 'src/compliance/domain/aggregates/kyc';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
  type KycImageUrls,
} from 'src/compliance/application/ports/identity-verification.port';

/** Ce que rend la consultation des pièces d'un dossier. */
export type KycImagesResult =
  | { available: false }
  | {
      available: true;
      stripeReportId: string | null;
      identiteExtrait: KycIdentiteExtrait;
      images: KycImageUrls;
    };

/**
 * Les pièces déposées à l'appui d'un dossier, et l'identité qui en a été lue.
 *
 * Deux lectures s'appuient dessus, avec deux portées différentes : le titulaire
 * consulte les siennes, la compliance consulte celles d'un dossier qu'elle
 * examine. La différence tenait, dans `PaymentController`, à deux méthodes de
 * contrôleur qui répétaient le même corps à un champ près — le titulaire
 * recevait un `identiteExtrait` recomposé clé par clé, l'admin le recevait
 * entier.
 *
 * **Cette recomposition n'est pas conservée** : les deux chemins rendent
 * désormais le même objet. Elle ne masquait rien — les clés recopiées étaient
 * exactement celles de l'identité extraite, à l'exception des trois
 * identifiants de fichiers (`documentFrontFileId`, `documentBackFileId`,
 * `selfieFileId`), qui ne sont pas des données personnelles mais les mêmes
 * références que celles déjà résolues dans `images`.
 */
@Injectable()
export class GetKycImagesUseCase {
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async execute(utilisateurId: number): Promise<KycImagesResult> {
    const kyc = await this.kycRepository.findByUserId(utilisateurId);
    if (!kyc?.identiteExtrait) return { available: false };

    const { documentFrontFileId, documentBackFileId, selfieFileId } =
      kyc.identiteExtrait;

    const images = await this.identity.getImageUrls({
      documentFrontFileId,
      documentBackFileId,
      selfieFileId,
    });

    return {
      available: true,
      stripeReportId: kyc.stripeReportId,
      identiteExtrait: kyc.identiteExtrait,
      images,
    };
  }
}
