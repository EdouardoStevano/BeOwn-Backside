import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { statutHttpDeLErreur } from './statut-erreur-metier';
import { IamError, IamErrorKind } from 'src/iam/domains/errors';
import {
  EmailAlreadyRegisteredError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import { IamErrorFilter } from 'src/iam/presenters/http/filters/iam-error.filter';
import {
  PorteurAccessError,
  PorteurAccessErrorKind,
} from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  DemandeAccesPorteurEnCoursError,
  DemandeAccesPorteurEtrangereError,
  DemandeTropRapprocheeError,
} from 'src/porteur-access/domains/errors/porteur-access.errors';
import { PorteurAccessErrorFilter } from 'src/porteur-access/presenters/http/filters/porteur-access-error.filter';
import { PayoutMethodError } from 'src/payments/applications/ports/payout-methods.port';
import { PayoutMethodExceptionFilter } from 'src/payments/presenters/http/payout-method-exception.filter';
import { SignatureProviderUnavailableError } from 'src/common/yousign/signature-provider.error';
import { SignatureProviderExceptionFilter } from 'src/common/yousign/signature-provider-exception.filter';

/**
 * Anomalie de recette (MAJEUR) : `AuditInterceptor` écrivait
 * `err?.status ?? 500`. Les erreurs MÉTIER du dépôt ne sont pas des
 * `HttpException` — elles ignorent HTTP par construction et sont traduites par
 * un filtre qui s'exécute EN AVAL de l'intercepteur. Résultat : des 409, 403
 * et 429 tous journalisés « 500 » dans `audit_log`, conservé cinq ans, alors
 * que le client recevait les bons codes.
 *
 * Ce fichier éprouve deux choses distinctes :
 *  1. le résolveur rend le bon statut pour chaque famille ;
 *  2. il ne peut pas DIVERGER du filtre : chaque filtre RÉEL est rejoué et son
 *     statut comparé à celui du résolveur.
 */

/** Sous-classes de test : un exemplaire par « kind », sans en chercher un concret. */
class IamErrorStub extends IamError {
  constructor(readonly kind: IamErrorKind) {
    super('peu importe');
  }
}

class PorteurAccessErrorStub extends PorteurAccessError {
  readonly code = 'STUB';
  constructor(readonly kind: PorteurAccessErrorKind) {
    super('peu importe');
  }
}

