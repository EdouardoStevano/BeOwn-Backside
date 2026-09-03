import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PorteurTresorerieController } from './porteur-tresorerie.controller';
import { GetPorteurTresorerieUseCase } from '../../applications/usecases/get-porteur-tresorerie.usecase';
import {
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { UserRole } from 'src/iam/domains/enums/user.enum';

const PORTEUR = { userId: 7, email: 'porteur@beown.fr', role: UserRole.PORTEUR } as any;
const PROJET_ID = 'c1f0b6e2-3f1a-4a8e-9d3c-2b6f0a1d4e77';
const WALLET_ID = 'a7d2e9c4-0b5f-4c1e-8a2d-6f3b9e0c1a55';

/**
 * Générateur de query builder factice : chaînable, et rendant les résultats
 * configurés. Le cas d'usage construit ses quatre requêtes dans un ordre
 * DÉTERMINISTE (liste versements, total versé, liste apports, total apports) —
 * c'est ce qui permet de les brancher par `mockReturnValueOnce`.
 */
function fakeQb(result: { many?: any[]; raw?: { total: string } }) {
  const qb: any = {
    getMany: jest.fn().mockResolvedValue(result.many ?? []),
    getRawOne: jest.fn().mockResolvedValue(result.raw ?? { total: '0' }),
  };
  for (const m of ['where', 'andWhere', 'select', 'orderBy', 'take', 'skip']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  return qb;
}

interface BuildOptions {
  projet?: any;
  wallet?: any;
  versements?: any[];
  totalVerse?: string;
  apports?: any[];
  totalApports?: string;
}

/**
 * Contrôleur monté à la main sur un cas d'usage RÉEL et des dépôts factices —
 * la tranche entière (garde d'appartenance comprise) se vérifie sans base ni
 * réseau, conformément à la règle du domaine testable à sec.
 */
function build(options: BuildOptions = {}) {
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue(
      'projet' in options
        ? options.projet
        : { id: PROJET_ID, titre: 'Résidence Les Tilleuls', porteurId: PORTEUR.userId },
    ),
  };
  const walletRepo = {
    findOne: jest.fn().mockResolvedValue(
      'wallet' in options
        ? options.wallet
        : {
            id: WALLET_ID,
            type: WalletType.TECHNIQUE_PROJET,
            projetId: PROJET_ID,
            solde: '12500.50',
            soldeBloque: '300.00',
            devise: 'EUR',
          },
    ),
  };
  const qbs = {
    versements: fakeQb({ many: options.versements ?? [] }),
    totalVerse: fakeQb({ raw: { total: options.totalVerse ?? '0' } }),
    apports: fakeQb({ many: options.apports ?? [] }),
    totalApports: fakeQb({ raw: { total: options.totalApports ?? '0' } }),
  };
  const txRepo = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(qbs.versements)
      .mockReturnValueOnce(qbs.totalVerse)
      .mockReturnValueOnce(qbs.apports)
      .mockReturnValueOnce(qbs.totalApports),
  };

  const usecase = new GetPorteurTresorerieUseCase(
    projectRepo as any,
    walletRepo as any,
    txRepo as any,
  );
  const controller = new PorteurTresorerieController(usecase);

  return { controller, projectRepo, walletRepo, txRepo, qbs };
}

