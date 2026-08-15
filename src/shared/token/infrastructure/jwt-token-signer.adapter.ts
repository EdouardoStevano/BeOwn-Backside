import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import tokenSignerConfig from './config/token-signer.config';
import {
  TokenSignOptions,
  TokenSigner,
  TokenVerifyOptions,
} from '../applications/ports/token-signer.port';

/**
 * Adapter JWT du port `TokenSigner` (§9 — Adapter). Il ne connaît aucun token
 * métier : il signe la charge utile qu'on lui donne et vérifie celle qu'on lui
 * présente. Remplacer JWT par un autre mécanisme ne demande que d'écrire une
 * autre classe de cette taille.
 */
@Injectable()
export class JwtTokenSignerAdapter implements TokenSigner {
  constructor(
    private readonly jwtService: JwtService,

    @Inject(tokenSignerConfig.KEY)
    private readonly config: ConfigType<typeof tokenSignerConfig>,
  ) {}

  sign<TPayload extends object>(
    payload: TPayload,
    options: TokenSignOptions,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { ...payload },
      {
        secret: this.config.secret,
        issuer: this.config.issuer,
        audience: options.audience ?? this.config.audience,
        expiresIn: options.expiresIn,
      },
    );
  }

  verify<TPayload extends object>(
    token: string,
    options?: TokenVerifyOptions,
  ): Promise<TPayload> {
    return this.jwtService.verifyAsync<TPayload>(token, {
      secret: this.config.secret,
      issuer: this.config.issuer,
      audience: options?.audience ?? this.config.audience,
    });
  }
}
