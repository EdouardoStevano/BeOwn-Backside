import {
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import {
  KycValidatedGuard,
  KYC_NOT_VALIDATED_CODE,
  KYC_NOT_VALIDATED_MESSAGE,
} from './kyc-validated.guard';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';

const ctx = (userId?: number): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

/**
 * Le garde lit le dossier par le port `KYC_REPOSITORY`, plus par
 * `Repository<KycEntity>` : le double rend donc un agrégat (ou `null`), et
 * c'est `findByUserId` qui est appelé.
 */
const makeGuard = (kyc: unknown) => {
  const kycRepo = { findByUserId: jest.fn().mockResolvedValue(kyc) };
  return { guard: new KycValidatedGuard(kycRepo as any), kycRepo };
};

/** Capture l'exception et vérifie le contrat d'erreur fixe attendu par le front. */
const expectKycRejection = async (guard: KycValidatedGuard) => {
  let caught: ForbiddenException | undefined;
  try {
    await guard.canActivate(ctx(42));
  } catch (e) {
    caught = e as ForbiddenException;
  }
  expect(caught).toBeInstanceOf(ForbiddenException);
  expect(caught!.getStatus()).toBe(HttpStatus.FORBIDDEN);
  // Le body HTTP renvoyé par le BaseExceptionFilter de Nest est getResponse()
  // tel quel quand c'est un objet — il doit donc porter le code stable.
  const body = caught!.getResponse() as Record<string, unknown>;
  expect(body).toEqual({
    statusCode: HttpStatus.FORBIDDEN,
    message: KYC_NOT_VALIDATED_MESSAGE,
    code: KYC_NOT_VALIDATED_CODE,
  });
};

describe('KycValidatedGuard', () => {
  it('laisse passer un KYC valide', async () => {
    const { guard, kycRepo } = makeGuard({ statut: KycStatus.VALIDE });
    await expect(guard.canActivate(ctx(42))).resolves.toBe(true);
    expect(kycRepo.findByUserId).toHaveBeenCalledWith(42);
  });

  it('laisse passer un KYC valide avec date de validité future', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const { guard } = makeGuard({
      statut: KycStatus.VALIDE,
      valideJusquAu: future,
    });
    await expect(guard.canActivate(ctx(42))).resolves.toBe(true);
  });

  it('refuse (403 + code KYC_NOT_VALIDATED) sans dossier KYC', async () => {
    const { guard } = makeGuard(null);
    await expectKycRejection(guard);
  });

  it.each([
    KycStatus.NON_DEMARRE,
    KycStatus.EN_COURS,
    KycStatus.EN_REVUE,
    KycStatus.REFUSE,
    KycStatus.EXPIRE,
    KycStatus.RENOUVELLEMENT,
  ])('refuse (403 + code KYC_NOT_VALIDATED) le statut %s', async (statut) => {
    const { guard } = makeGuard({ statut });
    await expectKycRejection(guard);
  });

  it('refuse (403 + code KYC_NOT_VALIDATED) un KYC valide mais expiré', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const { guard } = makeGuard({
      statut: KycStatus.VALIDE,
      valideJusquAu: past,
    });
    await expectKycRejection(guard);
  });

  it('refuse sans utilisateur authentifié (403 générique, sans code KYC)', async () => {
    const { guard, kycRepo } = makeGuard(null);
    let caught: ForbiddenException | undefined;
    try {
      await guard.canActivate(ctx(undefined));
    } catch (e) {
      caught = e as ForbiddenException;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body).not.toHaveProperty('code');
    expect(kycRepo.findByUserId).not.toHaveBeenCalled();
  });
});
