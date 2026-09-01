import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  SignatureProviderUnavailableError,
  motifIndisponibilite,
} from './signature-provider.error';

export interface EmbeddedSignatureResult {
  requestId: string;
  signerId: string;
  signingUrl: string;
}

/** Au-delà, on considère que le prestataire ne répondra pas. */
const DELAI_APPEL_MS_PAR_DEFAUT = 20_000;

@Injectable()
export class YouSignService {
  private readonly logger = new Logger(YouSignService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly delaiAppelMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      configService.get<string>('YOUSIGN_BASE_URL') ??
      'https://api-sandbox.yousign.app/v3';
    this.apiKey = configService.get<string>('YOUSIGN_API_KEY') ?? '';
    this.webhookSecret =
      configService.get<string>('YOUSIGN_WEBHOOK_SECRET') ?? '';
    const delaiConfigure = Number(
      configService.get<string>('YOUSIGN_TIMEOUT_MS'),
    );
    this.delaiAppelMs =
      Number.isFinite(delaiConfigure) && delaiConfigure > 0
        ? delaiConfigure
        : DELAI_APPEL_MS_PAR_DEFAUT;
  }

  /**
   * Appel réseau au prestataire, borné dans le temps.
   *
   * Sans borne, une API qui ne répond plus fait pendre la requête de
   * l'utilisateur jusqu'au timeout du reverse proxy — et l'ordre reste alors
   * en `ACCEPTE` bien plus longtemps que nécessaire. Un délai dépassé est une
   * indisponibilité, au même titre qu'un 503 : il est signalé comme tel.
   */
  private async appeler(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), this.delaiAppelMs);
    try {
      return await fetch(url, { ...init, signal: controleur.signal });
    } catch (err: unknown) {
      const delaiDepasse = controleur.signal.aborted;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `YouSign ${operation} injoignable (${delaiDepasse ? 'délai dépassé' : 'réseau'}) : ${detail}`,
      );
      throw new SignatureProviderUnavailableError({
        operation,
        motif: delaiDepasse ? 'delai_depasse' : 'reseau',
        detailFournisseur: detail,
      });
    } finally {
      clearTimeout(minuterie);
    }
  }

  /**
   * Corps brut d'une réponse en échec — ou lève si l'échec incombe au
   * prestataire (panne, abonnement expiré, clé refusée, quota, délai).
   *
   * Les échecs APPLICATIFS (400, 404, 422…) repartent avec leur corps : le
   * caller compose son message historique et le traitement reste identique.
   */
  private async corpsOuIndisponibilite(
    res: Response,
    operation: string,
  ): Promise<string> {
    const texte = await res.text();
    const motif = motifIndisponibilite(res.status);
    if (!motif) return texte;

    // Le journal serveur garde TOUT : c'est ici qu'un exploitant lit
    // « subscription expired » et va renouveler l'abonnement.
    this.logger.error(
      `YouSign ${operation} → ${res.status} (${motif}) : ${texte}`,
    );
    throw new SignatureProviderUnavailableError({
      operation,
      motif,
      statutFournisseur: res.status,
      detailFournisseur: texte,
    });
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
    const res = await this.appeler(
      `${this.baseUrl}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      `${method} ${path}`,
    );
    if (!res.ok) {
      const text = await this.corpsOuIndisponibilite(res, `${method} ${path}`);
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
        timezone: 'Indian/Reunion',
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

    const uploadRes = await this.appeler(
      `${this.baseUrl}/signature_requests/${signatureRequest.id}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      },
      'POST /signature_requests/:id/documents',
    );
    if (!uploadRes.ok) {
      throw new Error(
        `YouSign doc upload error: ${await this.corpsOuIndisponibilite(
          uploadRes,
          'POST /signature_requests/:id/documents',
        )}`,
      );
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

    const operation = 'GET /signature_requests/:id/documents/:docId/download';
    const res = await this.appeler(
      `${this.baseUrl}/signature_requests/${requestId}/documents/${docId}/download?version=completed`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
      operation,
    );
    if (!res.ok) {
      throw new Error(
        `YouSign doc download error: ${await this.corpsOuIndisponibilite(res, operation)}`,
      );
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
