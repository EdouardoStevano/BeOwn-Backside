import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminExportsController } from './admin-exports.controller';
import { BOM_UTF8, csvEscape, ligneCsv } from './csv-stream.util';
import { UserRole } from 'src/iam/domains/enums/user.enum';

describe('csv-stream.util — échappement RFC 4180', () => {
  it('double les guillemets et encadre la valeur', () => {
    expect(csvEscape('Société "Horizon"')).toBe('"Société ""Horizon"""');
  });

  it('encadre toute valeur portant un séparateur ou un saut de ligne', () => {
    expect(csvEscape('Dupont, Jean')).toBe('"Dupont, Jean"');
    expect(csvEscape('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });

  it('rend une cellule VIDE pour null/undefined — jamais la chaîne « null »', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('sérialise les dates en ISO 8601', () => {
    expect(csvEscape(new Date('2026-09-01T10:00:00Z'))).toBe('2026-09-01T10:00:00.000Z');
  });

  it('termine chaque ligne par CRLF', () => {
    expect(ligneCsv(['a', 'b'])).toBe('a,b\r\n');
  });
});

/** Query builder simulé : chaque getRawMany rend la page suivante de la file. */
function fakeQueryBuilder(pages: any[][]) {
  const appels: { where: any[]; limit: number | null } = { where: [], limit: null };
  const qb: any = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn((clause: string, params?: any) => {
      appels.where.push([clause, params]);
      return qb;
    }),
    andWhere: jest.fn((clause: string, params?: any) => {
      appels.where.push([clause, params]);
      return qb;
    }),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn((n: number) => {
      appels.limit = n;
      return qb;
    }),
    getRawMany: jest.fn(async () => pages.shift() ?? []),
  };
  return { qb, appels };
}

/** Réponse HTTP simulée : accumule ce qui part réellement sur la socket. */
function fakeResponse() {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  return {
    res: {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
    } as any,
    chunks,
    headers,
    corps: () => chunks.join(''),
  };
}

function build(options: {
  role?: UserRole | null;
  txPages?: any[][];
  investPages?: any[][];
  userPages?: any[][];
  kycs?: any[];
  totaux?: any[];
} = {}) {
  const userQb = fakeQueryBuilder(options.userPages ?? []);
  const txQb = fakeQueryBuilder(options.txPages ?? []);
  const investQb = fakeQueryBuilder(options.investPages ?? []);
  const sommeQb = fakeQueryBuilder([options.totaux ?? []]);

  const userRepo: any = {
    findOne: jest.fn().mockResolvedValue(
      options.role === null ? null : { userId: 1, role: options.role ?? UserRole.SUPER_ADMIN },
    ),
    createQueryBuilder: jest.fn(() => userQb.qb),
  };
  const kycRepo: any = { find: jest.fn().mockResolvedValue(options.kycs ?? []) };
  // L'export des investissements et la somme par investisseur partagent le
  // même repository : la première construction sert l'export, les suivantes la
  // somme paginée.
  let investCalls = 0;
  const investmentRepo: any = {
    createQueryBuilder: jest.fn(() => {
      investCalls += 1;
      return options.investPages ? investQb.qb : sommeQb.qb;
    }),
  };
  const txRepo: any = { createQueryBuilder: jest.fn(() => txQb.qb) };
  const auditLog: any = { create: jest.fn().mockResolvedValue({}) };

  return {
    controller: new AdminExportsController(
      userRepo,
      kycRepo,
      investmentRepo,
      txRepo,
      auditLog,
    ),
    userRepo,
    kycRepo,
    txQb,
    investQb,
    sommeQb,
    userQb,
    auditLog,
    investCallsCount: () => investCalls,
  };
}

const ADMIN = { userId: 1, role: UserRole.SUPER_ADMIN } as any;

describe('AdminExportsController — garde d’accès', () => {
  it('refuse un rôle sans data:export relu EN BASE, avant le moindre octet', async () => {
    const h = build({ role: UserRole.INVESTISSEUR });
    const { res, chunks } = fakeResponse();

    await expect(h.controller.transactions(ADMIN, res)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(chunks).toHaveLength(0);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('AdminExportsController — transactions.csv', () => {
  it('borne de date illisible : 400 franche, aucun entête CSV déjà parti', async () => {
    const h = build();
    const { res } = fakeResponse();

    await expect(
      h.controller.transactions(ADMIN, res, 'pas-une-date'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('streame BOM + entête + lignes, paginé au curseur — jamais de findAll en mémoire', async () => {
    const pleinePage = Array.from({ length: 500 }, (_, i) => ({
      id: `tx-${String(i).padStart(4, '0')}`,
      date: new Date('2026-09-01T00:00:00Z'),
      type: 'depot',
      statut: 'reussi',
      montant: '100.00',
      devise: 'EUR',
      walletSourceType: null,
      walletDestType: 'investisseur',
      userIdProprietaire: 7,
      referenceStripe: 'pi_1',
    }));
    const dernierePage = [
      {
        id: 'tx-9999',
        date: new Date('2026-09-01T00:00:00Z'),
        type: 'retrait',
        statut: 'en_cours',
        montant: '50.00',
        devise: 'EUR',
        walletSourceType: 'investisseur',
        walletDestType: null,
        userIdProprietaire: 8,
        referenceStripe: null,
      },
    ];
    const h = build({ txPages: [pleinePage, dernierePage] });
    const { res, corps, headers } = fakeResponse();

    await h.controller.transactions(ADMIN, res, '2026-01-01', '2026-12-31');

    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(corps().startsWith(BOM_UTF8)).toBe(true);
    expect(corps()).toContain(
      'id,date,type,statut,montant,devise,walletSourceType,walletDestType,userIdProprietaire,referenceStripe',
    );
    // 501 lignes de données : la page pleine a déclenché la lecture suivante,
    // au CURSEUR du dernier id vu.
    expect(corps().match(/\r\n/g)!.length).toBe(1 + 500 + 1);
    const curseurWhere = h.txQb.appels.where.find(
      ([clause]: any[]) => typeof clause === 'string' && clause.includes('t.id > :curseur'),
    );
    expect(curseurWhere[1]).toEqual({ curseur: 'tx-0499' });
    // La cellule absente est VIDE (referenceStripe null en fin de ligne).
    expect(corps()).toContain('tx-9999');
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});

describe('AdminExportsController — investissements.csv', () => {
  it('projetId non-UUID : 400 franche', async () => {
    const h = build({ investPages: [] });
    const { res } = fakeResponse();

    await expect(
      h.controller.investissements(ADMIN, res, 'DROP TABLE'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('AdminExportsController — investisseurs.csv', () => {
  it('agrège KYC et total investi EN LOT, avec repli non_demarre / 0.00', async () => {
    const h = build({
      userPages: [
        [
          {
            userId: 7,
            email: 'jean@example.com',
            nom: 'Dupont, dit "Jean"',
            prenom: 'Jean',
            dateInscription: new Date('2026-01-15T00:00:00Z'),
          },
          {
            userId: 8,
            email: null,
            nom: null,
            prenom: null,
            dateInscription: new Date('2026-02-01T00:00:00Z'),
          },
        ],
      ],
      kycs: [{ utilisateurId: 7, statut: 'valide' }],
      totaux: [{ utilisateurId: 7, total: '1500.5' }],
    });
    const { res, corps } = fakeResponse();

    await h.controller.investisseurs(ADMIN, res);

    expect(corps().startsWith(BOM_UTF8)).toBe(true);
    expect(corps()).toContain(
      'userId,email,nom,prenom,kycStatut,dateInscription,totalInvesti',
    );
    // Échappement : le nom porte virgule ET guillemets.
    expect(corps()).toContain('"Dupont, dit ""Jean"""');
    expect(corps()).toContain('1500.50');
    // Sans KYC ni investissement : replis explicites, cellules jamais « null ».
    expect(corps()).toContain('8,,,,non_demarre,2026-02-01T00:00:00.000Z,0.00');
    // Deux résolutions EN LOT pour la page — pas une par investisseur.
    expect(h.kycRepo.find).toHaveBeenCalledTimes(1);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  // ─── Cloisonnement du fichier nominatif ──────────────────────────────────

  it.each([UserRole.MARKETING, UserRole.DPO])(
    'REFUSE %s : data:export ne donne plus le fichier nominatif',
    async (role) => {
      const h = build({ role });
      const { res, chunks } = fakeResponse();

      await expect(h.controller.investisseurs(ADMIN, res)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Refus AVANT le moindre octet : pas de CSV partiel déjà parti.
      expect(chunks).toHaveLength(0);
      expect(res.setHeader).not.toHaveBeenCalled();
    },
  );

  it('autorise compliance (profiles:read_sensitive)', async () => {
    const h = build({ role: UserRole.COMPLIANCE, userPages: [[]] });
    const { res } = fakeResponse();

    await expect(h.controller.investisseurs(ADMIN, res)).resolves.toBeUndefined();
  });

  it('borne dure : limit hors plage → 400 franche, aucun octet parti', async () => {
    const h = build({ userPages: [[]] });
    const { res, chunks } = fakeResponse();

    await expect(
      h.controller.investisseurs(ADMIN, res, '999999'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chunks).toHaveLength(0);
  });

  it('limit non entier → 400', async () => {
    const h = build({ userPages: [[]] });
    const { res } = fakeResponse();

    await expect(
      h.controller.investisseurs(ADMIN, res, 'beaucoup'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la limite demandée est appliquée EN SQL, pas après coup', async () => {
    const h = build({ userPages: [[]] });
    const { res } = fakeResponse();

    await h.controller.investisseurs(ADMIN, res, '3');

    expect(h.userQb.appels.limit).toBe(3);
  });

  it('le curseur de reprise `after` est passé à la requête', async () => {
    const h = build({ userPages: [[]] });
    const { res } = fakeResponse();

    await h.controller.investisseurs(ADMIN, res, undefined, '42');

    const curseurWhere = h.userQb.appels.where.find(
      ([clause]: any[]) =>
        typeof clause === 'string' && clause.includes('u.userId > :curseur'),
    );
    expect(curseurWhere[1]).toEqual({ curseur: 42 });
  });

  it("laisse une entrée d'audit métier : qui, quoi, combien de lignes", async () => {
    const h = build({
      role: UserRole.COMPLIANCE,
      userPages: [
        [
          {
            userId: 7,
            email: 'jean@example.com',
            nom: 'Dupont',
            prenom: 'Jean',
            dateInscription: new Date('2026-01-15T00:00:00Z'),
          },
        ],
      ],
      kycs: [],
      totaux: [],
    });
    const { res } = fakeResponse();

    await h.controller.investisseurs(ADMIN, res);

    expect(h.auditLog.create).toHaveBeenCalledWith(
      '1',
      UserRole.COMPLIANCE,
      'export.investisseurs',
      'export',
      'investisseurs.csv',
      undefined,
      undefined,
      expect.objectContaining({ lignes: 1, depart: 0, tronque: false }),
    );
  });
});
