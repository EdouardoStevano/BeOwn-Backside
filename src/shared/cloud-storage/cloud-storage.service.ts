import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

export interface UploadResult {
  objectName: string; // Cloudinary public_id
  publicUrl: string;  // Cloudinary secure_url (CDN HTTPS)
}

@Injectable()
export class CloudStorageService implements OnModuleInit {
  private readonly logger = new Logger(CloudStorageService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    this.logger.log(
      `Cloudinary initialisé — cloud: ${this.config.get('CLOUDINARY_CLOUD_NAME')}`,
    );
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'documents',
    isPublic = false,
  ): Promise<UploadResult> {
    const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `beown/${folder}`,
          resource_type: resourceType,
          type: isPublic ? 'upload' : 'authenticated',
          use_filename: false,
          unique_filename: true,
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });

    return {
      objectName: result.public_id,
      // Private assets must never be persisted as a directly deliverable URL.
      // Consumers obtain a short-lived signed URL through getSignedUrl().
      publicUrl: isPublic ? result.secure_url : result.public_id,
    };
  }

  async getSignedUrl(
    publicId: string,
    expiresInMinutes = 60,
    resourceType: 'raw' | 'image' = 'raw',
  ): Promise<string> {
    const timestamp = Math.round(Date.now() / 1000) + expiresInMinutes * 60;
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: resourceType,
      sign_url: true,
      type: 'authenticated',
      expires_at: timestamp,
    });
  }

  /**
   * Détruit un objet chez Cloudinary. Best-effort par contrat : ne lève jamais,
   * pour qu'un effacement RGPD ne soit pas mis en échec par une panne du
   * sous-traitant.
   *
   * REND désormais l'issue (`true` = destruction demandée sans erreur) au lieu
   * de `void`. L'appelant RGPD annonçait « N fichier(s) distant(s) détruit(s) »
   * en comptant les appels, pas les succès : un échec réseau était journalisé
   * ici en avertissement et le rapport d'accountability (art. 5.2 RGPD)
   * affirmait quand même la destruction. Un rapport qui se trompe sur ce point
   * est pire que pas de rapport.
   *
   * Les deux `resource_type` sont tentés parce que l'objet peut avoir été
   * téléversé en `raw` (PDF) ou en `image` : seul l'un des deux appels vise le
   * bon objet, l'autre est un no-op — un objet déjà absent reste un succès, ce
   * qui rend l'opération rejouable.
   */
  async delete(publicId: string): Promise<boolean> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      return true;
    } catch (err) {
      this.logger.warn(`Impossible de supprimer ${publicId}: ${err?.message}`);
      return false;
    }
  }

  isObjectName(pathOrUrl: string): boolean {
    return !pathOrUrl.startsWith('http');
  }
}
