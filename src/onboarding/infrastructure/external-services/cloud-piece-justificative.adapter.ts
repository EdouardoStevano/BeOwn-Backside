import { Injectable } from '@nestjs/common';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import {
  PieceJustificativeStorage,
  PieceRangee,
  ProprietaireDeLaPiece,
} from 'src/onboarding/application/ports/piece-justificative-storage.port';

/**
 * Range les justificatifs de conformité dans le magasin de fichiers partagé.
 *
 * Anti-Corruption Layer minimale (§20) : elle traduit le vocabulaire du port —
 * une pièce, son propriétaire — vers celui du magasin — des octets, un dossier,
 * un drapeau de visibilité. Le domaine ne connaît donc ni `CloudStorageService`,
 * ni le fournisseur derrière.
 *
 * **`isPublic` est forcé à `false`, et ce n'est pas configurable.** Un extrait
 * KBIS ou une pièce d'identité de bénéficiaire ne se publie pas : laisser
 * l'appelant en décider, c'est attendre le jour où quelqu'un passera `true`.
 */
@Injectable()
export class CloudPieceJustificativeAdapter implements PieceJustificativeStorage {
  constructor(private readonly cloudStorage: CloudStorageService) {}

  async stocker(fichier: {
    contenu: Buffer;
    nomOrigine: string;
    mimeType: string;
    proprietaire: ProprietaireDeLaPiece;
  }): Promise<PieceRangee> {
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      fichier.contenu,
      fichier.nomOrigine,
      fichier.mimeType,
      dossierDe(fichier.proprietaire),
      false,
    );

    return { cleStockage: objectName, url: publicUrl };
  }
}

/**
 * Un dossier par propriétaire : c'est ce qui rendra possible une purge ciblée à
 * l'échéance des cinq ans de conservation (RG-KYC-10).
 *
 * Les deux branches sont séparées jusque dans le chemin — `societes/` et
 * `titulaires/` — parce que les identifiants ne vivent pas dans le même espace :
 * un `societeId` est un uuid, un `titulaireId` un entier, et les mêler sous un
 * même préfixe rendrait la collision possible le jour où l'un des deux
 * changerait de forme.
 */
function dossierDe(proprietaire: ProprietaireDeLaPiece): string {
  return 'societeId' in proprietaire
    ? `conformite/societes/${proprietaire.societeId}`
    : `conformite/titulaires/${proprietaire.titulaireId}`;
}
