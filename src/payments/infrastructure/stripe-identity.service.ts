import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';

export const STRIPE_IDENTITY_SERVICE = Symbol('STRIPE_IDENTITY_SERVICE');

export interface VerificationSessionResult {
  sessionId: string;
  url: string;
  status: string;
}

export interface KycImageUrls {
  documentFrontUrl?: string;
  documentBackUrl?: string;
  selfieUrl?: string;
  // If URLs are already stored in Cloudinary
  storedInCloudinary?: boolean;
}

export interface KycReportData {
  reportId: string;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  nationalite?: string;
  typeDocument?: string;
  numeroDocument?: string;
  dateExpiration?: string;
  documentFrontFileId?: string;
  documentBackFileId?: string;
  selfieFileId?: string;
}

export interface StripeIdentityService {
  createVerificationSession(userId: number, email: string): Promise<VerificationSessionResult>;
  retrieveVerificationSession(sessionId: string): Promise<VerificationSessionResult>;
  cancelVerificationSession(sessionId: string): Promise<void>;
  extractReportData(sessionId: string): Promise<KycReportData | null>;
  downloadAndUploadToCloudinary(fileId: string, folder: string, filename: string): Promise<string | undefined>;
  getImageUrls(reportData: Pick<KycReportData, 'documentFrontFileId' | 'documentBackFileId' | 'selfieFileId'>): Promise<KycImageUrls>;
}

@Injectable()
export class StripeIdentityServiceImpl implements StripeIdentityService {
  private readonly stripe: any;
  private readonly stripeKey: string;
  private readonly logger = new Logger(StripeIdentityServiceImpl.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cloudStorage: CloudStorageService,
  ) {
    this.stripeKey = config.getOrThrow('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(this.stripeKey, {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  async createVerificationSession(
    userId: number,
    email: string,
  ): Promise<VerificationSessionResult> {
    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: String(userId), email },
      options: {
        document: {
          require_matching_selfie: true,
          allowed_types: ['id_card', 'passport', 'driving_license'],
        },
      },
      return_url: `${this.config.get('FRONTEND_URL')}/auth/kyc?from=stripe`,
    });

    return {
      sessionId: session.id,
      url: session.url!,
      status: session.status,
    };
  }

  async retrieveVerificationSession(
    sessionId: string,
  ): Promise<VerificationSessionResult> {
    const session =
      await this.stripe.identity.verificationSessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      url: session.url ?? '',
      status: session.status,
    };
  }

  async cancelVerificationSession(sessionId: string): Promise<void> {
    await this.stripe.identity.verificationSessions.cancel(sessionId);
  }

  /** Downloads a Stripe Identity file and uploads it to Cloudinary. Returns the Cloudinary public URL. */
  async downloadAndUploadToCloudinary(
    fileId: string,
    folder: string,
    filename: string,
  ): Promise<string | undefined> {
    try {
      const res = await fetch(`https://files.stripe.com/v1/files/${fileId}/contents`, {
        headers: { Authorization: `Bearer ${this.stripeKey}` },
      });
      if (!res.ok) {
        this.logger.warn(`Stripe file download failed: ${fileId} → ${res.status}`);
        return undefined;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';

      const { publicUrl } = await this.cloudStorage.upload(
        buffer,
        filename,
        contentType,
        folder,
      );
      return publicUrl;
    } catch (err) {
      this.logger.warn(`downloadAndUploadToCloudinary failed for ${fileId}: ${err?.message}`);
      return undefined;
    }
  }

  async extractReportData(sessionId: string): Promise<KycReportData | null> {
    try {
      const session = await this.stripe.identity.verificationSessions.retrieve(sessionId, {
        expand: ['last_verification_report'],
      });
      const report = session.last_verification_report as any;
      if (!report?.id) return null;

      const doc = report.document;
      const selfie = report.selfie;

      return {
        reportId: report.id,
        nom: doc?.name?.last_name ?? undefined,
        prenom: doc?.name?.first_name ?? undefined,
        dateNaissance: doc?.dob ? `${doc.dob.year}-${String(doc.dob.month).padStart(2,'0')}-${String(doc.dob.day).padStart(2,'0')}` : undefined,
        nationalite: doc?.nationality ?? undefined,
        typeDocument: doc?.type ?? undefined,
        numeroDocument: doc?.number ?? undefined,
        dateExpiration: doc?.expiration_date
          ? `${doc.expiration_date.year}-${String(doc.expiration_date.month).padStart(2,'0')}-${String(doc.expiration_date.day).padStart(2,'0')}`
          : undefined,
        documentFrontFileId: doc?.files?.front ?? undefined,
        documentBackFileId: doc?.files?.back ?? undefined,
        selfieFileId: selfie?.document?.file ?? selfie?.selfie?.file ?? undefined,
      };
    } catch (err) {
      this.logger.warn(`extractReportData failed: ${err?.message}`);
      return null;
    }
  }

  async getImageUrls(
    reportData: Pick<KycReportData, 'documentFrontFileId' | 'documentBackFileId' | 'selfieFileId'>,
  ): Promise<KycImageUrls> {
    // If the IDs are already Cloudinary URLs (stored after upload), return them directly
    const isCloudinaryUrl = (s?: string) =>
      !!s && s.startsWith('https://res.cloudinary.com/');

    if (
      isCloudinaryUrl(reportData.documentFrontFileId) ||
      isCloudinaryUrl(reportData.documentBackFileId) ||
      isCloudinaryUrl(reportData.selfieFileId)
    ) {
      return {
        documentFrontUrl: reportData.documentFrontFileId,
        documentBackUrl: reportData.documentBackFileId,
        selfieUrl: reportData.selfieFileId,
        storedInCloudinary: true,
      };
    }

    // Fallback: generate temporary Stripe file links (1h)
    const makeLink = async (fileId?: string): Promise<string | undefined> => {
      if (!fileId) return undefined;
      try {
        const link = await this.stripe.fileLinks.create({
          file: fileId,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        return link.url;
      } catch (err) {
        this.logger.warn(`fileLink creation failed for ${fileId}: ${err?.message}`);
        return undefined;
      }
    };

    const [documentFrontUrl, documentBackUrl, selfieUrl] = await Promise.all([
      makeLink(reportData.documentFrontFileId),
      makeLink(reportData.documentBackFileId),
      makeLink(reportData.selfieFileId),
    ]);

    return { documentFrontUrl, documentBackUrl, selfieUrl, storedInCloudinary: false };
  }
}
