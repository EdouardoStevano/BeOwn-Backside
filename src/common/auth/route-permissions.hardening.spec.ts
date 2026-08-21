import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { UserController } from 'src/iam/presenters/http/user.controller';
import { AdminController } from 'src/admin/admin.controller';
import {
  AdminEcheancesController,
  AdminEcheancesItemController,
} from 'src/admin/admin-echeances.controller';

/**
 * Lot 2-back — durcissement des autorisations de routes.
 *
 * Ces tests n'inspectent pas seulement les métadonnées : ils exécutent le
 * `PermissionsGuard` réel sur le handler réel, et vérifient qu'un rôle non
 * habilité reçoit bien un 403. Une permission retirée d'une route ferait donc
 * échouer le test, pas seulement une annotation oubliée.
 */
type ControllerClass = new (...args: any[]) => any;

const guard = new PermissionsGuard(new Reflector());

/** Contexte d'exécution minimal : un handler, sa classe, et le rôle appelant. */
const contextFor = (
  controller: ControllerClass,
  method: string,
  role: string | undefined,
): any => ({
  getHandler: () => controller.prototype[method],
  getClass: () => controller,
  switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : {} }) }),
});

const allows = (
  controller: ControllerClass,
  method: string,
  role: string | undefined,
): boolean => guard.canActivate(contextFor(controller, method, role));

const expectForbidden = (
  controller: ControllerClass,
  method: string,
  role: string | undefined,
): void => {
  expect(() => guard.canActivate(contextFor(controller, method, role))).toThrow(
    ForbiddenException,
  );
};

