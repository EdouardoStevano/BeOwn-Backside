import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
} from 'src/onboarding/application/ports/identity-verification.port';

/**
 * Rapatrie chez nous le rapport de vérification et les pièces justificatives.
 *
 * Séparé du traitement du verdict parce que ce n'est pas la même chose : la
 * validation est acquise dès l'écriture du statut, ceci n'en est que la pièce
 * jointe. Un rapport absent laisse le dossier validé — et c'est voulu, un
 * échec de téléchargement ne doit pas remettre en cause une identité établie.
 *
 * C'est aussi ce qui rend l'archivage nécessaire : les identifiants de fichier
 * du fournisseur **expirent**. Sans copie chez nous, la conservation de cinq
 * ans qu'impose RG-KYC-10 ne tiendrait qu'à la durée de vie d'une URL
 * distante.
 */
@Injectable()
export class ArchivageRapportKycService {
  private readonly logger = new Logger(ArchivageRapportKycService.name);

  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async archiver(sessionId: string, utilisateurId: number): Promise<void> {
    const rapport = await this.identity.extractReportData(sessionId);
    if (!rapport) return;

    const dossier = `kyc/${utilisateurId}`;

    // Les trois pièces en parallèle : elles ne dépendent pas les unes des
    // autres, et une vérification en porte jusqu'à trois.
    const [recto, verso, selfie] = await Promise.all([
      this.copier(
        rapport.documentFrontFileId,
        dossier,
        `kyc_front_${utilisateurId}.jpg`,
      ),
      this.copier(
        rapport.documentBackFileId,
        dossier,
        `kyc_back_${utilisateurId}.jpg`,
      ),
      this.copier(
        rapport.selfieFileId,
        dossier,
        `kyc_selfie_${utilisateurId}.jpg`,
      ),
    ]);

    const profil = await this.profils.parTitulaire(utilisateurId);
    profil.enregistrerRapportKyc(rapport.reportId, {
      nom: rapport.nom,
      prenom: rapport.prenom,
      dateNaissance: rapport.dateNaissance,
      nationalite: rapport.nationalite,
      typeDocument: rapport.typeDocument,
      numeroDocument: rapport.numeroDocument,
      dateExpiration: rapport.dateExpiration,
      // Repli sur l'identifiant du fournisseur si la copie a échoué : mieux
      // vaut une référence périssable que pas de référence du tout.
      documentFrontFileId: recto ?? rapport.documentFrontFileId,
      documentBackFileId: verso ?? rapport.documentBackFileId,
      selfieFileId: selfie ?? rapport.selfieFileId,
    });
    await this.profils.save(profil);

    this.logger.log(
      `Rapport KYC archivé : userId=${utilisateurId} reportId=${rapport.reportId} ` +
        `copies: recto=${!!recto} verso=${!!verso} selfie=${!!selfie}`,
    );
  }

  /** Une pièce absente n'est pas un échec : tous les documents n'ont pas de verso. */
  private copier(
    fichierId: string | undefined,
    dossier: string,
    nom: string,
  ): Promise<string | undefined> {
    if (!fichierId) return Promise.resolve(undefined);
    return this.identity.downloadAndUploadToCloudinary(fichierId, dossier, nom);
  }
}
