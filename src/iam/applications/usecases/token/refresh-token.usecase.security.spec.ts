import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenSignerAdapter } from 'src/shared/token/infrastructure/jwt-token-signer.adapter';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/auth/permissions.guard';
import { PERMISSIONS_KEY } from 'src/common/auth/require-permission.decorator';
import { IS_PUBLIC_KEY } from 'src/common/auth/public.decorator';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import {
  AccountClosedError,
  AccountSuspendedError,
  InvalidRefreshTokenError,
} from 'src/iam/domains/errors';
import { TokenService } from '../../services/token/token.service';
import { RefreshTokenUseCase } from './refresh-token.usecase';

/**
 * Faille corrigée (constat 2 du plan `porteur-pp-pm-acces.md`) : le rôle du
 * JWT n'était JAMAIS relu en base. `TokenService.refreshTokens` recopiait le
 * claim `role` de l'ancien refresh token dans le nouveau couple, et les deux
 * guards d'autorisation (`JwtAuthGuard`, `PermissionsGuard`) lisent le rôle
 * dans le token. Conséquence : un changement de rôle décidé par un
 * administrateur restait sans effet tant que l'utilisateur faisait tourner son
 * refresh token — une rétrogradation ou une révocation d'administrateur était
 * contournable indéfiniment.
 *
 * Ces tests éprouvent la chaîne réelle — vrai signeur JWT, vrais guards — sans
 * base ni réseau : le dépôt utilisateur et le cache de sessions sont des
 * implémentations en mémoire honorant le même contrat que les adapters.
 */

const SECRET = 'test-secret';

const buildSignerConfig = () => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
});

const buildTtlConfig = () => ({
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  unsubscribeTokenTtl: 7776000,
});

/**
 * Cache de sessions en mémoire — même contrat que `SessionCacheService`
 * (§LSP : l'implémentation de test honore le contrat, elle ne le contourne
 * pas). `invalidate` est ce que déclenche `PATCH /admin/investors/:id/role`.
 */
class InMemorySessionCache {
  private readonly refreshTokenIds = new Map<string, string>();

  insertRefreshTokenId(email: string, refreshTokenId: string): Promise<void> {
    this.refreshTokenIds.set(email, refreshTokenId);
    return Promise.resolve();
  }

  validateRefreshToken(email: string, refreshTokenId: string) {
    return Promise.resolve(this.refreshTokenIds.get(email) === refreshTokenId);
  }

  invalidateRefreshTokenId(email: string): Promise<void> {
    this.refreshTokenIds.delete(email);
    return Promise.resolve();
  }
}

const EMAIL = 'user@example.com';
const USER_ID = 42;

const makeHarness = (
  roleEnBase: UserRole = UserRole.INVESTISSEUR,
  status: UserStatus = UserStatus.ACTIF,
) => {
  const sessionCache = new InMemorySessionCache();
  const tokenService = new TokenService(
    new JwtTokenSignerAdapter(new JwtService(), buildSignerConfig() as any),
    sessionCache as any,
    buildTtlConfig() as any,
  );

  // Dépôt en mémoire : `role` est mutable pour rejouer une décision admin
  // survenue APRÈS l'ouverture de la session.
  const compte = {
    role: roleEnBase,
    status,
  };
  const userRepository = {
    findById: jest.fn(() =>
      Promise.resolve(
        buildUser({
          userId: USER_ID,
          email: EMAIL,
          emailVerified: true,
          role: compte.role,
          status: compte.status,
        }),
      ),
    ),
  };

  const mfaFactors = { findActiveMethod: jest.fn().mockResolvedValue(null) };

  const usecase = new RefreshTokenUseCase(
    tokenService,
    userRepository as any,
    mfaFactors as any,
  );

  /** Ouvre une session comme le ferait un sign-in, avec le rôle d'alors. */
  const ouvrirSession = (roleAuMomentDeLaConnexion: UserRole) =>
    tokenService.generateTokens({
      sub: USER_ID,
      email: EMAIL,
      role: roleAuMomentDeLaConnexion,
    } as any);

  return { usecase, tokenService, sessionCache, compte, ouvrirSession };
};

