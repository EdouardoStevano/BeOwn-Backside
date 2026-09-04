import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AcknowledgeSignatureUseCase } from './acknowledge-signature.usecase';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';

/**
 * Matrice de sécurité de l'acceptation certifiée : propriété (anti-IDOR),
 * provider, statut, échéance — puis parcours nominal : enregistrement
 * single-shot, certificat archivé, règlement délégué au MÊME use case que le
 * webhook YouSign.
 */
describe('AcknowledgeSignatureUseCase', () => {
  const OWNER = 42;
  const REQ = 'ack_11111111-2222-3333-4444-555555555555';
  const dans24h = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

  function setup(overrides?: Partial<any>) {
    const signature: any = {
      id: 'sig-ack-1',
      youSignRequestId: REQ,
      provider: 'acknowledge',
      statut: SignatureStatus.PENDING,
      userId: OWNER,
      documentId: 'doc-contrat',
      investmentId: null,
      ordreId: 'ordre-1',
      nbFractions: 4,
      expiresAt: dans24h(),
      acknowledgedAt: null,
      acknowledgedIp: null,
      certificatDocumentId: null,
      documentHash: 'abc123',
      ...overrides,
    };

    const savedDocs: any[] = [];
    const qbExecute = jest.fn(async () => {
      // Sémantique de la transition conditionnelle : ne « gagne » que si
      // l'acceptation n'a pas déjà été enregistrée.
      if (signature.acknowledgedAt !== null) return { affected: 0 };
      signature.acknowledgedAt = new Date();
      signature.acknowledgedIp = '203.0.113.7';
      return { affected: 1 };
    });
    const signatureRepo: any = {
      findOne: jest.fn(async () => signature),
      findOneOrFail: jest.fn(async () => signature),
      update: jest.fn(async (_where: any, patch: any) => {
        Object.assign(signature, patch);
        return { affected: 1 };
      }),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        qb.update = () => qb;
        qb.set = () => qb;
        qb.where = () => qb;
        qb.execute = qbExecute;
        return qb;
      }),
    };
    const documentRepo: any = {
      findOne: jest.fn(async () => ({
        id: 'doc-contrat',
        originalName: 'contrat_rachat.pdf',
        projectId: 'proj-1',
      })),
      create: jest.fn((obj: any) => obj),
      save: jest.fn(async (obj: any) => {
        const doc = { ...obj, id: 'doc-certificat' };
        savedDocs.push(doc);
        return doc;
      }),
    };
    const userRepo: any = {
      findOne: jest.fn(async () => ({ userId: OWNER, firstname: 'Fatou', lastname: 'Ndiaye' })),
    };
    const userEmailRepo: any = {
      findOne: jest.fn(async () => ({ userId: OWNER, email: 'fatou@beown.fr' })),
    };
    const cloudStorage: any = {
      upload: jest.fn(async () => ({ objectName: 'beown/contrats/cert', publicUrl: 'beown/contrats/cert' })),
    };
    const certificat: any = {
      generate: jest.fn(async () => Buffer.from('%PDF certificat')),
    };
    const finalize: any = { execute: jest.fn(async () => undefined) };

    const usecase = new AcknowledgeSignatureUseCase(
      signatureRepo,
      documentRepo,
      userRepo,
      userEmailRepo,
      cloudStorage,
      certificat,
      finalize,
    );

    return { usecase, signature, signatureRepo, documentRepo, certificat, cloudStorage, finalize, savedDocs, qbExecute };
  }

  // ── Refus ──────────────────────────────────────────────────────────────────

  it('404 SIGNATURE_NOT_FOUND : demande inconnue', async () => {
    const ctx = setup();
    ctx.signatureRepo.findOne.mockResolvedValue(null);
    await expect(ctx.usecase.execute('ack_inconnu', OWNER, '1.2.3.4')).rejects.toThrow(NotFoundException);
    expect(ctx.finalize.execute).not.toHaveBeenCalled();
  });

  it("403 SIGNATURE_NOT_OWNER : un autre utilisateur authentifié ne peut PAS accepter (anti-IDOR)", async () => {
    const ctx = setup();
    const erreur = await ctx.usecase.execute(REQ, 999, '1.2.3.4').catch((e) => e);
    expect(erreur).toBeInstanceOf(ForbiddenException);
    expect(erreur.getResponse().code).toBe('SIGNATURE_NOT_OWNER');
    // Rien n'a été enregistré ni réglé.
    expect(ctx.signature.acknowledgedAt).toBeNull();
    expect(ctx.finalize.execute).not.toHaveBeenCalled();
  });

  it("409 SIGNATURE_PROVIDER_MISMATCH : une demande YouSign ne se contourne pas par l'acknowledge", async () => {
    const ctx = setup({ provider: 'yousign' });
    const erreur = await ctx.usecase.execute(REQ, OWNER, '1.2.3.4').catch((e) => e);
    expect(erreur).toBeInstanceOf(ConflictException);
    expect(erreur.getResponse().code).toBe('SIGNATURE_PROVIDER_MISMATCH');
    expect(ctx.finalize.execute).not.toHaveBeenCalled();
  });

  it('410 SIGNATURE_EXPIRED : statut EXPIRED', async () => {
    const ctx = setup({ statut: SignatureStatus.EXPIRED });
    await expect(ctx.usecase.execute(REQ, OWNER, '1.2.3.4')).rejects.toThrow(GoneException);
  });

  it("410 SIGNATURE_EXPIRED : encore PENDING mais échéance dépassée — l'horloge serveur fait foi, le cron compensera", async () => {
    const ctx = setup({ expiresAt: new Date(Date.now() - 1000) });
    await expect(ctx.usecase.execute(REQ, OWNER, '1.2.3.4')).rejects.toThrow(GoneException);
    expect(ctx.finalize.execute).not.toHaveBeenCalled();
  });

  it.each([SignatureStatus.SIGNED, SignatureStatus.CANCELLED])(
    '409 SIGNATURE_ALREADY_PROCESSED : statut %s',
    async (statut) => {
      const ctx = setup({ statut });
      const erreur = await ctx.usecase.execute(REQ, OWNER, '1.2.3.4').catch((e) => e);
      expect(erreur).toBeInstanceOf(ConflictException);
      expect(erreur.getResponse().code).toBe('SIGNATURE_ALREADY_PROCESSED');
    },
  );

  // ── Parcours nominal ───────────────────────────────────────────────────────

  it("enregistre l'acceptation, archive le certificat et règle par le MÊME use case que le webhook", async () => {
    const ctx = setup();

    const resultat = await ctx.usecase.execute(REQ, OWNER, '203.0.113.7');

    // Acte d'acceptation : horodatage + IP posés par la transition conditionnelle.
    expect(ctx.signature.acknowledgedAt).toBeInstanceOf(Date);
    expect(ctx.signature.acknowledgedIp).toBe('203.0.113.7');

    // Certificat : généré avec les éléments de preuve puis archivé en document.
    expect(ctx.certificat.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureId: 'sig-ack-1',
        requestId: REQ,
        documentHash: 'abc123',
        acknowledgedIp: '203.0.113.7',
      }),
    );
    expect(ctx.savedDocs).toHaveLength(1);
    expect(ctx.savedDocs[0].type).toBe(DocumentType.CERTIFICAT_ACCEPTATION);
    expect(ctx.signature.certificatDocumentId).toBe('doc-certificat');

    // Règlement : délégué au use case partagé, désigné par le requestId externe.
    expect(ctx.finalize.execute).toHaveBeenCalledWith(REQ);
    expect(resultat.certificatDocumentId).toBe('doc-certificat');
    expect(resultat.signatureId).toBe('sig-ack-1');
  });

  it('rejouable : un second appel après un règlement échoué NE régénère PAS le certificat et retente le règlement', async () => {
    const ctx = setup();
    ctx.finalize.execute.mockRejectedValueOnce(new Error('Wallet vendeur introuvable'));

    await expect(ctx.usecase.execute(REQ, OWNER, '203.0.113.7')).rejects.toThrow(/Wallet vendeur/);
    expect(ctx.savedDocs).toHaveLength(1);

    // Deuxième tentative : la signature est restée PENDING, déjà acquittée.
    await ctx.usecase.execute(REQ, OWNER, '203.0.113.7');

    expect(ctx.savedDocs).toHaveLength(1); // pas de doublon de certificat
    expect(ctx.certificat.generate).toHaveBeenCalledTimes(1);
    expect(ctx.finalize.execute).toHaveBeenCalledTimes(2);
  });

  it("course entre deux appels : le perdant de la transition n'archive rien mais retente quand même le règlement", async () => {
    const ctx = setup({ acknowledgedAt: new Date(), acknowledgedIp: '203.0.113.7' });

    await ctx.usecase.execute(REQ, OWNER, '198.51.100.9');

    expect(ctx.certificat.generate).not.toHaveBeenCalled();
    expect(ctx.savedDocs).toHaveLength(0);
    // L'IP d'origine de l'acceptation n'est PAS écrasée par la retentative.
    expect(ctx.signature.acknowledgedIp).toBe('203.0.113.7');
    expect(ctx.finalize.execute).toHaveBeenCalledWith(REQ);
  });
});
