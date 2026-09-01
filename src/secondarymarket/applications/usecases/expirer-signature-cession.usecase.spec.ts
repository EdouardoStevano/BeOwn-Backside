import { ExpirerSignatureCessionUseCase } from './expirer-signature-cession.usecase';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';

/**
 * Expiration d'une signature de cession — le chemin par lequel une annonce
 * coincée en `accepte` et des fonds bloqués sans terme redeviennent vivants.
 *
 * Deux appelants indépendants partagent cette séquence (webhook prestataire et
 * cron de sécurité) : elle doit être strictement single-shot.
 */
describe('ExpirerSignatureCessionUseCase', () => {
  const signatureEnAttente = () => ({
    id: 'sig-1',
    youSignRequestId: 'ys-1',
    statut: SignatureStatus.PENDING,
    ordreId: 'ordre-1',
    nbFractions: 3,
    userId: 42,
  });

  const build = (
    signature: any = signatureEnAttente(),
    options: { dejaTraitee?: boolean } = {},
  ) => {
    const signatureRepo = {
      findOne: jest.fn().mockResolvedValue(signature),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          update: jest.fn(() => qb),
          set: jest.fn(() => qb),
          where: jest.fn(() => qb),
          execute: jest.fn(async () => ({
            affected: options.dejaTraitee ? 0 : 1,
          })),
        };
        return qb;
      }),
    };
    const ordreRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'ordre-1', vendeurId: 7 }),
    };
    const compensation = {
      compenserCessionInaboutie: jest.fn().mockResolvedValue({
        statutOrdre: OrdreMarcheStatus.INTERET_EXPRIME,
        montantLibere: 300,
      }),
    };
    const notifications = { push: jest.fn().mockResolvedValue(undefined) };

    const usecase = new ExpirerSignatureCessionUseCase(
      signatureRepo as any,
      ordreRepo as any,
      compensation as any,
      notifications as any,
    );
    return { usecase, signature, signatureRepo, ordreRepo, compensation, notifications };
  };

  const destinataires = (notifications: any) =>
    notifications.push.mock.calls.map((appel: any[]) => appel[0].utilisateurId);

  it("libère l'ordre ET les fonds de l'acheteur", async () => {
    const { usecase, signature, compensation } = build();

    await expect(usecase.execute(signature as any)).resolves.toBe('expiree');

    expect(compensation.compenserCessionInaboutie).toHaveBeenCalledWith({
      ordreId: 'ordre-1',
      acheteurId: 42,
      nbFractions: 3,
    });
  });

  it('prévient les deux parties : celui qui devait signer et celui qui attendait', async () => {
    const { usecase, signature, notifications } = build();

    await usecase.execute(signature as any);

    expect(destinataires(notifications)).toEqual(
      expect.arrayContaining([42, 7]),
    );
  });

  it('single-shot : une signature déjà traitée ne libère RIEN (webhook + cron simultanés)', async () => {
    const { usecase, signature, compensation, notifications } = build(
      signatureEnAttente(),
      { dejaTraitee: true },
    );

    await expect(usecase.execute(signature as any)).resolves.toBe('noop');

    expect(compensation.compenserCessionInaboutie).not.toHaveBeenCalled();
    expect(notifications.push).not.toHaveBeenCalled();
  });

  it("n'annonce pas au vendeur une annonce libérée quand rien ne l'a été", async () => {
    const { usecase, signature, compensation, notifications } = build();
    compensation.compenserCessionInaboutie.mockResolvedValue({
      statutOrdre: null,
      montantLibere: 0,
    });

    await usecase.execute(signature as any);

    // L'acheteur est prévenu de l'expiration ; le vendeur ne reçoit rien,
    // puisque son annonce n'a pas changé d'état.
    expect(destinataires(notifications)).toEqual([42]);
  });

  it('entrée webhook : une requête prestataire inconnue est un no-op', async () => {
    const { usecase, signatureRepo, compensation } = build();
    signatureRepo.findOne.mockResolvedValue(null);

    await expect(usecase.parRequeteFournisseur('inconnue')).resolves.toBe('noop');
    expect(compensation.compenserCessionInaboutie).not.toHaveBeenCalled();
  });
});
