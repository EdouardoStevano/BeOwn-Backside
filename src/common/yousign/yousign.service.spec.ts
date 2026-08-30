import { YouSignService } from './yousign.service';
import { SignatureProviderUnavailableError } from './signature-provider.error';

/**
 * F-02 — une panne du prestataire n'est pas un bug de la plateforme.
 *
 * L'incident reproduit par le fondateur : `POST /signature_requests` répond
 * 401 « please contact our sales team to check your subscription and the
 * validity of your trial period » — l'abonnement Yousign est échu. Le code
 * était irréprochable, la réponse au vendeur non : un 500 nu.
 *
 * Ce que ce fichier verrouille : l'adaptateur SÉPARE les deux familles
 * d'échecs. Indisponibilité du prestataire → `SignatureProviderUnavailableError`
 * porteuse d'un motif borné. Faute de notre appel → `Error` nue, avec le
 * message historique, donc le traitement historique.
 */
describe('YouSignService — indisponibilité du prestataire vs faute applicative', () => {
  const CONFIG: Record<string, string> = {
    YOUSIGN_BASE_URL: 'https://api-sandbox.yousign.app/v3',
    YOUSIGN_API_KEY: 'cle-de-test',
    YOUSIGN_TIMEOUT_MS: '5',
  };

  const construire = () =>
    new YouSignService({
      get: (cle: string) => CONFIG[cle],
    } as any);

  const parametresSignature = () => ({
    documentBuffer: Buffer.from('%PDF-1.4 contrat'),
    documentName: 'contrat_rachat.pdf',
    signerEmail: 'vendeur@example.test',
    signerFirstname: 'Ibrahima',
    signerLastname: 'Ba',
  });

  const fetchOrigine = global.fetch;
  afterEach(() => {
    global.fetch = fetchOrigine;
    jest.restoreAllMocks();
  });

  /** Réponse d'échec du prestataire, telle que `fetch` la rendrait. */
  const reponseEnEchec = (status: number, corps: string) =>
    jest.fn().mockResolvedValue({
      ok: false,
      status,
      text: async () => corps,
    });

  it("l'incident réel — 401 abonnement/essai expiré — est une indisponibilité, pas un bug", async () => {
    const corps =
      '{"detail":"You are not authorized to perform this action, please contact ' +
      'our sales team to check your subscription and the validity of your trial period."}';
    global.fetch = reponseEnEchec(401, corps) as any;

    const erreur = await construire()
      .createEmbeddedSignatureRequest(parametresSignature())
      .catch((e) => e);

    expect(erreur).toBeInstanceOf(SignatureProviderUnavailableError);
    expect(erreur.motif).toBe('authentification_refusee');
    expect(erreur.statutFournisseur).toBe(401);
    expect(erreur.operation).toBe('POST /signature_requests');
    // Le texte du prestataire est CONSERVÉ pour le journal serveur — c'est là
    // qu'un exploitant lit qu'il faut renouveler l'abonnement.
    expect(erreur.detailFournisseur).toContain('trial period');
  });

  it.each([
    [402, 'abonnement_ou_quota'],
    [403, 'authentification_refusee'],
    [408, 'delai_depasse'],
    [429, 'abonnement_ou_quota'],
    [500, 'panne'],
    [502, 'panne'],
    [503, 'panne'],
  ])('un %i du prestataire est une indisponibilité (%s)', async (statut, motif) => {
    global.fetch = reponseEnEchec(statut as number, 'peu importe') as any;

    const erreur = await construire()
      .getSignatureRequestStatus('ys-req-1')
      .catch((e) => e);

    expect(erreur).toBeInstanceOf(SignatureProviderUnavailableError);
    expect(erreur.motif).toBe(motif);
  });

  it.each([400, 404, 422])(
    'un %i reste une faute de NOTRE appel : erreur nue, message inchangé',
    async (statut) => {
      global.fetch = reponseEnEchec(statut, 'champ invalide') as any;

      const erreur = await construire()
        .getSignatureRequestStatus('ys-req-1')
        .catch((e) => e);

      expect(erreur).toBeInstanceOf(Error);
      expect(erreur).not.toBeInstanceOf(SignatureProviderUnavailableError);
      expect(erreur.message).toBe(
        `YouSign GET /signature_requests/ys-req-1 → ${statut}: champ invalide`,
      );
    },
  );

  it('un prestataire injoignable (réseau coupé) est une indisponibilité', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.yousign.app')) as any;

    const erreur = await construire()
      .getSignatureRequestStatus('ys-req-1')
      .catch((e) => e);

    expect(erreur).toBeInstanceOf(SignatureProviderUnavailableError);
    expect(erreur.motif).toBe('reseau');
  });

  it('un prestataire qui ne répond pas est coupé au délai, et non laissé pendre', async () => {
    // La requête du vendeur ne doit pas rester ouverte jusqu'au timeout du
    // reverse proxy : au-delà du délai, l'appel est abandonné et signalé.
    global.fetch = jest.fn(
      (_url: any, init: any) =>
        new Promise((_resoudre, rejeter) => {
          init.signal.addEventListener('abort', () =>
            rejeter(new Error('This operation was aborted')),
          );
        }),
    ) as any;

    const erreur = await construire()
      .getSignatureRequestStatus('ys-req-1')
      .catch((e) => e);

    expect(erreur).toBeInstanceOf(SignatureProviderUnavailableError);
    expect(erreur.motif).toBe('delai_depasse');
  });

  it('un appel qui réussit reste un appel qui réussit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ongoing' }),
    }) as any;

    await expect(
      construire().getSignatureRequestStatus('ys-req-1'),
    ).resolves.toBe('ongoing');
  });
});