describe('Durcissement des autorisations de routes (Lot 2-back)', () => {
  // ─── 1. POST /users ────────────────────────────────────────────────────────

  describe('POST /users — création de compte back-office (route SUPPRIMÉE)', () => {
    /**
     * Ce contrôleur exposait un `POST /users` protégé par le seul
     * `JwtAuthGuard` : n'importe quel utilisateur authentifié pouvait créer des
     * comptes en contournant le reCAPTCHA, le throttle et la vérification
     * d'e-mail de `POST /auth/sign-up`.
     *
     * Le durcissement initial le réservait à `users:manage`. La refonte
     * hexagonale IAM va plus loin et SUPPRIME la route : l'inscription n'a
     * qu'une porte, `POST /auth/sign-up`. On garde donc une garde de
     * non-régression sur l'absence du point d'entrée plutôt que sur sa
     * permission — réintroduire un `POST /users` ici rouvrirait la faille.
     */
    it('le contrôleur n\'expose plus de point d\'entrée de création de compte', () => {
      const proto = UserController.prototype as unknown as Record<string, unknown>;
      expect(proto.register).toBeUndefined();
      expect(proto.create).toBeUndefined();
    });

    it('aucune méthode du contrôleur n\'est montée en POST sur la racine', () => {
      // `POST /users` reviendrait forcément par une méthode décorée @Post()
      // sans chemin : on vérifie qu'il n'en existe aucune.
      const methods = Object.getOwnPropertyNames(UserController.prototype).filter(
        (m) => m !== 'constructor',
      );
      const rootPosts = methods.filter((m) => {
        const handler = (UserController.prototype as any)[m];
        if (typeof handler !== 'function') return false;
        const httpMethod = Reflect.getMetadata('method', handler);
        const path = Reflect.getMetadata('path', handler);
        // 1 = RequestMethod.POST dans Nest.
        return httpMethod === 1 && (path === '/' || path === '');
      });
      expect(rootPosts).toEqual([]);
    });
  });

  // ─── 2. Échéancier : lecture vs mutation ───────────────────────────────────

  describe('Échéancier — une permission de lecture n\'autorise plus les mutations', () => {
    const MUTATIONS: Array<[ControllerClass, string, string]> = [
      [AdminEcheancesController, 'patchAggregated', 'PATCH /admin/projects/:projectId/echeances/:numero'],
      [AdminEcheancesController, 'deleteAggregated', 'DELETE /admin/projects/:projectId/echeances/:numero'],
      [AdminEcheancesController, 'initialize', 'POST /admin/projects/:projectId/echeances/initialize'],
      [AdminEcheancesController, 'recompute', 'POST /admin/projects/:projectId/echeances/recompute'],
      [AdminEcheancesItemController, 'remove', 'DELETE /admin/echeances/:id'],
    ];

    it.each(MUTATIONS)('%#. rcci ne peut plus muter (%s)', (controller, method) => {
      expectForbidden(controller as ControllerClass, method as string, UserRole.RCCI);
    });

    it.each(MUTATIONS)(
      '%#. cio/financier/super_admin conservent la mutation (%s)',
      (controller, method) => {
        for (const role of [UserRole.CIO, UserRole.FINANCIER, UserRole.SUPER_ADMIN]) {
          expect(allows(controller as ControllerClass, method as string, role)).toBe(true);
        }
      },
    );

    it.each(MUTATIONS)(
      '%#. un rôle hors périmètre financier est refusé (%s)',
      (controller, method) => {
        for (const role of [
          UserRole.ANALYSTE_FINANCIER,
          UserRole.SUPPORT,
          UserRole.INVESTISSEUR,
        ]) {
          expectForbidden(controller as ControllerClass, method as string, role);
        }
      },
    );

    it('la CONSULTATION de l\'échéancier reste ouverte à rcci', () => {
      expect(
        allows(AdminEcheancesController, 'getAggregatedSchedule', UserRole.RCCI),
      ).toBe(true);
    });

    it('le paiement reste refusé à cio/financier (super_admin seul)', () => {
      expectForbidden(AdminEcheancesController, 'triggerPayment', UserRole.CIO);
      expectForbidden(AdminEcheancesController, 'markPaid', UserRole.FINANCIER);
      expect(
        allows(AdminEcheancesController, 'triggerPayment', UserRole.SUPER_ADMIN),
      ).toBe(true);
    });
  });

  // ─── 3. GET /admin/users ───────────────────────────────────────────────────

  describe('GET /admin/users — minimisation RGPD', () => {
    it.each([UserRole.CIO, UserRole.FINANCIER, UserRole.ANALYSTE_FINANCIER])(
      'refuse %s : reports:read n\'ouvre plus l\'annuaire',
      (role) => {
        expectForbidden(AdminController, 'listUsers', role);
      },
    );

    it.each([
      UserRole.SUPER_ADMIN,
      UserRole.COMPLIANCE,
      UserRole.MARKETING,
      UserRole.SUPPORT,
      UserRole.CHARGE_RELATION_INVESTISSEUR,
      UserRole.DPO,
    ])('autorise %s (users:read)', (role) => {
      expect(allows(AdminController, 'listUsers', role)).toBe(true);
    });

    it('autorise rcci via aml:manage (sélecteur PEP) — projection restreinte côté handler', () => {
      expect(allows(AdminController, 'listUsers', UserRole.RCCI)).toBe(true);
    });

    it('refuse un investisseur', () => {
      expectForbidden(AdminController, 'listUsers', UserRole.INVESTISSEUR);
    });
  });

  // ─── 4. ANO-02 — routes nominatives d'AdminController ──────────────────────

  describe('GET /admin/activity — journal nominatif (ANO-02)', () => {
    it.each([UserRole.FINANCIER, UserRole.ANALYSTE_FINANCIER])(
      '%s ne lit plus le journal (fuite constatée en QA)',
      (role) => {
        expectForbidden(AdminController, 'getActivity', role);
      },
    );

    it.each([UserRole.CIO, UserRole.MARKETING, UserRole.COMPLIANCE])(
      'refuse %s : reports:read n\'ouvre plus le journal',
      (role) => {
        expectForbidden(AdminController, 'getActivity', role);
      },
    );

    it.each([UserRole.SUPER_ADMIN, UserRole.RCCI, UserRole.DPO])(
      'autorise %s (audit:read) — aligné sur la navigation du back-office',
      (role) => {
        expect(allows(AdminController, 'getActivity', role)).toBe(true);
      },
    );

    it('les statistiques agrégées restent ouvertes à reports:read', () => {
      // Aucune identité dans ces réponses : le durcissement ne doit pas les
      // emporter au passage.
      for (const method of ['getStats', 'getMonthly', 'getCities']) {
        expect(allows(AdminController, method, UserRole.FINANCIER)).toBe(true);
        expect(allows(AdminController, method, UserRole.ANALYSTE_FINANCIER)).toBe(true);
      }
    });
  });

  describe('Routes nominatives voisines — même logique appliquée', () => {
    it('GET /admin/users/:id/investments exige users:read', () => {
      for (const role of [
        UserRole.CIO,
        UserRole.FINANCIER,
        UserRole.ANALYSTE_FINANCIER,
      ]) {
        expectForbidden(AdminController, 'getUserInvestments', role);
      }
      for (const role of [UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.DPO]) {
        expect(allows(AdminController, 'getUserInvestments', role)).toBe(true);
      }
    });

    it('GET /admin/projects/:id/investors exige projects:read', () => {
      // marketing perd l'accès (aucune page projet ne lui est ouverte) ;
      // support et chargé de relation le gagnent (ils atteignent la page).
      expectForbidden(AdminController, 'getProjectInvestors', UserRole.MARKETING);
      for (const role of [
        UserRole.SUPPORT,
        UserRole.CHARGE_RELATION_INVESTISSEUR,
        UserRole.ANALYSTE_FINANCIER,
        UserRole.CIO,
      ]) {
        expect(allows(AdminController, 'getProjectInvestors', role)).toBe(true);
      }
    });

    it('un investisseur reste refusé partout', () => {
      for (const method of [
        'getActivity',
        'getUserInvestments',
        'getProjectInvestors',
        'getStats',
      ]) {
        expectForbidden(AdminController, method, UserRole.INVESTISSEUR);
      }
    });
  });
});
