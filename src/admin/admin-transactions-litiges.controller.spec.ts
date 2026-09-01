import { ForbiddenException } from '@nestjs/common';
import { AdminTransactionsLitigesController } from './admin-transactions-litiges.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';

function build(options: { role?: UserRole | null; rows?: any[] } = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(options.rows ?? []),
  };
  const userRepo: any = {
    findOne: jest.fn().mockResolvedValue(
      options.role === null
        ? null
        : { userId: 1, role: options.role ?? UserRole.SUPER_ADMIN },
    ),
  };
  const txRepo: any = { createQueryBuilder: jest.fn(() => qb) };
  return {
    controller: new AdminTransactionsLitigesController(userRepo, txRepo),
    qb,
    txRepo,
  };
}

const ADMIN = { userId: 1, role: UserRole.SUPER_ADMIN } as any;

describe('AdminTransactionsLitigesController', () => {
  it('refuse un rôle sans retraits:manage relu EN BASE', async () => {
    const h = build({ role: UserRole.MARKETING });

    await expect(h.controller.litiges(ADMIN)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rend les transactions marquées par la branche dispute du webhook, litige aplati et typé', async () => {
    const h = build({
      rows: [
        {
          id: 'tx-1',
          createdAt: new Date('2026-08-30T10:00:00Z'),
          type: 'depot',
          statut: 'reussi',
          montant: '250.00',
          devise: 'EUR',
          fournisseurRef: 'pi_123',
          metadata: {
            paymentIntentId: 'pi_123',
            litige: {
              disputeId: 'dp_1',
              chargeId: 'ch_1',
              motif: 'fraudulent',
              statut: 'needs_response',
              montant: 250,
              ouvertLe: '2026-08-31T08:00:00.000Z',
            },
          },
        },
      ],
    });

    const resultat = await h.controller.litiges(ADMIN);

    // Filtre : la clé JSONB posée par charge.dispute.created, et elle seule.
    expect(h.qb.where).toHaveBeenCalledWith("tx.metadata -> 'litige' IS NOT NULL");
    expect(resultat).toEqual({
      items: [
        {
          id: 'tx-1',
          date: new Date('2026-08-30T10:00:00Z'),
          type: 'depot',
          statut: 'reussi',
          montant: 250,
          devise: 'EUR',
          referenceStripe: 'pi_123',
          litige: {
            disputeId: 'dp_1',
            chargeId: 'ch_1',
            motif: 'fraudulent',
            statut: 'needs_response',
            montant: 250,
            ouvertLe: '2026-08-31T08:00:00.000Z',
          },
        },
      ],
    });
  });

  it('aucun litige : { items: [] }, jamais null', async () => {
    const h = build({ rows: [] });
    await expect(h.controller.litiges(ADMIN)).resolves.toEqual({ items: [] });
  });
});
