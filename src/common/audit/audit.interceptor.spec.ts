import { of, throwError, lastValueFrom } from 'rxjs';
import { AuditInterceptor, sanitizeBody } from './audit.interceptor';

const makeCtx = (method: string, user?: { userId: number; role: string }) =>
  ({
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
  const interceptor = new AuditInterceptor(auditLogService as any);
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
          handle: () => throwError(() => Object.assign(new Error('nope'), { status: 403 })),
        } as any),
      ),
    ).rejects.toThrow('nope');
    await new Promise(process.nextTick);
    expect(auditLogService.create).toHaveBeenCalled();
  });

  it('sanitizeBody masque les champs sensibles et tronque', () => {
    const out = sanitizeBody({ password: 'x', iban: 'FR76', note: 'ok' });
    expect(out).toEqual({ password: '[MASQUE]', iban: '[MASQUE]', note: 'ok' });
  });
});
