import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuthSession } from 'src/iam/applications/models/auth-token';
import { TokenService } from '../../services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { SocialProfile } from 'src/iam/applications/models/social-profile';
import { UserFactory } from '../../../domains/factories/user.factory';
import {
  EmailAlreadyRegisteredError,
  SocialAuthFailedError,
} from 'src/iam/domains/errors';
import { NO_MFA } from 'src/iam/domains/mappers/user.mapper';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

@Injectable()
export class SocialAuthUseCase {
  private readonly logger = new Logger(SocialAuthUseCase.name);

  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly userFactory: UserFactory,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  async authenticate(
    social: SocialProfile,
  ): Promise<AuthSession & { isNewUser: boolean }> {
    try {
      const existing = await this.usersRepository.findOneBySocialId(
        social.socialId,
      );

      if (existing) {
        // Auto-verify email for existing social users (provider already verified it)
        if (!existing.isEmailVerified()) {
          existing.markEmailAsVerified();
          await this.usersRepository.update(existing);
        }
        // Une connexion OAuth est une connexion : elle compte au même titre
        // qu'un sign-in par mot de passe pour le « dernier contact émanant du
        // prospect » (barème RGPD ligne 2). L'écriture est volontairement
        // enveloppée : le `catch` global de cette méthode transforme TOUTE
        // exception en `SocialAuthFailedError` — une trace en échec ferait
        // rater la connexion, ce qui est hors de question.
        try {
          await this.usersRepository.touchLastLogin(
            existing.userId,
            new Date(),
          );
        } catch (error) {
          this.logger.warn(
            `lastLoginAt non écrit pour le compte #${existing.userId} : ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        const tokens = await this.tokenService.generateTokens({
          email: existing.email,
          sub: existing.userId,
          role: existing.role,
          refreshTokenId: null,
        });

        // Publié, mais pas opposé : ce parcours ne réclame pas le second
        // facteur — le fournisseur a déjà authentifié le porteur. Le front lit
        // donc ici l'état réel du compte, comme sur toute autre session.
        const activeMfaMethod = await this.mfaFactors.findActiveMethod(
          existing.userId,
        );

        return {
          ...tokens,
          user: existing.toJSON({
            enabled: activeMfaMethod !== null,
            method: activeMfaMethod,
          }),
          isNewUser: false,
        };
      }

      const newUser = await this.userFactory.create({
        password: null,
        firstname: social.firstname,
        lastname: social.lastname ?? null,
        email: social.email,
        socialId: social.socialId,
        emailVerified: true,
      });

      const savedUser = await this.usersRepository.save(newUser);
      const tokens = await this.tokenService.generateTokens({
        email: savedUser.email,
        sub: savedUser.userId,
        role: savedUser.role,
        refreshTokenId: null,
      });
      // Compte qui vient de naître : aucun facteur ne peut y être armé, rien à
      // relire.
      return {
        ...tokens,
        user: savedUser.toJSON(NO_MFA),
        isNewUser: true,
      };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new EmailAlreadyRegisteredError('Email already in use');
      }

      throw new SocialAuthFailedError();
    }
  }
}
