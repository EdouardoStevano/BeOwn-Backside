import { Injectable } from '@nestjs/common';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import type {
  FichierImage,
  ImageStockee,
  ProjectPhotoStorage,
} from 'src/catalog/application/ports/project-photo-storage.port';

/** Dossier de rangement des photos de fiche chez le fournisseur. */
const DOSSIER = 'projets';

/**
 * L'adapter du port {@link ProjectPhotoStorage} (§20, §37.1).
 *
 * Tout ce qu'il fait est de traduire : le port parle d'images de fiche, le
 * service partagé parle de dossiers, de `resource_type` et d'objets publics ou
 * authentifiés. Cette traduction est exactement ce qui garde Cloudinary hors du
 * domaine (§32) — et ce qui rendra son remplacement local, le jour où le
 * stockage passera sur Scaleway ou OVHcloud comme §15 le prévoit.
 *
 * Il ne décide qu'une chose, et elle est technique : une photo de fiche est
 * déposée en accès public. Le *pourquoi* est métier et vit dans le port ; le
 * *comment* — `type: 'upload'` plutôt que `'authenticated'` — est ici.
 */
@Injectable()
export class CloudinaryProjectPhotoAdapter implements ProjectPhotoStorage {
  constructor(private readonly cloudStorage: CloudStorageService) {}

  async deposer(fichier: FichierImage): Promise<ImageStockee> {
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      fichier.contenu,
      fichier.nomOriginal,
      fichier.mimeType,
      DOSSIER,
      true,
    );

    return { cleStockage: objectName, url: publicUrl };
  }

  /** @see ProjectPhotoStorage.effacer — pourquoi l'absence n'est pas une erreur. */
  async effacer(cleStockage: string): Promise<void> {
    await this.cloudStorage.delete(cleStockage);
  }
}