/** Contexte HTTP minimal : un Bearer token, comme le reçoit `JwtAuthGuard`. */
const httpContext = (accessToken: string) => {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: { authorization: `Bearer ${accessToken}` },
  };
  return {
    request,
    context: {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
};

describe('Rafraîchissement de session — le rôle vient de la base, pas du claim', () => {
  it("l'access token émis porte le rôle EN BASE, pas celui du token présenté", async () => {
    // Session ouverte du temps où le compte était super_admin…
    const { usecase, tokenService, compte, ouvrirSession } = makeHarness(
      UserRole.SUPER_ADMIN,
    );
    const { refreshToken } = await ouvrirSession(UserRole.SUPER_ADMIN);

    // …puis rétrogradation décidée par un administrateur.
    compte.role = UserRole.INVESTISSEUR;

    const session = await usecase.execute(refreshToken);

    const payload = await tokenService.verifyAccessToken(session.accessToken);
    expect(payload.role).toBe(UserRole.INVESTISSEUR);
    expect(payload.role).not.toBe(UserRole.SUPER_ADMIN);
    // Le profil renvoyé au front dit la même chose que le token.
    expect(session.user.role).toBe(UserRole.INVESTISSEUR);
  });

  it('le nouveau refresh token ne peut pas non plus ressusciter le rôle perdu', async () => {
    const { usecase, tokenService, compte, ouvrirSession } = makeHarness(
      UserRole.SUPER_ADMIN,
    );
    const premier = await ouvrirSession(UserRole.SUPER_ADMIN);
    compte.role = UserRole.INVESTISSEUR;

    // Deux rotations d'affilée : c'est exactement le contournement d'origine.
    const session1 = await usecase.execute(premier.refreshToken);
    const session2 = await usecase.execute(session1.refreshToken);

    const payload = await tokenService.verifyAccessToken(session2.accessToken);
    expect(payload.role).toBe(UserRole.INVESTISSEUR);
  });

  it('un rôle PROMU en base est pris en compte au rafraîchissement suivant', async () => {
    // Symétrie du contrat : la relecture n'est pas qu'un garde-fou de
    // rétrogradation, c'est la règle dans les deux sens.
    const { usecase, tokenService, compte, ouvrirSession } = makeHarness(
      UserRole.INVESTISSEUR,
    );
    const { refreshToken } = await ouvrirSession(UserRole.INVESTISSEUR);
    compte.role = UserRole.PORTEUR;

    const session = await usecase.execute(refreshToken);

    const payload = await tokenService.verifyAccessToken(session.accessToken);
    expect(payload.role).toBe(UserRole.PORTEUR);
  });
});

describe('Rétrogradation d’un super_admin — effet sur une route à permission', () => {
  /** Route protégée par `@RequirePermission('roles:assign')`. */
  const guardsFor = (accessToken: string, tokenService: TokenService) => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === IS_PUBLIC_KEY
          ? false
          : key === PERMISSIONS_KEY
            ? ['roles:assign']
            : undefined,
      );

    const { context } = httpContext(accessToken);
    return {
      jwtGuard: new JwtAuthGuard(tokenService, reflector),
      permissionsGuard: new PermissionsGuard(reflector),
      context,
    };
  };

  it('un super_admin rétrogradé se voit refuser la route (403) après refresh', async () => {
    const { usecase, tokenService, compte, ouvrirSession } = makeHarness(
      UserRole.SUPER_ADMIN,
    );
    const { refreshToken } = await ouvrirSession(UserRole.SUPER_ADMIN);
    compte.role = UserRole.INVESTISSEUR;

    const session = await usecase.execute(refreshToken);
    const { jwtGuard, permissionsGuard, context } = guardsFor(
      session.accessToken,
      tokenService,
    );

    await expect(jwtGuard.canActivate(context)).resolves.toBe(true);
    expect(() => permissionsGuard.canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('le même parcours laisse passer un super_admin toujours en poste', async () => {
    // Contre-épreuve : sans elle, un guard cassé ferait passer le test ci-dessus.
    const { usecase, tokenService, ouvrirSession } = makeHarness(
      UserRole.SUPER_ADMIN,
    );
    const { refreshToken } = await ouvrirSession(UserRole.SUPER_ADMIN);

    const session = await usecase.execute(refreshToken);
    const { jwtGuard, permissionsGuard, context } = guardsFor(
      session.accessToken,
      tokenService,
    );

    await expect(jwtGuard.canActivate(context)).resolves.toBe(true);
    expect(permissionsGuard.canActivate(context)).toBe(true);
  });
});

describe('Rafraîchissement — session invalidée et comptes sanctionnés', () => {
  it('session invalidée (changement de rôle admin) : le refresh est refusé', async () => {
    const { usecase, sessionCache, ouvrirSession } = makeHarness(
      UserRole.SUPER_ADMIN,
    );
    const { refreshToken } = await ouvrirSession(UserRole.SUPER_ADMIN);

    // Ce que fait `PATCH /admin/investors/:userId/role` après avoir écrit le
    // nouveau rôle : la rotation est coupée, reconnexion obligatoire.
    await sessionCache.invalidateRefreshTokenId(EMAIL);

    await expect(usecase.execute(refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('un refresh token ne sert qu’une fois (rotation consommée)', async () => {
    const { usecase, ouvrirSession } = makeHarness();
    const { refreshToken } = await ouvrirSession(UserRole.INVESTISSEUR);

    await usecase.execute(refreshToken);

    await expect(usecase.execute(refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('compte suspendu : aucun nouveau token (code ACCOUNT_SUSPENDED)', async () => {
    // `POST /auth/refresh-tokens` est public : AccountStatusGuard ne s'y
    // applique pas, le contrôle doit donc être fait par le use case.
    const { usecase, ouvrirSession } = makeHarness(
      UserRole.INVESTISSEUR,
      UserStatus.SUSPENDU,
    );
    const { refreshToken } = await ouvrirSession(UserRole.INVESTISSEUR);

    await expect(usecase.execute(refreshToken)).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
  });

  it('compte supprimé : aucun nouveau token (code ACCOUNT_CLOSED)', async () => {
    const { usecase, ouvrirSession } = makeHarness(
      UserRole.INVESTISSEUR,
      UserStatus.SUPPRIME,
    );
    const { refreshToken } = await ouvrirSession(UserRole.INVESTISSEUR);

    await expect(usecase.execute(refreshToken)).rejects.toBeInstanceOf(
      AccountClosedError,
    );
  });

  it('un access token présenté comme refresh token est refusé', async () => {
    const { usecase, ouvrirSession } = makeHarness();
    const { accessToken } = await ouvrirSession(UserRole.INVESTISSEUR);

    await expect(usecase.execute(accessToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});
