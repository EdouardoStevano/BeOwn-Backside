import { ForbiddenException } from '@nestjs/common';
import { AdminProjectFinanceController } from './admin-project-finance.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/common/auth/permissions.constants';

/**
 * L'écran financier projet donne accès au montant dû à un porteur et permet
 * de constater des versements. Deux gardes se superposent :
 *  1. `@RequirePermission('funds:disburse')`, résolu par le PermissionsGuard
 *     global depuis la matrice de rôles ;
 *  2. une relecture du rôle EN BASE dans le contrôleur — un token forgé ou
 *     antérieur à un retrait de rôle ne passe pas.
 *
 * Anti-IDOR : l'identifiant de projet est un simple paramètre d'URL. Aucun
 * rôle non habilité ne doit pouvoir lire l'état financier d'un projet, quel
 * que soit l'identifiant qu'il fournit — c'est la surface d'attaque de cette
 * route, puisqu'il n'existe pas de notion de « propriétaire » d'un projet ici.
 */
describe('AdminProjectFinanceController — habilitation et anti-IDOR', () => {
  const PROJET_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PROJET_B = 'ffffffff-1111-2222-3333-444444444444';

  let userRepo: any;
  let projectRepo: any;
  let projectLedger: any;
  let auditLog: any;
  let controller: AdminProjectFinanceController;

  const etatDe = (projetId: string) => ({
    projetId,
    devise: 'EUR',
    collecte: 50000,
    enDelaiReflexion: 0,
    fraisRetenus: 0,
    netAVerser: 50000,
    dejaVerse: 0,
    restantDu: 50000,
    soldeWalletProjet: 50000,
    ecartReconciliation: 0,
    coherent: true,
  });

  const connecte = (role: UserRole, userId = 1) => {
    userRepo.findOne.mockResolvedValue({ userId, role });
    return { userId, role } as any;
  };

  const requete = () => ({ ip: '127.0.0.1', headers: {} }) as any;

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    projectLedger = {
      etatFinancier: jest.fn(async (id: string) => etatDe(id)),
      declarerVersementPorteur: jest.fn(async (input: any) => ({
        transactionId: 'tx-1',
        projetId: input.projetId,
        montant: input.montant ?? 50000,
        referenceBancaire: input.referenceBancaire,
        dateVersement: input.dateVersement,
        etatFinancier: etatDe(input.projetId),
      })),
    };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };

    projectRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([
            [
              { id: PROJET_A, titre: 'Projet A', statut: 'finance' },
              { id: PROJET_B, titre: 'Projet B', statut: 'en_collecte' },
            ],
            2,
          ]),
      })),
    };
    projectLedger.etatFinancierParProjets = jest.fn(
      async (ids: string[]) => new Map(ids.map((id) => [id, etatDe(id)])),
    );

    controller = new AdminProjectFinanceController(
      userRepo,
      projectRepo,
      projectLedger,
      auditLog,
    );
  });

  describe('permission retenue', () => {
    it('« funds:disburse » couvre l’équipe finance et EXCLUT marketing', () => {
      // Le lot 7b exige précisément ce résultat : financier@ voit l'écran,
      // marketing@ ne le voit pas. `reports:read` aurait laissé passer
      // marketing — d'où le choix de `funds:disburse`.
      expect(hasPermission(UserRole.SUPER_ADMIN, 'funds:disburse')).toBe(true);
      expect(hasPermission(UserRole.FINANCIER, 'funds:disburse')).toBe(true);
      expect(hasPermission(UserRole.CIO, 'funds:disburse')).toBe(true);
      expect(hasPermission(UserRole.MARKETING, 'funds:disburse')).toBe(false);
      expect(hasPermission(UserRole.INVESTISSEUR, 'funds:disburse')).toBe(false);
      expect(hasPermission(UserRole.PORTEUR, 'funds:disburse')).toBe(false);
      expect(rolesWithPermission('funds:disburse')).toEqual(
        expect.arrayContaining([
          UserRole.SUPER_ADMIN,
          UserRole.CIO,
          UserRole.FINANCIER,
        ]),
      );
    });
  });

  describe('GET etat-financier (tableau paginé)', () => {
    it('rôle financier : une ligne par projet, sans N+1 d’agrégats', async () => {
      const user = connecte(UserRole.FINANCIER);

      const page = await controller.listerEtatsFinanciers(user, {
        page: 1,
        limit: 25,
      } as any);

      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.items[0]).toMatchObject({
        projetId: PROJET_A,
        titre: 'Projet A',
        statutProjet: 'finance',
        collecte: 50000,
        netAVerser: 50000,
        restantDu: 50000,
      });
      // Un SEUL appel d'agrégats pour toute la page.
      expect(projectLedger.etatFinancierParProjets).toHaveBeenCalledTimes(1);
      expect(projectLedger.etatFinancierParProjets).toHaveBeenCalledWith([
        PROJET_A,
        PROJET_B,
      ]);
      expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    });

    it.each([UserRole.MARKETING, UserRole.INVESTISSEUR])(
      'rôle %s : tableau REFUSÉ, aucune lecture du grand livre',
      async (role) => {
        const user = connecte(role);

        await expect(
          controller.listerEtatsFinanciers(user, {} as any),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(projectLedger.etatFinancierParProjets).not.toHaveBeenCalled();
      },
    );

    it('borne la taille de page à 100, même si le client en demande davantage', async () => {
      const user = connecte(UserRole.SUPER_ADMIN);

      const page = await controller.listerEtatsFinanciers(user, {
        limit: 10000,
      } as any);

      expect(page.limit).toBe(100);
    });
  });

  describe('GET :id/etat-financier', () => {
    it('rôle financier : lecture autorisée', async () => {
      const user = connecte(UserRole.FINANCIER);

      const etat = await controller.etatFinancier(PROJET_A, user);

      expect(etat.projetId).toBe(PROJET_A);
      expect(projectLedger.etatFinancier).toHaveBeenCalledWith(PROJET_A);
    });

    it.each([
      UserRole.MARKETING,
      UserRole.SUPPORT,
      UserRole.INVESTISSEUR,
      UserRole.PORTEUR,
      UserRole.CGP,
      UserRole.DPO,
    ])('rôle %s : accès REFUSÉ, le grand livre n’est jamais lu', async (role) => {
      const user = connecte(role);

      await expect(
        controller.etatFinancier(PROJET_A, user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    });

    it('ANTI-IDOR : un rôle non habilité ne lit aucun projet, quel que soit l’identifiant', async () => {
      const user = connecte(UserRole.INVESTISSEUR, 999);

      for (const projetId of [PROJET_A, PROJET_B]) {
        await expect(
          controller.etatFinancier(projetId, user),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    });

    it('ANTI-IDOR : un utilisateur absent de la base est refusé (token orphelin)', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.etatFinancier(PROJET_A, { userId: 4242 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    });

    it('DÉFENSE EN PROFONDEUR : le rôle du JWT est ignoré au profit de celui en base', async () => {
      // JWT prétendant être financier, base disant marketing → refus.
      userRepo.findOne.mockResolvedValue({ userId: 1, role: UserRole.MARKETING });

      await expect(
        controller.etatFinancier(PROJET_A, {
          userId: 1,
          role: UserRole.FINANCIER,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    });
  });

  describe('POST :id/versement-porteur', () => {
    const dto = {
      referenceBancaire: 'VIR-2026-08-0042',
      dateVersement: '2026-08-29',
      montant: 20000,
    } as any;

    it('rôle financier : constate le versement et le trace au journal d’audit', async () => {
      const user = connecte(UserRole.FINANCIER, 7);

      const reponse = await controller.declarerVersement(
        PROJET_A,
        dto,
        user,
        requete(),
      );

      expect(projectLedger.declarerVersementPorteur).toHaveBeenCalledWith(
        expect.objectContaining({
          projetId: PROJET_A,
          referenceBancaire: 'VIR-2026-08-0042',
          montant: 20000,
          declareParUserId: 7,
        }),
      );

      // Le message est sans ambiguïté sur la nature déclarative de l'action.
      expect(reponse.message).toContain('Aucun virement');

      // Trace métier explicite, avec la référence bancaire et le montant.
      expect(auditLog.create).toHaveBeenCalledWith(
        '7',
        UserRole.FINANCIER,
        'versement-porteur:constate',
        'projets',
        PROJET_A,
        '127.0.0.1',
        undefined,
        expect.objectContaining({
          referenceBancaire: 'VIR-2026-08-0042',
          montant: 20000,
        }),
      );
    });

    it.each([UserRole.MARKETING, UserRole.INVESTISSEUR, UserRole.PORTEUR])(
      'rôle %s : REFUSÉ, aucun mouvement ni trace',
      async (role) => {
        const user = connecte(role);

        await expect(
          controller.declarerVersement(PROJET_A, dto, user, requete()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(projectLedger.declarerVersementPorteur).not.toHaveBeenCalled();
        expect(auditLog.create).not.toHaveBeenCalled();
      },
    );

    it('un échec du journal d’audit n’annule pas un fait bancaire déjà constaté', async () => {
      const user = connecte(UserRole.SUPER_ADMIN, 1);
      auditLog.create.mockRejectedValue(new Error('audit indisponible'));

      const reponse = await controller.declarerVersement(
        PROJET_A,
        dto,
        user,
        requete(),
      );

      expect(reponse.transactionId).toBe('tx-1');
    });
  });
});
