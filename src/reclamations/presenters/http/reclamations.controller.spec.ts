import { ForbiddenException } from '@nestjs/common';
import { ReclamationsController } from './reclamations.controller';
import { ReclamationsService } from 'src/reclamations/applications/reclamations.service';
import { StatutReclamation } from 'src/reclamations/domains/reclamation';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Le contrôleur et le service RÉELS, seul le dépôt est simulé.
 *
 * Le défaut ne se voyait qu'à leur jonction : le presenter calculait
 * `estBackOffice = user.role !== 'investisseur'` et le service, à qui l'on
 * passait ce booléen, se contentait de l'appliquer. Chacun pris isolément
 * paraissait correct. C'est donc la paire qu'il faut éprouver — un test qui
 * espionnerait la délégation ne dirait rien du droit d'accès.
 */
describe('ReclamationsController — accès à une réclamation', () => {
  const DEMANDEUR_ID = 10;

  const construire = () => {
    const repo = {
      findOne: jest.fn(async () => ({
        id: 'rec-1',
        reference: 'REC-2026-0001',
        utilisateurId: DEMANDEUR_ID,
        statut: StatutReclamation.ACCUSE_RECEPTION,
        accuseReceptionLe: new Date('2026-06-01T10:00:00.000Z'),
        echeanceReponse: new Date('2026-08-01T10:00:00.000Z'),
        reponduLe: null,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      })),
      find: jest.fn(async () => []),
      save: jest.fn(async (r: unknown) => r),
      create: jest.fn((r: unknown) => r),
      count: jest.fn(async () => 0),
    };
    const service = new ReclamationsService(repo as any);
    return { controller: new ReclamationsController(service), repo };
  };

  const appeler = (role: string | undefined, userId: number) =>
    construire().controller.consulter('rec-1', {
      userId,
      email: 'x@example.test',
      role,
    });

  it('le demandeur accède à sa réclamation', async () => {
    await expect(
      appeler(UserRole.INVESTISSEUR, DEMANDEUR_ID),
    ).resolves.toMatchObject({ id: 'rec-1' });
  });

  it.each([UserRole.PORTEUR, UserRole.CGP, UserRole.MARKETING])(
    'RÉGRESSION : un compte %s ne lit plus la réclamation d’un tiers',
    async (role) => {
      // Exactement les rôles que l'ancien test « ≠ investisseur » réputait
      // back-office alors qu'aucun ne détient `reclamations:manage`.
      await expect(appeler(role, 999)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it.each([UserRole.SUPPORT, UserRole.COMPLIANCE])(
    'un compte %s, habilité à traiter, y accède',
    async (role) => {
      await expect(appeler(role, 999)).resolves.toMatchObject({ id: 'rec-1' });
    },
  );

  it('un autre investisseur reste refusé', async () => {
    await expect(
      appeler(UserRole.INVESTISSEUR, 999),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('la file de back-office est refusée à un rôle non habilité', async () => {
    const { controller } = construire();

    await expect(
      controller.fileDeTraitement({
        userId: 999,
        email: 'x@example.test',
        role: UserRole.PORTEUR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
