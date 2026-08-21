import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  TOKEN_SERVICE,
  type TokenService,
} from 'src/iam/domains/ports/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/users/applications/ports/repositories/user.repository';
import { SocialInterface } from '../../infrastructures/interfaces/social.interface';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { UserStatus } from 'src/users/domains/user';

@Injectable()
export class SocialAuthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly usersRepository: UserRepository,
    private readonly userFactory: UserFactory,
  ) {}

  async authenticate(social: SocialInterface): Promise<{
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
  }> {
    try {
      const existing = await this.usersRepository.findOneBySocialId(
        social.socialId,
      );

      if (existing) {
        // Le fournisseur a déjà vérifié l'adresse : on aligne l'email ET le
        // cycle de vie du compte. Le rattrapage du statut couvre aussi les
        // comptes sociaux créés avant ce correctif, restés bloqués en CREE.
        let mustPersist = false;

        if (!existing.userEmail.isVerified) {
          existing.userEmail.verify();
          mustPersist = true;
        }

        // On ne fait qu'AVANCER le cycle de vie : un statut plus avancé (ACTIF)
        // ou terminal (SUSPENDU, CLOS, SUPPRIME) n'est jamais réécrit.
        if (existing.status === UserStatus.CREE) {
          existing.status = UserStatus.EMAIL_VERIFIE;
          mustPersist = true;
        }

        if (mustPersist) {
          await this.usersRepository.update(existing);
        }
        const tokens = await this.tokenService.generateTokens({
          email: existing.userEmail.email,
          sub: existing.userId,
          role: existing.role,
          refreshTokenId: null,
        });
        return { ...tokens, isNewUser: false };
      }

      const newUser = await this.userFactory.create({
        password: null,
        firstname: social.firstname,
        lastname: social.lastname ?? null,
        email: social.email,
        socialId: social.socialId,
        emailVerified: true,
      });

      // La fabrique marque l'email vérifié (emailVerified: true ci-dessus) mais
      // ne pose aucun statut : sans cette ligne le compte naîtrait CREE (valeur
      // par défaut de la colonne) tout en ayant un email vérifié — incohérence
      // qui l'affichait « Email non vérifié » côté Admin.
      newUser.status = UserStatus.EMAIL_VERIFIE;

      const savedUser = await this.usersRepository.save(newUser);
      const tokens = await this.tokenService.generateTokens({
        email: savedUser.userEmail.email,
        sub: savedUser.userId,
        role: savedUser.role,
        refreshTokenId: null,
      });
      return { ...tokens, isNewUser: true };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException('Email already in use');
      }

      throw new InternalServerErrorException('Authentification échouée');
    }
  }
}
