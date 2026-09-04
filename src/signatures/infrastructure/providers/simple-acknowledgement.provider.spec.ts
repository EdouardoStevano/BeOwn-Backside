import { createHash } from 'crypto';
import { SimpleAcknowledgementProvider } from './simple-acknowledgement.provider';
import { SignatureProvider } from 'src/signatures/applications/ports/signature-provider.port';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

/**
 * Adapter de repli du port `SignatureProvider` : aucun réseau à l'ouverture,
 * empreinte SHA-256 figée sur le document présenté, lien pointant vers la page
 * front d'acceptation. LSP : le contrat du port est honoré méthode par méthode
 * (aucun NotImplemented).
 */
describe('SimpleAcknowledgementProvider', () => {
  const pdf = Buffer.from('%PDF-1.4 contenu du contrat de cession');

  function construire(opts?: {
    signature?: any;
    document?: any;
    frontendUrl?: string | undefined;
  }) {
    const config: any = {
      get: jest.fn((cle: string) =>
        cle === 'FRONTEND_URL' ? opts?.frontendUrl : undefined,
      ),
    };
    const signatureRepo: any = {
      findOne: jest.fn(async () => opts?.signature ?? null),
    };
    const documentRepo: any = {
      findOne: jest.fn(async () => opts?.document ?? null),
    };
    const cloudStorage: any = {
      isObjectName: jest.fn((p: string) => !p.startsWith('http')),
      getSignedUrl: jest.fn(async () => 'https://cdn.test/signed-url'),
    };
    const provider = new SimpleAcknowledgementProvider(
      config,
      signatureRepo,
      documentRepo,
      cloudStorage,
    );
    return { provider, config, signatureRepo, documentRepo, cloudStorage };
  }

  it('est une implémentation du port SignatureProvider (substituable)', () => {
    const { provider } = construire();
    const port: SignatureProvider = provider;
    expect(typeof port.createEmbeddedSignatureRequest).toBe('function');
    expect(typeof port.downloadSignedDocument).toBe('function');
    expect(typeof port.cancelSignatureRequest).toBe('function');
    expect(typeof port.getSignatureRequestStatus).toBe('function');
  });

  describe('createEmbeddedSignatureRequest', () => {
    it("ouvre une demande interne : id ack_, SHA-256 exact du PDF, lien vers la page front d'acceptation", async () => {
      const { provider } = construire({ frontendUrl: 'https://app.beown.test' });

      const resultat = await provider.createEmbeddedSignatureRequest({
        documentBuffer: pdf,
        documentName: 'contrat_rachat.pdf',
        signerEmail: 'fatou@beown.fr',
        signerFirstname: 'Fatou',
        signerLastname: 'Ndiaye',
      });

      expect(resultat.provider).toBe('acknowledge');
      expect(resultat.requestId).toMatch(/^ack_[0-9a-f-]{36}$/);
      expect(resultat.documentHash).toBe(
        createHash('sha256').update(pdf).digest('hex'),
      );
      expect(resultat.signingUrl).toBe(
        `https://app.beown.test/dashboard/signatures/${resultat.requestId}/acknowledge`,
      );
      expect(resultat.signerId).toMatch(/^ack_signer_/);
    });

    it("deux demandes sur le même document portent des identifiants distincts mais la même empreinte", async () => {
      const { provider } = construire();
      const params = {
        documentBuffer: pdf,
        documentName: 'contrat.pdf',
        signerEmail: 'a@b.fr',
        signerFirstname: 'A',
        signerLastname: 'B',
      };
      const [r1, r2] = [
        await provider.createEmbeddedSignatureRequest(params),
        await provider.createEmbeddedSignatureRequest(params),
      ];
      expect(r1.requestId).not.toBe(r2.requestId);
      expect(r1.documentHash).toBe(r2.documentHash);
    });
  });

  describe('downloadSignedDocument', () => {
    const fetchOriginal = global.fetch;
    afterEach(() => {
      global.fetch = fetchOriginal;
    });

    it("restitue le document PRÉSENTÉ depuis le stockage (l'exemplaire définitif du parcours de repli)", async () => {
      const { provider, cloudStorage } = construire({
        signature: { id: 'sig-1', documentId: 'doc-1' },
        document: { id: 'doc-1', path: 'beown/contrats/xyz', filename: 'beown/contrats/xyz' },
      });
      global.fetch = jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
      })) as any;

      const contenu = await provider.downloadSignedDocument('ack_req');

      expect(cloudStorage.getSignedUrl).toHaveBeenCalledWith('beown/contrats/xyz', 5, 'raw');
      expect(Buffer.compare(contenu, pdf)).toBe(0);
    });

    it('échoue explicitement quand la demande ne porte aucun document', async () => {
      const { provider } = construire({ signature: null });
      await expect(provider.downloadSignedDocument('ack_inconnu')).rejects.toThrow(
        /Aucun document/,
      );
    });
  });

  it('cancelSignatureRequest : no-op documenté — rien à clore chez un prestataire inexistant', async () => {
    const { provider } = construire();
    await expect(provider.cancelSignatureRequest('ack_req')).resolves.toBeUndefined();
  });

  describe('getSignatureRequestStatus — statut lu en base, vocabulaire YouSign', () => {
    it.each([
      [SignatureStatus.PENDING, 'ongoing'],
      [SignatureStatus.SIGNED, 'done'],
      [SignatureStatus.EXPIRED, 'expired'],
      [SignatureStatus.CANCELLED, 'canceled'],
    ])('%s → %s', async (statut, attendu) => {
      const { provider } = construire({ signature: { statut } });
      await expect(provider.getSignatureRequestStatus('ack_req')).resolves.toBe(attendu);
    });

    it('demande inconnue → erreur explicite', async () => {
      const { provider } = construire({ signature: null });
      await expect(provider.getSignatureRequestStatus('ack_x')).rejects.toThrow(/introuvable/);
    });
  });
});