describe('PorteurTresorerieController — appartenance (anti-IDOR)', () => {
  it("refuse en 403 le projet d'un AUTRE porteur, sans toucher au grand livre", async () => {
    const { controller, walletRepo, txRepo } = build({
      projet: { id: PROJET_ID, titre: 'Projet tiers', porteurId: 999 },
    });

    await expect(
      controller.tresorerie(PROJET_ID, {}, PORTEUR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(walletRepo.findOne).not.toHaveBeenCalled();
    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rend 404 sur un projet introuvable', async () => {
    const { controller } = build({ projet: null });

    await expect(
      controller.tresorerie(PROJET_ID, {}, PORTEUR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PorteurTresorerieController — projet sans mouvement', () => {
  it('rend wallet:null et des listes vides, jamais une erreur', async () => {
    const { controller, txRepo } = build({ wallet: null });

    const res = await controller.tresorerie(PROJET_ID, {}, PORTEUR);

    expect(res).toEqual({
      projetId: PROJET_ID,
      titreProjet: 'Résidence Les Tilleuls',
      wallet: null,
      versements: [],
      apports: [],
      totalVerse: 0,
      totalApports: 0,
    });
    // Aucune requête de transactions : il n'y a rien à lire.
    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('PorteurTresorerieController — mapping des mouvements', () => {
  const versementStripe = {
    id: 'tx-stripe',
    montant: '5000.00',
    devise: 'EUR',
    type: TransactionType.RETRAIT,
    statut: TransactionStatus.EN_COURS,
    referenceExterne: null,
    fournisseurRef: 'tr_123',
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    metadata: { kind: 'versement_porteur', method: 'stripe_connect' },
  };
  const versementManuel = {
    id: 'tx-manuel',
    montant: '2000.00',
    devise: 'EUR',
    type: TransactionType.RETRAIT,
    statut: TransactionStatus.REUSSI,
    referenceExterne: 'VIR-2026-001',
    fournisseurRef: null,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    metadata: {
      kind: 'versement_porteur',
      dateVersement: '2026-07-28T00:00:00.000Z',
    },
  };
  const apport = {
    id: 'tx-apport',
    montant: '1500.00',
    type: TransactionType.APPORT_PORTEUR,
    statut: TransactionStatus.REUSSI,
    createdAt: new Date('2026-08-15T14:30:00.000Z'),
    metadata: { paymentIntentId: 'pi_9' },
  };

  it('mappe solde, versements (deux canaux), apports et totaux', async () => {
    const { controller } = build({
      versements: [versementStripe, versementManuel],
      totalVerse: '2000.00',
      apports: [apport],
      totalApports: '1500.00',
    });

    const res = await controller.tresorerie(PROJET_ID, {}, PORTEUR);

    expect(res.wallet).toEqual({ solde: 12500.5, soldeBloque: 300, devise: 'EUR' });
    expect(res.versements).toEqual([
      {
        id: 'tx-stripe',
        date: '2026-08-30T10:00:00.000Z',
        montant: 5000,
        devise: 'EUR',
        statut: TransactionStatus.EN_COURS,
        // Canal Stripe : la référence est l'identifiant du transfert.
        reference: 'tr_123',
      },
      {
        id: 'tx-manuel',
        // Constat manuel : la date RÉELLE du virement fait foi, pas l'écriture.
        date: '2026-07-28T00:00:00.000Z',
        montant: 2000,
        devise: 'EUR',
        statut: TransactionStatus.REUSSI,
        reference: 'VIR-2026-001',
      },
    ]);
    expect(res.apports).toEqual([
      {
        id: 'tx-apport',
        date: '2026-08-15T14:30:00.000Z',
        montant: 1500,
        statut: TransactionStatus.REUSSI,
      },
    ]);
    // Totaux calculés en SQL sur les seuls REUSSI : l'EN_COURS n'y figure pas.
    expect(res.totalVerse).toBe(2000);
    expect(res.totalApports).toBe(1500);
  });

  it('filtre les versements par type + metadata.kind posés par les écritures', async () => {
    const { controller, qbs } = build();

    await controller.tresorerie(PROJET_ID, {}, PORTEUR);

    expect(qbs.versements.where).toHaveBeenCalledWith(
      't.walletSource = :walletId',
      { walletId: WALLET_ID },
    );
    expect(qbs.versements.andWhere).toHaveBeenCalledWith('t.type = :type', {
      type: TransactionType.RETRAIT,
    });
    expect(qbs.versements.andWhere).toHaveBeenCalledWith(
      `t.metadata ->> 'kind' = :kind`,
      { kind: 'versement_porteur' },
    );
    expect(qbs.apports.andWhere).toHaveBeenCalledWith('t.type = :type', {
      type: TransactionType.APPORT_PORTEUR,
    });
  });
});

describe('PorteurTresorerieController — pagination', () => {
  it('applique limit 50 / offset 0 par défaut', async () => {
    const { controller, qbs } = build();

    await controller.tresorerie(PROJET_ID, {}, PORTEUR);

    expect(qbs.versements.take).toHaveBeenCalledWith(50);
    expect(qbs.versements.skip).toHaveBeenCalledWith(0);
    expect(qbs.apports.take).toHaveBeenCalledWith(50);
    expect(qbs.apports.skip).toHaveBeenCalledWith(0);
  });

  it('propage limit/offset de la requête aux deux listes, pas aux totaux', async () => {
    const { controller, qbs } = build();

    await controller.tresorerie(PROJET_ID, { limit: 10, offset: 20 }, PORTEUR);

    expect(qbs.versements.take).toHaveBeenCalledWith(10);
    expect(qbs.versements.skip).toHaveBeenCalledWith(20);
    expect(qbs.apports.take).toHaveBeenCalledWith(10);
    expect(qbs.apports.skip).toHaveBeenCalledWith(20);
    // Les totaux portent sur TOUT l'historique : jamais paginés.
    expect(qbs.totalVerse.take).not.toHaveBeenCalled();
    expect(qbs.totalApports.take).not.toHaveBeenCalled();
  });
});
