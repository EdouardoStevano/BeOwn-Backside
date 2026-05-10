import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface SumsubTokenResult {
  token: string;
  userId: string;
}

@Injectable()
export class SumsubService {
  private readonly logger = new Logger(SumsubService.name);
  private readonly baseUrl = 'https://api.sumsub.com';
  private readonly appToken: string;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.appToken = config.getOrThrow('SUMSUB_APP_TOKEN');
    this.secretKey = config.getOrThrow('SUMSUB_SECRET_KEY');
  }

  private buildSignature(method: string, path: string, ts: number, body = ''): string {
    const msg = `${ts}${method.toUpperCase()}${path}${body}`;
    return crypto.createHmac('sha256', this.secretKey).update(msg).digest('hex');
  }

  private buildHeaders(method: string, path: string, body = ''): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000);
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-App-Token': this.appToken,
      'X-App-Access-Ts': String(ts),
      'X-App-Access-Sig': this.buildSignature(method, path, ts, body),
    };
  }

  async generateAccessToken(
    userId: string,
    levelName?: string,
    ttlInSecs = 600,
  ): Promise<SumsubTokenResult> {
    const level =
      levelName ??
      this.config.get<string>('SUMSUB_LEVEL_NAME', 'id-and-liveness');
    const path =
      `/resources/accessTokens` +
      `?userId=${encodeURIComponent(userId)}` +
      `&levelName=${encodeURIComponent(level)}` +
      `&ttlInSecs=${ttlInSecs}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.buildHeaders('POST', path),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Sumsub generateAccessToken error (${res.status}): ${text}`);
      throw new Error(`Sumsub API returned ${res.status}: ${text}`);
    }

    const data = (await res.json()) as SumsubTokenResult;
    this.logger.log(`Sumsub access token generated for userId=${userId}`);
    return data;
  }

  verifyWebhookSignature(rawBody: Buffer | string, receivedDigest: string): boolean {
    const secret = this.config.get<string>('SUMSUB_WEBHOOK_SECRET', '');
    if (!secret) {
      this.logger.warn('SUMSUB_WEBHOOK_SECRET not set — skipping signature check');
      return true;
    }
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return expected === receivedDigest;
  }
}
