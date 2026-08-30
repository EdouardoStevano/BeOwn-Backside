import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  KIND_VERSEMENT_PORTEUR,
  ProjectLedgerService,
} from './project-ledger.service';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { DEFAULT_FEE_RATES } from 'src/common/platform-fees/platform-fees.service';
import {
  TransactionFournisseur,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

/**
 * Le versement au porteur est PUREMENT DÉCLARATIF : il enregistre un virement
 * déjà effectué hors plateforme. Aucun prestataire de paiement n'est appelé —
 * c'est la contrainte cardinale du lot, et elle est ici prouvée par l'absence
 * totale de collaborateur externe injecté dans le service.
 */
describe('ProjectLedgerService — versement porteur déclaratif', () => {
  const PROJET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let projectRow: any;
  let walletProjet: any;
  let transactions: any[];
  /** Engagements (table investissement) — indépendants de tout wallet. */
  let engagements: any[];
  /** Wallets techniques existants, tels que les rendrait la requête groupée. */
  let walletsTechniques: any[];
  let manager: any;
  let dataSource: any;
  let platformFees: any;
  let projectWalletResolver: any;
  let service: ProjectLedgerService;

  /** Somme des transactions correspondant au filtre, comme le ferait SQL. */
  const sommeSimulee = (params: Record<string, unknown>): number =>
    transactions
      .filter((t) => {
        // Les mouvements intra-wallet ne comptent pas (cf. sommeTx).
        if (
          t.walletSource &&
          t.walletDestination &&
          t.walletSource === t.walletDestination
        ) {
          return false;
        }
        if (params.src && t.walletSource !== params.src) return false;
        if (params.dst && t.walletDestination !== params.dst) return false;
        if (params.type && t.type !== params.type) return false;
        return true;
      })
      .reduce((total, t) => total + Number(t.montant), 0);

  /** Somme des engagements en délai de rétractation, comme le ferait SQL. */
  const sommeEngagementsSimulee = (params: Record<string, any>): number =>
    engagements
      .filter((e) => {
        if (params.statut && e.statut !== params.statut) return false;
        if (params.projetId && e.projetId !== params.projetId) return false;
        if (params.ids && !params.ids.includes(e.projetId)) return false;
        return true;
      })
      .reduce((total, e) => total + Number(e.montant), 0);

  const buildQB = () => {
    const qb: any = {
      _params: {} as Record<string, unknown>,
      _cible: 'transactions',
      /** Route la requête sur sa table d'après l'alias employé dans les clauses. */
      _router(clause?: string) {
        if (typeof clause !== 'string') return;
        if (clause.includes('i.')) qb._cible = 'investissements';
        else if (clause.includes('w.type')) qb._cible = 'wallets';
      },
      select: () => qb,
      addSelect: () => qb,
      groupBy: () => qb,
      setParameters(params?: Record<string, unknown>) {
        Object.assign(qb._params, params ?? {});
        return qb;
      },
      innerJoin: () => qb,
      where(clause: string, params?: Record<string, unknown>) {
        qb._router(clause);
        Object.assign(qb._params, params ?? {});
        return qb;
      },
      andWhere(clause: string, params?: Record<string, unknown>) {
        qb._router(clause);
        Object.assign(qb._params, params ?? {});
        return qb;
      },
      async getRawOne() {
        if (qb._cible === 'investissements') {
          return { total: String(sommeEngagementsSimulee(qb._params)) };
        }
        return { total: String(sommeSimulee(qb._params)) };
      },
      async getRawMany() {
        if (qb._cible !== 'investissements') {
          // Agrégats du grand livre groupés par wallet (lecture de page).
          const params = qb._params as Record<string, any>;
          return (params.walletIds ?? []).map((id: string) => ({
            walletId: id,
            credite: String(sommeSimulee({ dst: id })),
            totalDebits: String(sommeSimulee({ src: id })),
            rembourse: String(sommeSimulee({ src: id, type: params.remb })),
            frais: String(sommeSimulee({ src: id, type: params.frais })),
            verse: String(sommeSimulee({ src: id, type: params.retrait })),
          }));
        }
        const parProjet = new Map<string, number>();
        for (const e of engagements) {
          const params = qb._params as Record<string, any>;
          if (params.statut && e.statut !== params.statut) continue;
          if (params.ids && !params.ids.includes(e.projetId)) continue;
          parProjet.set(
            e.projetId,
            (parProjet.get(e.projetId) ?? 0) + Number(e.montant),
          );
        }
        return [...parProjet].map(([projetId, total]) => ({
          projetId,
          total: String(total),
        }));
      },
      async getMany() {
        return qb._cible === 'wallets' ? walletsTechniques : [];
      },
    };
    return qb;
  };

  beforeEach(() => {
    projectRow = { id: PROJET_ID, titre: 'Résidence Test' };
    walletProjet = { id: 'wp1', projetId: PROJET_ID, solde: 50000, soldeBloque: 0, devise: 'EUR' };
    engagements = [];
    walletsTechniques = [walletProjet];
    transactions = [
      // Collecte déjà créditée au wallet projet.
      { walletSource: 'w1', walletDestination: 'wp1', montant: 50000, type: TransactionType.SOUSCRIPTION },
    ];

    manager = {
      findOne: jest.fn(async (entity: any, options: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === TransactionEntity) {
          return (
            transactions.find(
              (t) => t.idempotencyKey === options?.where?.idempotencyKey,
            ) ?? null
          );
        }
        if (entity === WalletEntity) return walletProjet;
        return null;
      }),
      createQueryBuilder: jest.fn(() => buildQB()),
      create: jest.fn((_entity: any, obj: any) => obj),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === TransactionEntity) {
          const cree = { ...obj, id: 'tx-1' };
          transactions.push(cree);
          return cree;
        }
        return obj;
      }),
    };

    dataSource = {
      manager,
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    platformFees = { getRates: jest.fn().mockResolvedValue(DEFAULT_FEE_RATES) };
    projectWalletResolver = {
      executeInTransaction: jest.fn(async () => walletProjet),
      findInTransaction: jest.fn(async () => walletProjet),
    };

    service = new ProjectLedgerService(
      dataSource,
      projectWalletResolver,
      platformFees,
    );
  });

  describe('etatFinancier', () => {
    it('expose collecté, frais retenus, net à verser, déjà versé et restant dû', async () => {
      const etat = await service.etatFinancier(PROJET_ID);

      expect(etat).toMatchObject({
        projetId: PROJET_ID,
        devise: 'EUR',
        collecte: 50000,
        fraisRetenus: 0,
        netAVerser: 50000,
        dejaVerse: 0,
        restantDu: 50000,
        soldeWalletProjet: 50000,
        coherent: true,
      });
    });

    it('projet introuvable → 404, sans divulguer autre chose', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === ProjectEntity ? null : walletProjet,
      );

      await expect(service.etatFinancier('inconnu')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ignore les mouvements intra-wallet : un blocage d’escrow ne gonfle pas le collecté', async () => {
      transactions.push({
        walletSource: 'wp1',
        walletDestination: 'wp1',
        montant: 9999,
        type: TransactionType.ESCROW_LOCK,
      });

      const etat = await service.etatFinancier(PROJET_ID);

      expect(etat.collecte).toBe(50000);
      expect(etat.netAVerser).toBe(50000);
    });

    it('grand livre désaligné : l’écart est EXPOSÉ, pas masqué', async () => {
      // Cas réellement observé sur les données de seed : le solde du wallet
      // ne correspond pas aux écritures (frais débités au ledger sans
      // diminution de la ligne). L'état financier doit le dire.
      walletProjet.solde = 50045;

      const etat = await service.etatFinancier(PROJET_ID);

      expect(etat.restantDu).toBe(50000);
      expect(etat.ecartReconciliation).toBe(45);
      expect(etat.coherent).toBe(false);
    });

    it('projet sans wallet technique : état neutre, aucun wallet créé en lecture', async () => {
      projectWalletResolver.findInTransaction.mockResolvedValue(null);

      const etat = await service.etatFinancier(PROJET_ID);

      expect(etat.collecte).toBe(0);
      expect(etat.restantDu).toBe(0);
      expect(etat.enDelaiReflexion).toBe(0);
      expect(etat.coherent).toBe(true);
      expect(projectWalletResolver.executeInTransaction).not.toHaveBeenCalled();
    });
  });

  /**
   * ANO-03 — un projet EN COLLECTE n'a pas encore de wallet technique : les
   * souscriptions sont en délai de rétractation, les fonds bloqués chez les
   * investisseurs. Le back-office affichait zéro sur toutes les lignes, y
   * compris sur des engagements bien réels, en annonçant `coherent: true`.
   */
  describe('projet en collecte sans wallet technique (ANO-03)', () => {
    const AUTRE_PROJET = 'ffffffff-1111-2222-3333-444444444444';

    beforeEach(() => {
      // Deux souscriptions rétractables, 1 500 € au total, aucun mouvement.
      engagements = [
        {
          projetId: AUTRE_PROJET,
          montant: 1000,
          statut: InvestmentStatus.EN_DELAI_RETRACTATION,
        },
        {
          projetId: AUTRE_PROJET,
          montant: 500,
          statut: InvestmentStatus.EN_DELAI_RETRACTATION,
        },
        // Bruit : ne doit pas être compté (statut acquis).
        {
          projetId: AUTRE_PROJET,
          montant: 9999,
          statut: InvestmentStatus.PAYE,
        },
      ];
    });

    it('lecture unitaire : remonte les 1 500 € en délai de réflexion, pas zéro', async () => {
      projectWalletResolver.findInTransaction.mockResolvedValue(null);

      const etat = await service.etatFinancier(AUTRE_PROJET);

      expect(etat.enDelaiReflexion).toBe(1500);
      // Ces fonds ne sont PAS acquis : ni collecte, ni dû au porteur.
      expect(etat.collecte).toBe(0);
      expect(etat.netAVerser).toBe(0);
      expect(etat.soldeWalletProjet).toBe(0);
      // Rien à rapprocher : pas d'écriture, pas de solde.
      expect(etat.ecartReconciliation).toBe(0);
      expect(etat.coherent).toBe(true);
      // Lecture pure : aucun wallet n'est créé au passage.
      expect(projectWalletResolver.executeInTransaction).not.toHaveBeenCalled();
    });

    it('lecture de page : le projet sans wallet remonte quand même ses engagements', async () => {
      walletsTechniques = [];

      const etats = await service.etatFinancierParProjets([AUTRE_PROJET]);

      expect(etats.get(AUTRE_PROJET)).toMatchObject({
        projetId: AUTRE_PROJET,
        enDelaiReflexion: 1500,
        collecte: 0,
        restantDu: 0,
        coherent: true,
      });
    });

    it('page mixte : un projet avec wallet et un sans, chacun ses montants', async () => {
      engagements.push({
        projetId: PROJET_ID,
        montant: 200,
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      });
      walletsTechniques = [walletProjet];

      const etats = await service.etatFinancierParProjets([
        PROJET_ID,
        AUTRE_PROJET,
      ]);

      // Projet avec wallet : agrégats du grand livre + son propre délai.
      expect(etats.get(PROJET_ID)).toMatchObject({
        collecte: 50000,
        enDelaiReflexion: 200,
        restantDu: 50000,
        coherent: true,
      });
      // Projet sans wallet : plus de ligne à zéro (ANO-03).
      expect(etats.get(AUTRE_PROJET)).toMatchObject({
        collecte: 0,
        enDelaiReflexion: 1500,
      });
    });

    it('projet sans engagement ni wallet : état réellement vide', async () => {
      engagements = [];
      walletsTechniques = [];

      const etats = await service.etatFinancierParProjets([AUTRE_PROJET]);

      expect(etats.get(AUTRE_PROJET)).toMatchObject({
        enDelaiReflexion: 0,
        collecte: 0,
        coherent: true,
      });
    });

    it('page vide : aucune requête émise', async () => {
      manager.createQueryBuilder.mockClear();

      const etats = await service.etatFinancierParProjets([]);

      expect(etats.size).toBe(0);
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('fraisDusSurCollecte', () => {
    it('lit la grille configurable, jamais un taux en dur — aucun frais assis sur la collecte', async () => {
      const rates = await platformFees.getRates();

      // La grille en vigueur (frais d'entrée supprimés) n'assoit aucun frais
      // sur la collecte : les commissions se prélèvent aux distributions,
      // aux sorties et au marché secondaire.
      expect(service.fraisDusSurCollecte(50000, rates)).toBe(0);
      expect(platformFees.getRates).toHaveBeenCalled();
    });
  });

  describe('declarerVersementPorteur', () => {
    const entree = () => ({
      projetId: PROJET_ID,
      referenceBancaire: 'VIR-2026-08-0042',
      dateVersement: new Date('2026-08-29T00:00:00.000Z'),
      montant: 20000,
      commentaire: null,
      declareParUserId: 7,
    });

    it('constate le versement : débite le grand livre, n’appelle AUCUN prestataire', async () => {
      const resultat = await service.declarerVersementPorteur(entree());

      // Preuve d'absence d'appel externe : le service ne détient que le
      // DataSource, le résolveur de wallet et la grille de frais. Aucun
      // client Stripe/PSP n'est injectable ni injecté.
      expect(Object.keys(service as unknown as Record<string, unknown>)).toEqual(
        expect.not.arrayContaining(['stripe', 'psp', 'httpService']),
      );

      const tx = transactions.find((t) => t.id === 'tx-1');
      expect(tx.type).toBe(TransactionType.RETRAIT);
      expect(tx.fournisseur).toBe(TransactionFournisseur.MANUEL);
      expect(tx.walletSource).toBe('wp1');
      // Contrepartie EXTERNE : le compte bancaire du porteur, hors plateforme.
      expect(tx.walletDestination).toBeNull();
      expect(tx.referenceExterne).toBe('VIR-2026-08-0042');
      expect(tx.idempotencyKey).toBe(
        `versement-porteur:${PROJET_ID}:VIR-2026-08-0042`,
      );
      expect(tx.metadata.kind).toBe(KIND_VERSEMENT_PORTEUR);
      expect(tx.metadata.declarePar).toBe(7);

      // Le solde du wallet projet est bien débité du montant versé.
      expect(walletProjet.solde).toBe(30000);
      expect(resultat.montant).toBe(20000);
      expect(resultat.etatFinancier.dejaVerse).toBe(20000);
      expect(resultat.etatFinancier.restantDu).toBe(30000);
    });

    it('rejette un DOUBLON de référence bancaire (409), sans second débit', async () => {
      await service.declarerVersementPorteur(entree());
      const soldeApresPremier = walletProjet.solde;

      await expect(
        service.declarerVersementPorteur(entree()),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(walletProjet.solde).toBe(soldeApresPremier);
      expect(
        transactions.filter((t) => t.type === TransactionType.RETRAIT),
      ).toHaveLength(1);
    });

    it('refuse une référence bancaire vide ou blanche', async () => {
      await expect(
        service.declarerVersementPorteur({ ...entree(), referenceBancaire: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuse une date de versement invalide', async () => {
      await expect(
        service.declarerVersementPorteur({
          ...entree(),
          dateVersement: new Date('pas-une-date'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuse un montant supérieur au restant dû : on ne verse pas ce qu’on n’a pas', async () => {
      await expect(
        service.declarerVersementPorteur({ ...entree(), montant: 999999 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(walletProjet.solde).toBe(50000);
    });

    it('refuse un montant nul ou négatif', async () => {
      await expect(
        service.declarerVersementPorteur({ ...entree(), montant: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.declarerVersementPorteur({ ...entree(), montant: -50 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sans montant explicite, verse tout le restant dû', async () => {
      const resultat = await service.declarerVersementPorteur({
        ...entree(),
        montant: undefined,
      });

      expect(resultat.montant).toBe(50000);
      expect(walletProjet.solde).toBe(0);
      expect(resultat.etatFinancier.restantDu).toBe(0);
    });

    it('projet introuvable → 404 avant tout mouvement', async () => {
      manager.findOne.mockImplementation(async (entity: any) =>
        entity === ProjectEntity ? null : null,
      );

      await expect(
        service.declarerVersementPorteur(entree()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(walletProjet.solde).toBe(50000);
    });
  });
});
