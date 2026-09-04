import { AuthenticationController } from 'src/iam/presenters/http/authentication.controller';
import { UserController } from 'src/iam/presenters/http/user.controller';
import { SecondaryMarketController } from 'src/secondarymarket/presenters/http/secondary-market.controller';

/**
 * Paliers de débit des routes sensibles, vérifiés SUR LES DÉCORATEURS.
 *
 * Un `@Throttle` oublié ne casse aucun test fonctionnel : la route marche
 * parfaitement, elle est simplement sans limite. Ces assertions lisent la
 * métadonnée que pose le décorateur, donc exactement ce que le guard lira à
 * l'exécution.
 *
 * Rappel du piège maison : un `@SkipThrottle()` SANS argument n'inscrit que la
 * clé `default`, que le guard n'interroge jamais — il ne « saute » donc rien
 * et laisse la route sur les limites globales, larges et jamais choisies pour
 * elle. C'est ce qui a été remplacé par des paliers explicites.
 */
const palier = (
  prototype: object,
  methode: string,
  throttler: 'short' | 'medium' | 'auth',
): { ttl: unknown; limit: unknown } => {
  const handler = (prototype as unknown as Record<string, unknown>)[methode];
  return {
    ttl: Reflect.getMetadata(`THROTTLER:TTL${throttler}`, handler as object),
    limit: Reflect.getMetadata(`THROTTLER:LIMIT${throttler}`, handler as object),
  };
};

describe('paliers `auth` des portes d’authentification', () => {
  it.each([
    ['resetPassword', 'consomme un jeton de réinitialisation'],
    ['exchange', 'échange un code contre une session complète'],
    ['enableMfa', 'vérifie un code à six chiffres qui ARME le facteur'],
  ])('POST /auth → %s : 5 tentatives / 15 min', (methode) => {
    expect(palier(AuthenticationController.prototype, methode, 'auth')).toEqual({
      ttl: 900_000,
      limit: 5,
    });
  });
});

describe('DELETE /users/me — oracle de mot de passe', () => {
  it('porte un palier `auth` explicite malgré le @SkipThrottle de classe', () => {
    // La route distingue « mot de passe incorrect » (401) de « suppression
    // bloquée » (409) : depuis une session volée, c'est un oracle qui rend le
    // mot de passe en clair de la victime.
    expect(palier(UserController.prototype, 'deleteMe', 'auth')).toEqual({
      ttl: 900_000,
      limit: 5,
    });
  });

  it.each(['short', 'medium', 'auth'])(
    'ressort explicitement du @SkipThrottle de classe (palier %s)',
    (throttler) => {
      const handler = (UserController.prototype as unknown as Record<string, unknown>)
        .deleteMe as object;
      expect(
        Reflect.getMetadata(`THROTTLER:SKIP${throttler}`, handler),
      ).toBe(false);
    },
  );
});

describe('marché secondaire — paliers explicites sur les mutations', () => {
  it.each([
    'createOrder',
    'cancelOrder',
    'exprimerInteret',
    'accepterInteret',
    'refuserInteret',
  ])('%s : 20 / min', (methode) => {
    expect(
      palier(SecondaryMarketController.prototype, methode, 'short'),
    ).toEqual({ ttl: 60_000, limit: 20 });
  });

  it('la lecture publique du carnet est limitée elle aussi', () => {
    // Le palier de classe s'applique à `listOrders`, qui est `@Public()`.
    expect(
      Reflect.getMetadata('THROTTLER:LIMITshort', SecondaryMarketController),
    ).toBe(60);
  });
});
