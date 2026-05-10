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
  ): Promise<UploadResult> {
    const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `beown/${folder}`,
          resource_type: resourceType,
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
      publicUrl: result.secure_url,
    };
  }

  async getSignedUrl(publicId: string, expiresInMinutes = 60): Promise<string> {
    const timestamp = Math.round(Date.now() / 1000) + expiresInMinutes * 60;
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      type: 'authenticated',
      expires_at: timestamp,
    });
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err) {
      this.logger.warn(`Impossible de supprimer ${publicId}: ${err?.message}`);
    }
  }

  isObjectName(pathOrUrl: string): boolean {
    return !pathOrUrl.startsWith('http');
  }
}
