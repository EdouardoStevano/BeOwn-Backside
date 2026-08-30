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

const ctx = (userId?: number): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

/**
 * Le garde demande à `DossierDEntreeEnRelation.peutOperer()` et traduit un
 * « non » en 403. Le double rend donc une racine, et ne décide rien.
 *
 * Les cas d'aptitude eux-mêmes — statuts refusés, échéance périmée, dossier
 * absent — sont éprouvés dans `investor-compliance-profile.spec.ts` : c'est là
 * que la règle vit désormais, et elle s'y teste sans simuler une requête HTTP
 * (§26). Ce qui reste à vérifier ici est le contrat d'erreur.
 */
const makeGuard = (peutOperer: boolean) => {
  const profils = {
    parTitulaire: jest.fn().mockResolvedValue({ peutOperer: () => peutOperer }),
  };
  return { guard: new KycValidatedGuard(profils as any), profils };
};

describe('KycValidatedGuard', () => {
  it('laisse passer un titulaire apte', async () => {
    const { guard, profils } = makeGuard(true);

    await expect(guard.canActivate(ctx(42))).resolves.toBe(true);
    expect(profils.parTitulaire).toHaveBeenCalledWith(42);
  });

  it('refuse un titulaire inapte avec le contrat d’erreur attendu par le front', async () => {
    const { guard } = makeGuard(false);

    let caught: ForbiddenException | undefined;
    try {
      await guard.canActivate(ctx(42));
    } catch (e) {
      caught = e as ForbiddenException;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught!.getStatus()).toBe(HttpStatus.FORBIDDEN);
    // Le body rendu par le BaseExceptionFilter de Nest est `getResponse()` tel
    // quel quand c'est un objet — il doit donc porter le code stable.
    expect(caught!.getResponse()).toEqual({
      statusCode: HttpStatus.FORBIDDEN,
      message: KYC_NOT_VALIDATED_MESSAGE,
      code: KYC_NOT_VALIDATED_CODE,
    });
  });

  it('refuse sans utilisateur authentifié (403 générique, sans code KYC)', async () => {
    const { guard, profils } = makeGuard(true);

    let caught: ForbiddenException | undefined;
    try {
      await guard.canActivate(ctx(undefined));
    } catch (e) {
      caught = e as ForbiddenException;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught!.getResponse()).not.toHaveProperty('code');
    // Rien n'est chargé : l'appelant n'est pas identifié, il n'y a pas de
    // titulaire dont éprouver l'aptitude.
    expect(profils.parTitulaire).not.toHaveBeenCalled();
  });
});
