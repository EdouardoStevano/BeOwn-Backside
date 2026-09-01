import { SignaturesExpiryCronService } from './signatures-expiry-cron.service';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

/**
 * Filet de sécurité indépendant du webhook prestataire. Deux garanties :
 * il ne balaie QUE les signatures de cession échues, et l'échec de l'une ne
 * prive pas les autres de leur libération — sans quoi une seule ligne
 * problématique gèlerait tout le reste du carnet.
 */
describe('SignaturesExpiryCronService', () => {
  const build = (
    echues: any[],
    resultats: Record<string, 'expiree' | 'noop' | Error> = {},
  ) => {
    const criteres: any[] = [];
    const signatureRepo = {
      find: jest.fn(async (options: any) => {
        criteres.push(options.where);
        return echues;
      }),
    };
    const expirerSignature = {
      execute: jest.fn(async (signature: any) => {
        const issue = resultats[signature.id] ?? 'expiree';
        if (issue instanceof Error) throw issue;
        return issue;
      }),
    };

    const service = new SignaturesExpiryCronService(
      signatureRepo as any,
      expirerSignature as any,
    );
    return { service, signatureRepo, expirerSignature, criteres };
  };

  const signature = (id: string) => ({ id, ordreId: 'ordre-1', userId: 42 });

  it('ne cible que les signatures PENDING échues portant un ordre', async () => {
    const { service, criteres } = build([]);

    await service.expirerSignaturesEchues();

    expect(criteres[0]).toMatchObject({ statut: SignatureStatus.PENDING });
    // `expiresAt` et `ordreId` sont des opérateurs TypeORM : on vérifie leur
    // présence, la sémantique étant celle de LessThanOrEqual / Not(IsNull).
    expect(criteres[0].expiresAt).toBeDefined();
    expect(criteres[0].ordreId).toBeDefined();
  });

  it('expire et compense chaque signature échue', async () => {
    const { service, expirerSignature } = build([
      signature('s-1'),
      signature('s-2'),
    ]);

    await expect(service.expirerSignaturesEchues()).resolves.toBe(2);
    expect(expirerSignature.execute).toHaveBeenCalledTimes(2);
  });

  it("l'échec d'une signature ne prive pas les autres de leur libération", async () => {
    const { service } = build(
      [signature('s-1'), signature('s-2'), signature('s-3')],
      { 's-2': new Error('base indisponible') },
    );

    await expect(service.expirerSignaturesEchues()).resolves.toBe(2);
  });

  it('une signature déjà traitée par le webhook ne compte pas deux fois', async () => {
    const { service } = build([signature('s-1')], { 's-1': 'noop' });

    await expect(service.expirerSignaturesEchues()).resolves.toBe(0);
  });

  it('rien à expirer : aucun appel de compensation', async () => {
    const { service, expirerSignature } = build([]);

    await expect(service.expirerSignaturesEchues()).resolves.toBe(0);
    expect(expirerSignature.execute).not.toHaveBeenCalled();
  });
});
