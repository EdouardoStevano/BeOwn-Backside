import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, lastValueFrom } from 'rxjs';
import { AuditInterceptor, sanitizeBody } from './audit.interceptor';
import { AuditSansCorps } from './audit-sans-corps.decorator';
import { EmailAlreadyRegisteredError } from 'src/iam/domains/errors';
import {
  DemandeAccesPorteurEnCoursError,
  DemandeAccesPorteurEtrangereError,
  DemandeTropRapprocheeError,
} from 'src/porteur-access/domains/errors/porteur-access.errors';

/** Cible de réflexion neutre : aucune métadonnée d'audit posée dessus. */
class HandlerNu {
  action() {}
}

const makeCtx = (method: string, user?: { userId: number; role: string }) =>
  ({
    getHandler: () => HandlerNu.prototype.action,
    getClass: () => HandlerNu,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user,
        route: { path: '/admin/retraits/:txId/mark-processed' },
        url: '/admin/retraits/abc/mark-processed',
        params: { txId: 'abc' },
        ip: '10.0.0.1',
        headers: { 'user-agent': 'jest' },
        body: { montant: 100, password: 'hunter2' },
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  }) as any;

describe('AuditInterceptor', () => {
  const auditLogService = { create: jest.fn().mockResolvedValue({}) };
  const interceptor = new AuditInterceptor(
    auditLogService as any,
    new Reflector(),
  );
  beforeEach(() => jest.clearAllMocks());

  it('loggue une mutation authentifiée', async () => {
    await lastValueFrom(
      interceptor.intercept(makeCtx('POST', { userId: 7, role: 'cio' }), {
        handle: () => of({ ok: true }),
      } as any),
    );
    await new Promise(process.nextTick);
    expect(auditLogService.create).toHaveBeenCalledWith(
      '7',
      'cio',
      'POST /admin/retraits/:txId/mark-processed',
      'retraits',
      'abc',
      '10.0.0.1',
      'jest',
      expect.objectContaining({ statusCode: 200 }),
    );
  });

  it('ignore les GET', async () => {
    await lastValueFrom(
      interceptor.intercept(makeCtx('GET', { userId: 7, role: 'cio' }), {
        handle: () => of([]),
      } as any),
    );
    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it('ignore les requêtes non authentifiées', async () => {
    await lastValueFrom(
      interceptor.intercept(makeCtx('POST'), { handle: () => of({}) } as any),
    );
    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it("n'échoue pas si l'écriture audit échoue", async () => {
    auditLogService.create.mockRejectedValueOnce(new Error('db down'));
    const result = await lastValueFrom(
      interceptor.intercept(makeCtx('POST', { userId: 7, role: 'cio' }), {
        handle: () => of({ ok: true }),
      } as any),
    );
    expect(result).toEqual({ ok: true });
  });

  it('loggue aussi les mutations en erreur', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(makeCtx('DELETE', { userId: 7, role: 'cio' }), {
          handle: () =>
            throwError(() => Object.assign(new Error('nope'), { status: 403 })),
        } as any),
      ),
    ).rejects.toThrow('nope');
    await new Promise(process.nextTick);
    expect(auditLogService.create).toHaveBeenCalled();
  });

  /**
   * Le journal d'activité était noyé par une ligne à chaque notification lue
   * ou supprimée, masquant les décisions réellement traçables. Ces routes de
   * confort sont exclues — mais les diffusions admin restent auditées.
   */
  describe('exclusion des notifications', () => {
    const ctxForRoute = (path: string, method = 'POST') =>
      ({
        getHandler: () => HandlerNu.prototype.action,
        getClass: () => HandlerNu,
        switchToHttp: () => ({
          getRequest: () => ({
            method,
            user: { userId: 7, role: 'investisseur' },
            route: { path },
            url: path,
            params: {},
            ip: '10.0.0.1',
            headers: { 'user-agent': 'jest' },
            body: {},
          }),
          getResponse: () => ({ statusCode: 200 }),
        }),
      }) as any;

    it.each([
      '/notifications/:id/read',
      '/notifications/me/read-all',
      '/notifications/:id',
      '/notifications/me/all',
    ])("n'audite pas %s", async (path) => {
      await lastValueFrom(
        interceptor.intercept(ctxForRoute(path), {
          handle: () => of({ ok: true }),
        } as any),
      );
      await new Promise(process.nextTick);
      expect(auditLogService.create).not.toHaveBeenCalled();
    });

    it('audite toujours les diffusions /admin/notifications', async () => {
      await lastValueFrom(
        interceptor.intercept(ctxForRoute('/admin/notifications/broadcast'), {
          handle: () => of({ ok: true }),
        } as any),
      );
      await new Promise(process.nextTick);
      expect(auditLogService.create).toHaveBeenCalled();
    });

    it('laisse passer la requête sans la modifier', async () => {
      const result = await lastValueFrom(
        interceptor.intercept(ctxForRoute('/notifications/:id/read'), {
          handle: () => of({ ok: true }),
        } as any),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  /**
   * `audit_log` est conservé cinq ans, échappe au barème de purge de la
   * finalité concernée et n'entre dans aucun export de données personnelles :
   * y recopier un champ de texte libre nominatif (motivation d'une demande
   * d'accès porteur, note interne d'un instructeur) créerait une copie
   * durable hors de tout contrôle. `@AuditSansCorps()` coupe la recopie SANS
   * supprimer la trace.
   */
  describe('@AuditSansCorps — corps exclu de la trace', () => {
    @AuditSansCorps()
    class ControleurSansCorps {
      action() {}
    }

    const ctxSansCorps = () =>
      ({
        getHandler: () => ControleurSansCorps.prototype.action,
        getClass: () => ControleurSansCorps,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            user: { userId: 7, role: 'investisseur' },
            route: { path: '/porteur-access/demandes' },
            url: '/porteur-access/demandes',
            params: {},
            ip: '10.0.0.1',
            headers: { 'user-agent': 'jest' },
            body: { motivation: 'Je porte un immeuble à Saint-Denis…' },
          }),
          getResponse: () => ({ statusCode: 201 }),
        }),
      }) as any;

    it('journalise la requête SANS recopier le corps', async () => {
      await lastValueFrom(
        interceptor.intercept(ctxSansCorps(), {
          handle: () => of({ ok: true }),
        } as any),
      );
      await new Promise(process.nextTick);

      expect(auditLogService.create).toHaveBeenCalled();
      const metadata = auditLogService.create.mock.calls[0][7];
      expect(metadata.body).toEqual({
        _exclu: expect.stringContaining('non journalisé'),
      });
      // Contre-épreuve : le texte de la motivation n'apparaît NULLE PART.
      expect(JSON.stringify(metadata)).not.toContain('Saint-Denis');
    });

    it('la trace reste complète pour tout le reste', async () => {
      await lastValueFrom(
        interceptor.intercept(ctxSansCorps(), {
          handle: () => of({ ok: true }),
        } as any),
      );
      await new Promise(process.nextTick);

      expect(auditLogService.create).toHaveBeenCalledWith(
        '7',
        'investisseur',
        'POST /porteur-access/demandes',
        'porteur-access',
        undefined,
        '10.0.0.1',
        'jest',
        expect.objectContaining({ statusCode: 201 }),
      );
    });

    it('une route non marquée conserve son corps (contre-épreuve)', async () => {
      await lastValueFrom(
        interceptor.intercept(makeCtx('POST', { userId: 7, role: 'cio' }), {
          handle: () => of({ ok: true }),
        } as any),
      );
      await new Promise(process.nextTick);

      const metadata = auditLogService.create.mock.calls[0][7];
      expect(metadata.body).toEqual({ montant: 100, password: '[MASQUE]' });
    });
  });

  /**
   * Anomalie de recette (MAJEUR) : les erreurs métier ne sont pas des
   * `HttpException` — elles ignorent HTTP par construction et sont traduites
   * par un filtre qui s'exécute APRÈS cet intercepteur. `err?.status ?? 500`
   * écrivait donc « 500 » pour des refus métier parfaitement normaux, dans un
   * journal conservé cinq ans.
   */
  describe('statut journalisé pour une erreur métier', () => {
    const interceptEnErreur = async (erreur: unknown) => {
      auditLogService.create.mockClear();
      await expect(
        lastValueFrom(
          interceptor.intercept(makeCtx('POST', { userId: 7, role: 'cio' }), {
            handle: () => throwError(() => erreur),
          } as any),
        ),
      ).rejects.toBeDefined();
      await new Promise(process.nextTick);
      return auditLogService.create.mock.calls[0][7].statusCode;
    };

    it.each([
      ['409 double soumission', new DemandeAccesPorteurEnCoursError(), 409],
      ['403 demande étrangère', new DemandeAccesPorteurEtrangereError(), 403],
      ['429 délai de carence', new DemandeTropRapprocheeError(new Date()), 429],
      ['409 conflit IAM', new EmailAlreadyRegisteredError(), 409],
    ])('%s est journalisé %i, pas 500', async (_cas, erreur, attendu) => {
      await expect(interceptEnErreur(erreur)).resolves.toBe(attendu);
    });

    it('CONTRE-ÉPREUVE : une vraie erreur serveur reste journalisée 500', async () => {
      // Sans elle, un résolveur qui rendrait 409 partout passerait les tests
      // ci-dessus tout en effaçant les incidents réels du journal.
      await expect(interceptEnErreur(new Error('boom'))).resolves.toBe(500);
    });

    it('une HttpException conserve son propre statut', async () => {
      await expect(interceptEnErreur(new ForbiddenException())).resolves.toBe(
        403,
      );
    });
  });

  it('sanitizeBody masque les champs sensibles et tronque', () => {
    const out = sanitizeBody({ password: 'x', iban: 'FR76', note: 'ok' });
    expect(out).toEqual({ password: '[MASQUE]', iban: '[MASQUE]', note: 'ok' });
  });

  it('sanitizeBody tronque un corps dépassant 2048 caractères', () => {
    const out = sanitizeBody({ description: 'x'.repeat(3000) });
    expect(out).toEqual({ _truncated: expect.any(String) });
  });
});
