import { ExecutionContext } from '@nestjs/common';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleCallbackGuard } from './google-callback.guard';
import { LinkedinAuthGuard } from './linkedin-auth.guard';
import { LinkedinCallbackGuard } from './linkedin-callback.guard';

/**
 * Non-régression du bug OAuth « Connexion annulée ou refusée » :
 *
 * Les guards d'auth transportaient la cible front/admin dans le paramètre OAuth
 * `state` (string). Or passport-oauth2 court-circuite alors la pose du cookie de
 * state (CookieOAuthStateStore.store() non appelé) mais le VÉRIFIE au callback →
 * échec systématique. Le fix : la cible passe par un cookie dédié, et
 * getAuthenticateOptions ne doit JAMAIS renvoyer de `state`.
 */
const ctxWith = (req: any): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

const makeReq = (over: Partial<any> = {}) => ({
  query: {},
  headers: {},
  res: { cookie: jest.fn(), clearCookie: jest.fn() },
  ...over,
});

describe('OAuth guards — cible via cookie dédié, jamais via `state`', () => {
  describe.each([
    ['Google', GoogleAuthGuard],
    ['LinkedIn', LinkedinAuthGuard],
  ])('%s auth guard', (_name, Guard: any) => {
    it('ne renvoie PAS de `state` (sinon passport saute le cookie CSRF)', () => {
      const req = makeReq({ query: { redirectTo: 'admin' } });
      const opts = new Guard().getAuthenticateOptions(ctxWith(req));
      expect(opts).toEqual({});
      expect(opts).not.toHaveProperty('state');
    });

    it('mémorise la cible dans le cookie dédié beown_oauth_redirect', () => {
      const req = makeReq({ query: { redirectTo: 'admin' } });
      new Guard().getAuthenticateOptions(ctxWith(req));
      expect(req.res.cookie).toHaveBeenCalledWith(
        'beown_oauth_redirect',
        'admin',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
    });

    it("défaut = 'frontend' quand redirectTo absent", () => {
      const req = makeReq();
      new Guard().getAuthenticateOptions(ctxWith(req));
      expect(req.res.cookie).toHaveBeenCalledWith(
        'beown_oauth_redirect',
        'frontend',
        expect.any(Object),
      );
    });
  });

  describe.each([
    ['Google', GoogleCallbackGuard],
    ['LinkedIn', LinkedinCallbackGuard],
  ])('%s callback guard', (_name, Guard: any) => {
    it('lit le cookie et marque _redirectTo=admin', () => {
      const req = makeReq({
        headers: { cookie: 'beown_oauth_redirect=admin' },
      });
      const user: any = { email: 'a@b.c' };
      const out = new Guard().handleRequest(null, user, null, ctxWith(req));
      expect(out._redirectTo).toBe('admin');
      // Le cookie est nettoyé après lecture.
      expect(req.res.clearCookie).toHaveBeenCalledWith(
        'beown_oauth_redirect',
        expect.objectContaining({ path: '/auth' }),
      );
    });

    it('reste sur le front (pas de _redirectTo) sans cookie admin', () => {
      const req = makeReq({ headers: { cookie: '' } });
      const user: any = { email: 'a@b.c' };
      const out = new Guard().handleRequest(null, user, null, ctxWith(req));
      expect(out._redirectTo).toBeUndefined();
    });

    it('rejette (null) si pas d’utilisateur', () => {
      const req = makeReq();
      const out = new Guard().handleRequest(null, null, null, ctxWith(req));
      expect(out).toBeNull();
    });
  });
});
