import { Injectable } from '@nestjs/common';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import {
  PieceJustificativeStorage,
  PieceRangee,
} from 'src/compliance/application/ports/piece-justificative-storage.port';

/**
 * Range les justificatifs de conformité dans le magasin de fichiers partagé.
 *
 * Anti-Corruption Layer minimale (§20) : elle traduit le vocabulaire du port —
 * une pièce, une société — vers celui du magasin — des octets, un dossier, un
 * drapeau de visibilité. Le domaine ne connaît donc ni `CloudStorageService`,
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
    societeId: string;
  }): Promise<PieceRangee> {
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      fichier.contenu,
      fichier.nomOrigine,
      fichier.mimeType,
      // Une société par dossier : c'est ce qui rendra possible une purge ciblée
      // à l'échéance des cinq ans de conservation.
      `conformite/societes/${fichier.societeId}`,
      false,
    );

    return { cleStockage: objectName, url: publicUrl };
  }
}
