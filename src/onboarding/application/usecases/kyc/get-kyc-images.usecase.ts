import { Inject, Injectable } from '@nestjs/common';
import {
  DOSSIER_KYC_QUERY,
  type DossierKycQuery,
} from 'src/onboarding/application/ports/dossier-kyc.query';
import type { KycIdentiteExtrait } from 'src/onboarding/domain/entities/kyc-case';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
  type KycImageUrls,
} from 'src/onboarding/application/ports/identity-verification.port';

/**
 * D'où viennent les pièces rendues.
 *
 * `archive` : la copie que nous détenons, pérenne — c'est elle qui tient la
 * conservation de cinq ans (RG-KYC-10). `fournisseur` : lues à l'instant chez
 * le prestataire, parce que nous n'avions pas encore la copie. La distinction
 * est publiée parce qu'elle n'est pas anodine : des pièces `fournisseur`
 * peuvent disparaître, ses identifiants de fichier expirant.
 */
export type SourceDesPieces = 'archive' | 'fournisseur';

/** Ce que rend la consultation des pièces d'un dossier. */
export type KycImagesResult =
  | { available: false }
  | {
      available: true;
      source: SourceDesPieces;
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
    @Inject(DOSSIER_KYC_QUERY)
    private readonly dossiers: DossierKycQuery,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async execute(utilisateurId: number): Promise<KycImagesResult> {
    const kyc = await this.dossiers.parTitulaire(utilisateurId);
    if (!kyc) return { available: false };

    const lu = kyc.identiteExtrait
      ? {
          source: 'archive' as const,
          identiteExtrait: kyc.identiteExtrait,
          stripeReportId: kyc.stripeReportId,
        }
      : await this.lireChezLeFournisseur(kyc.fournisseurRef);

    if (!lu) return { available: false };

    const { documentFrontFileId, documentBackFileId, selfieFileId } =
      lu.identiteExtrait;

    const images = await this.identity.getImageUrls({
      documentFrontFileId,
      documentBackFileId,
      selfieFileId,
    });

    return { available: true, ...lu, images };
  }

  /**
   * Le rapport tel que le fournisseur le détient, quand nous n'en avons pas
   * encore la copie.
   *
   * **Pourquoi ce repli existe.** Le rapport n'est archivé chez nous que
   * lorsqu'un verdict est appliqué au dossier, c'est-à-dire lorsque le webhook
   * du fournisseur nous parvient. Tant qu'il ne parvient pas — plateforme non
   * joignable depuis l'extérieur, livraison échouée — les pièces existent chez
   * le prestataire et restent invisibles ici, y compris pour l'équipe
   * conformité qui doit précisément les examiner.
   *
   * **Pourquoi il reste un repli, et non le chemin principal.** Les
   * identifiants de fichier du fournisseur expirent : la copie locale est ce
   * qui tient la conservation de cinq ans (RG-KYC-10). Lire systématiquement
   * chez lui reviendrait à faire dépendre une obligation réglementaire de la
   * durée de vie d'une URL distante — et à payer un aller-retour réseau à
   * chaque consultation d'un écran d'administration.
   *
   * **Rien n'est écrit ici.** C'est une lecture, et une lecture ne modifie pas
   * l'état métier (§11) ; l'archivage durable appartient au chemin de
   * réconciliation, `POST /kyc/me/synchroniser`.
   */
  private async lireChezLeFournisseur(sessionId: string | null): Promise<{
    source: SourceDesPieces;
    identiteExtrait: KycIdentiteExtrait;
    stripeReportId: string | null;
  } | null> {
    if (!sessionId) return null;

    const rapport = await this.identity.extractReportData(sessionId);
    if (!rapport) return null;

    return {
      source: 'fournisseur',
      stripeReportId: rapport.reportId,
      identiteExtrait: {
        nom: rapport.nom,
        prenom: rapport.prenom,
        dateNaissance: rapport.dateNaissance,
        nationalite: rapport.nationalite,
        typeDocument: rapport.typeDocument,
        numeroDocument: rapport.numeroDocument,
        dateExpiration: rapport.dateExpiration,
        documentFrontFileId: rapport.documentFrontFileId,
        documentBackFileId: rapport.documentBackFileId,
        selfieFileId: rapport.selfieFileId,
      },
    };
  }
}
