import { SignatureProviderUnavailableError } from 'src/common/yousign/signature-provider.error';
import {
  DELAI_AVANT_NOUVELLE_TENTATIVE_S,
  MESSAGE_SIGNATURE_INDISPONIBLE,
  SignatureProviderExceptionFilter,
} from './signature-provider-exception.filter';

jest.mock('src/observability/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

/**
 * F-02 — ce que le vendeur LIT quand le prestataire de signature tombe.
 *
 * Trois exigences, toutes vérifiables ici sans réseau ni base :
 *  1. un statut qui dit « réessayez », pas « nous avons un bug » ;
 *  2. un code métier stable, sur lequel le front branche son message ;
 *  3. AUCUN détail du prestataire dans la réponse — le 401 « check your
 *     subscription » nomme notre compte et notre contrat, il reste au journal.
 */
describe('SignatureProviderExceptionFilter', () => {
  const construireHote = () => {
    const reponse = {
      status: jest.fn((_code: number) => reponse),
      json: jest.fn((_corps: Record<string, unknown>) => reponse),
      setHeader: jest.fn((_nom: string, _valeur: string) => reponse),
    };
    const hote: any = {
      switchToHttp: () => ({
        getResponse: () => reponse,
        getRequest: () => ({
          method: 'POST',
          url: '/secondary-market/orders/ordre-1/interet/acceptation',
        }),
      }),
    };
    return { hote, reponse };
  };

  const erreurAbonnementExpire = () =>
    new SignatureProviderUnavailableError({
      operation: 'POST /signature_requests',
      motif: 'authentification_refusee',
      statutFournisseur: 401,
      detailFournisseur:
        '{"detail":"You are not authorized to perform this action, please contact ' +
        'our sales team to check your subscription and the validity of your trial period."}',
    });

  it('répond 503 avec le code stable SIGNATURE_PROVIDER_UNAVAILABLE', () => {
    const { hote, reponse } = construireHote();

    new SignatureProviderExceptionFilter().catch(erreurAbonnementExpire(), hote);

    expect(reponse.status).toHaveBeenCalledWith(503);
    expect(reponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        code: 'SIGNATURE_PROVIDER_UNAVAILABLE',
        retryAfterSeconds: DELAI_AVANT_NOUVELLE_TENTATIVE_S,
      }),
    );
  });

  it('annonce un délai de nouvelle tentative — ce qu\'un 500 ne sait pas faire', () => {
    const { hote, reponse } = construireHote();

    new SignatureProviderExceptionFilter().catch(erreurAbonnementExpire(), hote);

    expect(reponse.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      String(DELAI_AVANT_NOUVELLE_TENTATIVE_S),
    );
  });

  it("dit au vendeur que rien n'a été enregistré et que l'annonce reste disponible", () => {
    const { hote, reponse } = construireHote();

    new SignatureProviderExceptionFilter().catch(erreurAbonnementExpire(), hote);

    const corps = reponse.json.mock.calls[0][0] as unknown as { message: string };
    expect(corps.message).toBe(MESSAGE_SIGNATURE_INDISPONIBLE);
    expect(corps.message).toMatch(/n'a pas été enregistrée/);
    expect(corps.message).toMatch(/reste disponible/);
    expect(corps.message).toMatch(/Réessayez/);
  });

  it('ne laisse fuir NI le message du prestataire, NI son nom, NI le statut technique', () => {
    const { hote, reponse } = construireHote();

    new SignatureProviderExceptionFilter().catch(erreurAbonnementExpire(), hote);

    const corps = JSON.stringify(reponse.json.mock.calls[0][0]);
    expect(corps).not.toMatch(/subscription/i);
    expect(corps).not.toMatch(/trial period/i);
    expect(corps).not.toMatch(/yousign/i);
    expect(corps).not.toMatch(/401/);
    expect(corps).not.toMatch(/authentification_refusee/);
  });
});
