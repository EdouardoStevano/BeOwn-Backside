import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from 'src/iam/applications/services/token.service';
import { JwtTokenSignerAdapter } from 'src/shared/token/infrastructure/jwt-token-signer.adapter';
import { NotificationUnsubscribeService } from './notification-unsubscribe.service';
import { PublicUnsubscribeController } from '../presenters/http/public-unsubscribe.controller';

const SECRET = 'test-secret';

const buildSignerConfig = (overrides: Record<string, unknown> = {}) => ({
  secret: SECRET,
  audience: 'localhost:3000',
  issuer: 'localhost:3000',
  ...overrides,
});

const buildTtlConfig = (overrides: Record<string, unknown> = {}) => ({
  accessTokenTtl: 3600,
  refreshTokenTtl: 86400,
  emailTokenTtl: 86400,
  unsubscribeTokenTtl: 7776000,
  ...overrides,
});

/** Vrai signer JWT : on veut éprouver signature, expiration et claim `type`. */
const buildTokenService = (overrides: Record<string, unknown> = {}) => {
  const cacheManagerService = {
    insertRefreshTokenId: jest.fn(),
    validateRefreshToken: jest.fn(),
    invalidateRefreshTokenId: jest.fn(),
    insertEmailTokenId: jest.fn(),
    validateEmailToken: jest.fn(),
    invalidateEmailTokenId: jest.fn(),
  };
  const signer = new JwtTokenSignerAdapter(
    new JwtService(),
    buildSignerConfig(overrides) as any,
  );
  return new TokenService(
    signer,
    cacheManagerService as any,
    buildTtlConfig(overrides) as any,
  );
};

const makeSut = (tokenService = buildTokenService()) => {
  const userRepository = {
    findById: jest.fn().mockResolvedValue({ userId: 42 }),
    findByEmail: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn().mockResolvedValue({ notifMarketing: false }),
  };

  const service = new NotificationUnsubscribeService(
    tokenService as any,
    userRepository as any,
  );
  const controller = new PublicUnsubscribeController(service);

  return { service, controller, tokenService, userRepository };
};

describe('NotificationUnsubscribeService', () => {
  it('désinscrit le destinataire en passant notifMarketing à false', async () => {
    const { service, tokenService, userRepository } = makeSut();
    const token = await tokenService.generateUnsubscribeToken(42);

    const result = await service.unsubscribe(token);

    expect(result).toEqual({ success: true });
    expect(userRepository.savePreferences).toHaveBeenCalledWith(42, {
      notifMarketing: false,
    });
  });

  it("n'affecte que notifMarketing (les canaux transactionnels restent intacts)", async () => {
    const { service, tokenService, userRepository } = makeSut();
    const token = await tokenService.generateUnsubscribeToken(42);

    await service.unsubscribe(token);

    const [, patch] = userRepository.savePreferences.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['notifMarketing']);
  });

  it('est idempotent : rejouer le même lien renvoie 200', async () => {
    const { service, tokenService, userRepository } = makeSut();
    const token = await tokenService.generateUnsubscribeToken(42);

    await expect(service.unsubscribe(token)).resolves.toEqual({
      success: true,
    });
    await expect(service.unsubscribe(token)).resolves.toEqual({
      success: true,
    });

    expect(userRepository.savePreferences).toHaveBeenCalledTimes(2);
  });

  it("rejette (401) un token de vérification d'email — confusion de token", async () => {
    const { service, tokenService, userRepository } = makeSut();
    const emailToken = await tokenService.generateEmailToken(
      { sub: 42, email: 'user@example.com', emailTokenId: 'token-id' },
      'email_verify',
    );

    await expect(service.unsubscribe(emailToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.savePreferences).not.toHaveBeenCalled();
  });

  it('rejette (401) un token expiré', async () => {
    const expiredTokenService = buildTokenService({ unsubscribeTokenTtl: -1 });
    const { service, userRepository } = makeSut(expiredTokenService);
    const token = await expiredTokenService.generateUnsubscribeToken(42);

    await expect(service.unsubscribe(token)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.savePreferences).not.toHaveBeenCalled();
  });

  it('rejette (401) un token signé avec une autre clé', async () => {
    const foreignTokenService = buildTokenService({ secret: 'another-secret' });
    const forgedToken = await foreignTokenService.generateUnsubscribeToken(42);
    const { service, userRepository } = makeSut();

    await expect(service.unsubscribe(forgedToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.savePreferences).not.toHaveBeenCalled();
  });

  it("rejette (401) un token dont l'utilisateur n'existe plus", async () => {
    const { service, tokenService, userRepository } = makeSut();
    userRepository.findById.mockResolvedValue(null);
    const token = await tokenService.generateUnsubscribeToken(42);

    await expect(service.unsubscribe(token)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.savePreferences).not.toHaveBeenCalled();
  });

  it('émet un token portant sub et type notif_unsubscribe', async () => {
    const tokenService = buildTokenService();
    const token = await tokenService.generateUnsubscribeToken(42);

    const payload = await tokenService.verifyUnsubscribeToken(token);

    expect(payload.sub).toBe(42);
    expect(payload.type).toBe('notif_unsubscribe');
  });
});

describe('PublicUnsubscribeController', () => {
  it('expose le contrat { token } -> { success: true }', async () => {
    const { controller, tokenService } = makeSut();
    const token = await tokenService.generateUnsubscribeToken(42);

    await expect(controller.unsubscribe({ token })).resolves.toEqual({
      success: true,
    });
  });

  it('propage un 401 pour un token invalide', async () => {
    const { controller } = makeSut();

    await expect(
      controller.unsubscribe({ token: 'not-a-jwt' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
