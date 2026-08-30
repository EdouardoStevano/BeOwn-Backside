import { CollecteCloseCronService } from './collecte-close-cron.service';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

/**
 * À la clôture d'une collecte RÉUSSIE, le solde du wallet technique du projet
 * est CONSTATÉ, les frais dus dérivés de la grille configurable, et le NET À
 * VERSER au porteur exposé aux équipes finance.
 *
 * Rien n'est versé : aucun prestataire n'est appelé, aucun virement n'est
 * émis. Le cron produit une information, pas un mouvement d'argent sortant.
 */
describe('CollecteCloseCronService — constat financier à la clôture', () => {
  const PROJET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let projectRepo: any;
  let investRepo: any;
  let notifications: any;
  let refundService: any;
  let metrics: any;
  let projectLedger: any;
  let service: CollecteCloseCronService;

  const projetFinance = () => ({
    id: PROJET_ID,
    titre: 'Résidence Test',
    statut: ProjectStatus.EN_COLLECTE,
    capitalCible: 50000,
    capitalMinimum: 40000,
    dateCloturePrevue: new Date('2026-08-01'),
  });

  const etatFinancier = (overrides: Record<string, unknown> = {}) => ({
    projetId: PROJET_ID,
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
    ...overrides,
  });

  /** Montant collecté renvoyé par le recompte SQL du cron. */
  const setRaised = (montant: number) => {
    investRepo.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: String(montant) }),
    }));
  };

  beforeEach(() => {
    projectRepo = {
      find: jest.fn().mockResolvedValue([projetFinance()]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    investRepo = {};
    setRaised(50000);
    notifications = { pushToAdmins: jest.fn().mockResolvedValue(undefined) };
    refundService = {
      refundProjectCollecte: jest
        .fn()
        .mockResolvedValue({ refundedCount: 0, refundedAmount: 0 }),
    };
    metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    projectLedger = {
      etatFinancier: jest.fn().mockResolvedValue(etatFinancier()),
    };

    service = new CollecteCloseCronService(
      projectRepo,
      investRepo,
      notifications,
      refundService,
      metrics,
      projectLedger,
    );
  });

  it('projet financé à 100 % : passage en FINANCE et constat du net à verser au porteur', async () => {
    await service.closeExpiredCollectes();

    expect(projectRepo.update).toHaveBeenCalledWith(
      { id: PROJET_ID },
      { statut: ProjectStatus.FINANCE },
    );

    // Le solde du wallet projet est CONSTATÉ via le grand livre.
    expect(projectLedger.etatFinancier).toHaveBeenCalledWith(PROJET_ID);

    // Le net à verser est EXPOSÉ aux équipes finance, chiffres à l'appui.
    const notif = notifications.pushToAdmins.mock.calls[0][0];
    expect(notif.metadata).toMatchObject({
      projectId: PROJET_ID,
      soldeWalletProjet: 50000,
      fraisRetenus: 0,
      netAVerser: 50000,
    });
    expect(notif.message).toContain('net à verser au porteur');

    // AUCUN remboursement, AUCUN virement : la collecte a réussi.
    expect(refundService.refundProjectCollecte).not.toHaveBeenCalled();
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      expect.any(String),
      { outcome: 'finance' },
    );
  });

  it('les frais retenus proviennent du grand livre, jamais d’un taux en dur dans le cron', async () => {
    projectLedger.etatFinancier.mockResolvedValue(
      etatFinancier({ fraisRetenus: 1200, netAVerser: 48800, restantDu: 48800, soldeWalletProjet: 48800 }),
    );

    await service.closeExpiredCollectes();

    const notif = notifications.pushToAdmins.mock.calls[0][0];
    expect(notif.metadata.fraisRetenus).toBe(1200);
    expect(notif.metadata.netAVerser).toBe(48800);
    // Le cron n'a fait AUCUN calcul de frais : il relaie l'état financier.
    expect(projectLedger.etatFinancier).toHaveBeenCalledTimes(1);
  });

  it('fonds encore sous délai de réflexion : la clôture le signale explicitement', async () => {
    projectLedger.etatFinancier.mockResolvedValue(
      etatFinancier({ collecte: 42000, enDelaiReflexion: 8000, netAVerser: 42000, restantDu: 42000, soldeWalletProjet: 42000 }),
    );

    await service.closeExpiredCollectes();

    const notif = notifications.pushToAdmins.mock.calls[0][0];
    expect(notif.message).toContain('délai de réflexion');
    expect(notif.metadata.enDelaiReflexion).toBe(8000);
  });

  it('objectif minimum non atteint : remboursement intégral, aucun constat de versement', async () => {
    setRaised(10000); // < capitalMinimum (40000)

    await service.closeExpiredCollectes();

    expect(refundService.refundProjectCollecte).toHaveBeenCalledWith(
      PROJET_ID,
      expect.objectContaining({ targetStatus: ProjectStatus.ECHEC }),
    );
    expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    expect(projectRepo.update).not.toHaveBeenCalled();
  });

  it('aucune collecte échue : ni constat, ni notification', async () => {
    projectRepo.find.mockResolvedValue([]);

    await service.closeExpiredCollectes();

    expect(projectLedger.etatFinancier).not.toHaveBeenCalled();
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();
  });
});
