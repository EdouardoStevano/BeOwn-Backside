import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import tokenSignerConfig from './infrastructure/config/token-signer.config';
import { TOKEN_SIGNER } from './applications/ports/token-signer.port';
import { JwtTokenSignerAdapter } from './infrastructure/jwt-token-signer.adapter';

/**
 * Brique partagée : signature et vérification de tokens, sans aucune notion
 * de token métier. Elle vit dans `shared/` parce que le choix du driver est
 * transverse — tout contexte qui doit émettre un token porteur d'un lien ou
 * d'une session s'appuie dessus — alors que la sémantique des tokens (claims,
 * TTL, usage unique) appartient au contexte émetteur.
 *
 * Aujourd'hui, seul IAM consomme `TOKEN_SIGNER` ; il l'expose à son tour via
 * son `TokenService` applicatif. Un autre contexte qui devrait signer ses
 * propres tokens importerait ce module plutôt que de dépendre d'IAM.
 */
@Module({
  imports: [
    JwtModule.registerAsync(tokenSignerConfig.asProvider()),
    ConfigModule.forFeature(tokenSignerConfig),
  ],
  providers: [{ provide: TOKEN_SIGNER, useClass: JwtTokenSignerAdapter }],
  exports: [TOKEN_SIGNER],
})
export class TokenSignerModule {}
