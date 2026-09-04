import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { RiskScoringService } from 'src/profiles/applications/risk-scoring.service';
import { AdminInvestorsController } from './admin-investors.controller';

/**
 * GET /admin/investors/due-contacts renvoyait `ProfilPPEntity[]` — l'entité de
 * profil ENTIÈRE — à tout rôle détenant `users:read` : support, marketing,
 * chargé de relation investisseur, dpo. NIF, patrimoine net déclaré, adresse
 * postale, date et lieu de naissance, nationalité, résidence fiscale,
 * téléphone, profession et statut PEP partaient avec.
 *
 * Le correctif projette DANS LA REQUÊTE SQL : les colonnes sensibles ne sont
 * même plus lues.
 */
describe('due-contacts — minimisation de la liste de suivi', () => {
  describe('RiskScoringService.listDueContacts', () => {
    const makeService = (lignes: any[]) => {
      const colonnesSelectionnees: string[] = [];
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn((_col: string, alias: string) => {
          colonnesSelectionnees.push(alias);
          return qb;
        }),
        addSelect: jest.fn((_col: string, alias: string) => {
          colonnesSelectionnees.push(alias);
          return qb;
        }),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(lignes),
      };
      const profilPPRepo: any = { createQueryBuilder: jest.fn(() => qb) };
      return {
        service: new RiskScoringService(profilPPRepo, {} as any),
        qb,
        colonnesSelectionnees,
      };
    };

    it('ne sélectionne QUE identité, e-mail et date du dernier contact', async () => {
      const { service, colonnesSelectionnees } = makeService([]);

      await service.listDueContacts();

      expect(colonnesSelectionnees.sort()).toEqual(
        ['dernierContactAdmin', 'email', 'nom', 'prenom', 'utilisateurId'].sort(),
      );
    });

    it('plafonne la liste (borne dure)', async () => {
      const { service, qb } = makeService([]);

      await service.listDueContacts();

      expect(qb.limit).toHaveBeenCalledWith(500);
    });

    it('normalise la ligne brute en read model', async () => {
      const { service } = makeService([
        {
          utilisateurId: '7',
          nom: 'Dupont',
          prenom: 'Jean',
          email: 'jean@example.com',
          dernierContactAdmin: null,
        },
      ]);

      await expect(service.listDueContacts()).resolves.toEqual([
        {
          utilisateurId: 7,
          nom: 'Dupont',
          prenom: 'Jean',
          email: 'jean@example.com',
          dernierContactAdmin: null,
        },
      ]);
    });
  });

  describe('AdminInvestorsController.dueContacts', () => {
    const makeController = (role: UserRole) => {
      const userRepo: any = {
        findOne: jest.fn().mockResolvedValue({ userId: 1, role }),
      };
      const riskScoring = {
        listDueContacts: jest.fn().mockResolvedValue([
          {
            utilisateurId: 7,
            nom: 'Dupont',
            prenom: 'Jean',
            email: 'jean@example.com',
            dernierContactAdmin: null,
          },
        ]),
      };
      return {
        controller: new AdminInvestorsController(
          userRepo,
          riskScoring as any,
          {} as any,
          {} as any,
        ),
        riskScoring,
      };
    };

    it('ne sert que le read model, aucun champ de profil', async () => {
      const { controller } = makeController(UserRole.SUPPORT);

      const res = await controller.dueContacts({ userId: 1 } as any);

      expect(Object.keys(res[0]).sort()).toEqual(
        ['dernierContactAdmin', 'email', 'nom', 'prenom', 'utilisateurId'].sort(),
      );
    });

    it('refuse un rôle sans users:read, relu en base', async () => {
      const { controller, riskScoring } = makeController(UserRole.INVESTISSEUR);

      await expect(
        controller.dueContacts({ userId: 1 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(riskScoring.listDueContacts).not.toHaveBeenCalled();
    });
  });
});
