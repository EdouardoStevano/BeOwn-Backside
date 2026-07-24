import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EmbeddedSignatureResult {
  requestId: string;
  signerId: string;
  signingUrl: string;
}

@Injectable()
export class YouSignService {
  private readonly logger = new Logger(YouSignService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      configService.get<string>('YOUSIGN_BASE_URL') ??
      'https://api-sandbox.yousign.app/v3';
    this.apiKey = configService.get<string>('YOUSIGN_API_KEY') ?? '';
    this.webhookSecret =
      configService.get<string>('YOUSIGN_WEBHOOK_SECRET') ?? '';
  }

  /**
   * Sanitize text fields for YouSign API compliance
   * Removes unauthorized characters that cause 400 errors
   */
  private sanitizeForYouSign(text: string): string {
    const original = text;
    const sanitized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-zA-Z\s]/g, '') // Keep only basic ASCII letters and spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Log if sanitization made changes for debugging
    if (original !== sanitized) {
      this.logger.debug(`YouSign sanitization: "${original}" → "${sanitized}"`);
    }

    // Return empty string if result is empty to avoid API issues
    return sanitized || 'UNKNOWN';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouSign ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as T;
  }

  async createEmbeddedSignatureRequest(params: {
    documentBuffer: Buffer;
    documentName: string;
    signerEmail: string;
    signerFirstname: string;
    signerLastname: string;
    expiresAt?: Date;
    successRedirectUrl?: string;
    errorRedirectUrl?: string;
  }): Promise<EmbeddedSignatureResult> {
    const expiresAt =
      params.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 1 — Créer la demande de signature
    const signatureRequest = await this.request<{ id: string }>(
      'POST',
      '/signature_requests',
      {
        name: `BeOwn — ${params.documentName.replace('.pdf', '')}`,
        delivery_mode: 'none',
        expiration_date: expiresAt.toISOString().split('T')[0],
        timezone: 'Africa/Dakar',
      },
    );
    this.logger.debug(`YouSign request created: ${signatureRequest.id}`);

    // 2 — Uploader le document PDF
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(params.documentBuffer)], {
        type: 'application/pdf',
      }),
      params.documentName,
    );
    formData.append('nature', 'signable_document');

    const uploadRes = await fetch(
      `${this.baseUrl}/signature_requests/${signatureRequest.id}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      },
    );
    if (!uploadRes.ok) {
      throw new Error(`YouSign doc upload error: ${await uploadRes.text()}`);
    }
    const document = (await uploadRes.json()) as { id: string };

    // 3 — Ajouter le signataire avec champ de signature
    const signer = await this.request<{ id: string; signature_link?: string }>(
      'POST',
      `/signature_requests/${signatureRequest.id}/signers`,
      {
        info: {
          first_name: this.sanitizeForYouSign(
            params.signerFirstname || 'Investisseur',
          ),
          last_name: this.sanitizeForYouSign(params.signerLastname || ''),
          email: params.signerEmail,
          locale: 'fr',
        },
        signature_level: 'electronic_signature',
        signature_authentication_mode: 'no_otp',
        fields: [
          {
            document_id: document.id,
            type: 'signature',
            page: 1,
            x: 390,
            y: 700,
            width: 150,
            height: 50,
          },
        ],
      },
    );

    // 4 — Activer la demande
    await this.request(
      'POST',
      `/signature_requests/${signatureRequest.id}/activate`,
    );

    // 5 — Obtenir le lien de signature embarqué
    // YouSign v3 sandbox: embedded_signing_link endpoint may not be available,
    // fall back to signature_link from signer object
    let signingUrl: string = signer.signature_link ?? '';
    if (!signingUrl) {
      try {
        const linkRes = await this.request<{ url: string }>(
          'POST',
          `/signature_requests/${signatureRequest.id}/signers/${signer.id}/embedded_signing_link`,
          {},
        );
        signingUrl = linkRes.url;
      } catch {
        const signerDetails = await this.request<{
          signature_link?: string;
          id: string;
        }>(
          'GET',
          `/signature_requests/${signatureRequest.id}/signers/${signer.id}`,
        );
        signingUrl = signerDetails.signature_link ?? '';
        this.logger.debug(`Signer signature_link: ${signingUrl}`);
      }
    }

    this.logger.log(
      `YouSign embedded link created for request ${signatureRequest.id}`,
    );

    return {
      requestId: signatureRequest.id,
      signerId: signer.id,
      signingUrl,
    };
  }

  async getSignatureRequestStatus(requestId: string): Promise<string> {
    const sr = await this.request<{ status: string }>(
      'GET',
      `/signature_requests/${requestId}`,
    );
    return sr.status;
  }

  async downloadSignedDocument(requestId: string): Promise<Buffer> {
    const docs = await this.request<
      { data?: { id: string }[] } | { id: string }[]
    >('GET', `/signature_requests/${requestId}/documents`);
    const list: { id: string }[] = Array.isArray(docs)
      ? docs
      : ((docs as any).data ?? []);
    const docId = list[0]?.id;
    if (!docId) throw new Error(`No documents found for request ${requestId}`);

    const res = await fetch(
      `${this.baseUrl}/signature_requests/${requestId}/documents/${docId}/download?version=completed`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) {
      throw new Error(`YouSign doc download error: ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async cancelSignatureRequest(requestId: string): Promise<void> {
    try {
      await this.request('POST', `/signature_requests/${requestId}/cancel`, {
        reason: "Annulé par l'utilisateur",
      });
    } catch (err) {
      this.logger.warn(
        `Could not cancel YouSign request ${requestId}: ${err?.message}`,
      );
    }
  }

  verifyWebhookSignature(rawBody: string, headerSignature: string): boolean {
    if (!this.webhookSecret) return true;
    const expected = `sha256=${crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex')}`;
    return expected === headerSignature;
  }
}