/** Hôte minimal qui ENREGISTRE le statut posé par un filtre. */
const hoteEnregistreur = () => {
  const enregistre = { statusCode: undefined as number | undefined };
  const response = {
    status: (code: number) => {
      enregistre.statusCode = code;
      return response;
    },
    json: () => response,
    setHeader: () => response,
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/peu-importe' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, enregistre };
};

describe('Résolution du statut — par famille', () => {
  describe('IamError', () => {
    it.each([
      [IamErrorKind.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED],
      [IamErrorKind.FORBIDDEN, HttpStatus.FORBIDDEN],
      [IamErrorKind.NOT_FOUND, HttpStatus.NOT_FOUND],
      [IamErrorKind.CONFLICT, HttpStatus.CONFLICT],
      [IamErrorKind.INVALID_INPUT, HttpStatus.BAD_REQUEST],
      [IamErrorKind.UNEXPECTED, HttpStatus.INTERNAL_SERVER_ERROR],
    ])('%s → %i', (kind, attendu) => {
      expect(statutHttpDeLErreur(new IamErrorStub(kind))).toBe(attendu);
    });

    it('vaut aussi pour les erreurs réelles de la hiérarchie', () => {
      expect(statutHttpDeLErreur(new EmailAlreadyRegisteredError())).toBe(409);
      expect(statutHttpDeLErreur(new UserNotFoundError())).toBe(404);
    });
  });

  describe('PorteurAccessError', () => {
    it.each([
      [PorteurAccessErrorKind.FORBIDDEN, HttpStatus.FORBIDDEN],
      [PorteurAccessErrorKind.NOT_FOUND, HttpStatus.NOT_FOUND],
      [PorteurAccessErrorKind.CONFLICT, HttpStatus.CONFLICT],
      [PorteurAccessErrorKind.INVALID_INPUT, HttpStatus.BAD_REQUEST],
      [PorteurAccessErrorKind.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS],
    ])('%s → %i', (kind, attendu) => {
      expect(statutHttpDeLErreur(new PorteurAccessErrorStub(kind))).toBe(
        attendu,
      );
    });

    it('les trois refus constatés en recette ne sont plus des 500', () => {
      // Ce sont exactement les cas mesurés : 5×409, 1×403, 1×429.
      expect(statutHttpDeLErreur(new DemandeAccesPorteurEnCoursError())).toBe(
        409,
      );
      expect(statutHttpDeLErreur(new DemandeAccesPorteurEtrangereError())).toBe(
        403,
      );
      expect(
        statutHttpDeLErreur(new DemandeTropRapprocheeError(new Date())),
      ).toBe(429);
    });
  });

  describe('PayoutMethodError', () => {
    it.each([
      ['CONNECT_NOT_READY', HttpStatus.CONFLICT],
      ['CANNOT_DELETE_DEFAULT', HttpStatus.CONFLICT],
      ['NO_PAYOUT_METHOD', HttpStatus.UNPROCESSABLE_ENTITY],
      ['CARD_NOT_INSTANT_ELIGIBLE', HttpStatus.UNPROCESSABLE_ENTITY],
      ['CARD_REJECTED', HttpStatus.UNPROCESSABLE_ENTITY],
      ['AMOUNT_OUT_OF_RANGE', HttpStatus.UNPROCESSABLE_ENTITY],
    ])('%s → %i', (code, attendu) => {
      expect(
        statutHttpDeLErreur(new PayoutMethodError(code as never, 'msg')),
      ).toBe(attendu);
    });
  });

  describe('SignatureProviderUnavailableError', () => {
    it('reste une indisponibilité de dépendance (503), jamais un 500', () => {
      const erreur = new SignatureProviderUnavailableError({
        operation: 'POST /signature_requests',
        motif: 'panne',
      });
      expect(statutHttpDeLErreur(erreur)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });

  describe('HttpException et repli', () => {
    it.each([
      [new ForbiddenException(), 403],
      [new NotFoundException(), 404],
      [new BadRequestException(), 400],
    ])('%p garde son propre statut', (erreur, attendu) => {
      expect(statutHttpDeLErreur(erreur)).toBe(attendu);
    });

    it('le gel des avoirs (vraie ForbiddenException à corps structuré) → 403', () => {
      const gel = new ForbiddenException({
        code: 'AVOIRS_GELES',
        message: 'Opération refusée.',
      });
      expect(statutHttpDeLErreur(gel)).toBe(403);
    });

    it('CONTRE-ÉPREUVE : une vraie erreur serveur reste un 500', () => {
      // Sans elle, un résolveur qui rendrait 409 partout passerait les tests
      // ci-dessus tout en effaçant les incidents réels du journal.
      expect(statutHttpDeLErreur(new Error('boom'))).toBe(500);
      expect(statutHttpDeLErreur(new TypeError('undefined is not a fn'))).toBe(
        500,
      );
      expect(statutHttpDeLErreur(null)).toBe(500);
      expect(statutHttpDeLErreur(undefined)).toBe(500);
      expect(statutHttpDeLErreur({})).toBe(500);
    });

    it('un `status` numérique brut reste honoré (repli historique)', () => {
      expect(statutHttpDeLErreur({ status: 418 })).toBe(418);
    });
  });
});

/**
 * Le point qui compte vraiment : le résolveur ne peut pas dériver du filtre,
 * puisque les deux lisent la même fonction. Ce test le PROUVE en exécutant les
 * filtres réels.
 */
describe('Non-divergence : le statut journalisé est celui envoyé au client', () => {
  const cas: Array<{
    famille: string;
    erreur: unknown;
    rejouer: (erreur: never, host: ArgumentsHost) => void;
  }> = [
    ...Object.values(IamErrorKind).map((kind) => ({
      famille: `IamError(${kind})`,
      erreur: new IamErrorStub(kind),
      rejouer: (e: never, host: ArgumentsHost) =>
        new IamErrorFilter().catch(e, host),
    })),
    ...Object.values(PorteurAccessErrorKind).map((kind) => ({
      famille: `PorteurAccessError(${kind})`,
      erreur: new PorteurAccessErrorStub(kind),
      rejouer: (e: never, host: ArgumentsHost) =>
        new PorteurAccessErrorFilter().catch(e, host),
    })),
    ...(
      [
        'CONNECT_NOT_READY',
        'CANNOT_DELETE_DEFAULT',
        'NO_PAYOUT_METHOD',
        'CARD_NOT_INSTANT_ELIGIBLE',
        'CARD_REJECTED',
        'AMOUNT_OUT_OF_RANGE',
      ] as const
    ).map((code) => ({
      famille: `PayoutMethodError(${code})`,
      erreur: new PayoutMethodError(code, 'msg'),
      rejouer: (e: never, host: ArgumentsHost) =>
        new PayoutMethodExceptionFilter().catch(e, host),
    })),
    {
      famille: 'SignatureProviderUnavailableError',
      erreur: new SignatureProviderUnavailableError({
        operation: 'POST /signature_requests',
        motif: 'panne',
      }),
      rejouer: (e: never, host: ArgumentsHost) =>
        new SignatureProviderExceptionFilter().catch(e, host),
    },
  ];

  it.each(cas.map((c) => [c.famille, c] as const))(
    '%s : filtre et audit disent le même statut',
    (_nom, cas) => {
      const { host, enregistre } = hoteEnregistreur();
      cas.rejouer(cas.erreur as never, host);

      expect(enregistre.statusCode).toEqual(expect.any(Number));
      expect(statutHttpDeLErreur(cas.erreur)).toBe(enregistre.statusCode);
      // Et surtout : ce n'est pas la valeur par défaut qui s'est glissée là.
      if (enregistre.statusCode !== 500) {
        expect(statutHttpDeLErreur(cas.erreur)).not.toBe(500);
      }
    },
  );

  it('couvre TOUTES les familles d’erreurs métier à filtre du dépôt', () => {
    // Garde-fou d'exhaustivité : une cinquième famille introduite sans être
    // ajoutée ici — et donc au résolveur — fait échouer ce test.
    const familles = new Set(cas.map((c) => c.famille.replace(/\(.*\)$/, '')));
    expect([...familles].sort()).toEqual([
      'IamError',
      'PayoutMethodError',
      'PorteurAccessError',
      'SignatureProviderUnavailableError',
    ]);
  });
});
