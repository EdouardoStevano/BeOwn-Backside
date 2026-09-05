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
    /** État que le prestataire renvoie pour ces signatures. */
    statutFournisseur: string | Error = 'pending',
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

    const provider = {
      getSignatureRequestStatus: jest.fn(async () => {
        if (statutFournisseur instanceof Error) throw statutFournisseur;
        return statutFournisseur;
      }),
    };
    const finalize = { execute: jest.fn().mockResolvedValue(undefined) };

    const service = new SignaturesExpiryCronService(
      signatureRepo as any,
      expirerSignature as any,
      provider as any,
      finalize as any,
    );
    return { service, signatureRepo, expirerSignature, criteres, provider, finalize };
  };

  const signature = (id: string) => ({
    id,
    ordreId: 'ordre-1',
    userId: 42,
    youSignRequestId: `ys-${id}`,
  });

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

  /**
   * I(c) — EXPIRER SANS DEMANDER, C'EST ANNULER UNE CESSION CONCLUE.
   *
   * Ce balayage se déclenche sur une échéance LOCALE, sans événement externe —
   * précisément parce qu'un webhook peut ne jamais arriver. Mais l'inverse est
   * tout aussi possible : la signature a bien été recueillie et c'est le
   * `signature_request.done` qui s'est perdu. On demande donc l'état réel.
   */
  describe('état réel demandé au prestataire', () => {
    it.each(['done', 'signed', 'completed', 'DONE'])(
      'statut « %s » : la cession est FINALISÉE, pas annulée',
      async (statut) => {
        const h = build([signature('s-1')], {}, statut);

        await expect(h.service.expirerSignaturesEchues()).resolves.toBe(0);

        expect(h.finalize.execute).toHaveBeenCalledWith('ys-s-1');
        expect(h.expirerSignature.execute).not.toHaveBeenCalled();
      },
    );

    it('statut encore en attente : expiration normale', async () => {
      const h = build([signature('s-1')], {}, 'pending');

      await expect(h.service.expirerSignaturesEchues()).resolves.toBe(1);

      expect(h.finalize.execute).not.toHaveBeenCalled();
      expect(h.expirerSignature.execute).toHaveBeenCalled();
    });

    it('prestataire injoignable : on expire, comme avant', async () => {
      // Ne pas savoir n'est pas « signée » : le repli reste l'expiration, qui
      // libère l'annonce et les fonds.
      const h = build([signature('s-1')], {}, new Error('API indisponible'));

      await expect(h.service.expirerSignaturesEchues()).resolves.toBe(1);

      expect(h.expirerSignature.execute).toHaveBeenCalled();
    });
  });
});