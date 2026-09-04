import { CookieOAuthStateStore } from './cookie-oauth-state.store';

/**
 * Le secret de signature de l'état OAuth retombait silencieusement sur
 * `JWT_SECRET`. Un même secret signait alors des jetons de session ET un
 * cookie anti-CSRF éphémère : la rotation de l'un cassait l'autre, et rien au
 * démarrage ne distinguait un déploiement configuré d'un déploiement en repli.
 */
describe('CookieOAuthStateStore — secret dédié', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('refuse de se construire sans OAUTH_STATE_SECRET, même avec JWT_SECRET', () => {
    delete process.env.OAUTH_STATE_SECRET;
    process.env.JWT_SECRET = 'secret-de-session';

    expect(() => new CookieOAuthStateStore('google')).toThrow(
      /OAUTH_STATE_SECRET/,
    );
  });

  it('se construit avec le secret dédié', () => {
    process.env.OAUTH_STATE_SECRET = 'secret-oauth-dedie';

    expect(() => new CookieOAuthStateStore('google')).not.toThrow();
  });

  it('signe un état vérifiable par le même magasin', () => {
    process.env.OAUTH_STATE_SECRET = 'secret-oauth-dedie';
    const store = new CookieOAuthStateStore('google');

    let etat = '';
    const cookies: Record<string, string> = {};
    store.store(
      { res: { cookie: (n: string, v: string) => (cookies[n] = v) } },
      (_e, s) => (etat = s ?? ''),
    );

    let valide = false;
    store.verify(
      {
        headers: { cookie: `beown_oauth_state_google=${etat}` },
        res: { clearCookie: jest.fn() },
      },
      etat,
      (_e, v) => (valide = v),
    );

    expect(valide).toBe(true);
  });

  it('refuse un état signé avec un autre secret', () => {
    process.env.OAUTH_STATE_SECRET = 'secret-oauth-dedie';
    const emetteur = new CookieOAuthStateStore('google');
    let etat = '';
    emetteur.store({ res: { cookie: jest.fn() } }, (_e, s) => (etat = s ?? ''));

    process.env.OAUTH_STATE_SECRET = 'un-autre-secret';
    const verificateur = new CookieOAuthStateStore('google');

    let valide = true;
    verificateur.verify(
      {
        headers: { cookie: `beown_oauth_state_google=${etat}` },
        res: { clearCookie: jest.fn() },
      },
      etat,
      (_e, v) => (valide = v),
    );

    expect(valide).toBe(false);
  });
});
