import { Logger } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { TransactionStatus, WalletType } from '../domains/enums/wallet.enum';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Réconciliation financière — tests SANS base ni réseau.
 *
 * C'est la contrainte structurante du lot : un contrôle comptable qui exigerait
 * une base pour être vérifié ne serait pas testable en intégration continue, et
 * ne le serait donc jamais. Les collaborateurs sont ici de simples doubles en
 * mémoire ; le fait que cela suffise EST la preuve que la règle vit dans le
 * domaine et l'application, jamais dans l'infrastructure.
 */
describe('ReconciliationService', () => {
  const W_INV_1 = 'wallet-investisseur-1';
  const W_INV_2 = 'wallet-investisseur-2';
  const W_PROJET = 'wallet-technique-projet';

  /** Portefeuilles tels que les rendrait `walletRepo.find()`. */
  let wallets: any[];
  /** Pages successives du grand livre rendues par le QueryBuilder mocké. */
  let pagesEcritures: any[][];

  let walletRepo: any;
  let txRepo: any;
  let plateformeBalance: any;
  let notifications: any;
  let metrics: any;
  let service: ReconciliationService;

  /**
   * Les montants `decimal(18,2)` reviennent de PostgreSQL sous forme de
   * CHAÎNES : les doubles les restituent tels quels pour que les tests
   * exercent la même conversion que la production.
   */
  const walletInvestisseur = (id: string, solde: string, bloque: string) => ({
    id,
    type: WalletType.INVESTISSEUR,
    solde,
    soldeBloque: bloque,
    proprietaireUserId: 42,
  });

  const ecriture = (
    source: string | null,
    destination: string | null,
    montant: string,
  ) => ({
    id: `tx-${source ?? 'ext'}-${destination ?? 'ext'}-${montant}`,
    walletSource: source,
    walletDestination: destination,
    montant,
  });

  beforeEach(() => {
    // Journaux muets : ces tests provoquent volontairement des `logger.error`.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Grand livre RAPPROCHÉ par défaut :
    //  - w-inv-1 : dépôt externe de 1 000 € (600 disponibles + 400 bloqués) ;
    //  - w-inv-2 : dépôt externe de 2 500 €, dont 2 000 souscrits ;
    //  - w-projet : 2 000 € reçus de w-inv-2.
    wallets = [
      walletInvestisseur(W_INV_1, '600.00', '400.00'),
      walletInvestisseur(W_INV_2, '500.00', '0.00'),
      {
        id: W_PROJET,
        type: WalletType.TECHNIQUE_PROJET,
        solde: '2000.00',
        soldeBloque: '0.00',
        proprietaireUserId: null,
      },
    ];
    pagesEcritures = [
      [
        ecriture(null, W_INV_1, '1000.00'),
        ecriture(null, W_INV_2, '2500.00'),
        ecriture(W_INV_2, W_PROJET, '2000.00'),
      ],
      // Page vide : le lecteur paginé doit savoir s'arrêter.
      [],
    ];

    walletRepo = { find: jest.fn(async () => wallets) };

    txRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        for (const methode of ['select', 'where', 'orderBy', 'offset', 'limit']) {
          qb[methode] = jest.fn(() => qb);
        }
        qb.getMany = jest.fn(async () => pagesEcritures.shift() ?? []);
        return qb;
      }),
    };

    // Solde PSP couvrant exactement les 1 500 € dus aux investisseurs.
    plateformeBalance = {
      lireSolde: jest.fn(async () => ({ totalEur: 1500, devise: 'EUR' })),
    };
    notifications = { pushToAdmins: jest.fn(async () => []) };
    metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };

    service = new ReconciliationService(
      walletRepo,
      txRepo,
      plateformeBalance,
      notifications,
      metrics,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Arguments du dernier appel à une jauge donnée, ou `undefined`. */
  const jauge = (nom: string): any[] | undefined =>
    [...metrics.setGauge.mock.calls].reverse().find((appel) => appel[0] === nom);

  it('déclare l’équilibre quand le grand livre est rapproché et le solde PSP cohérent', async () => {
    const rapport = await service.reconcilier();

    expect(rapport.ecarts).toEqual([]);
    expect(rapport.ecartLedgerTotalEur).toBe(0);
    expect(rapport.nbWallets).toBe(3);
    expect(rapport.nbEcritures).toBe(3);
    expect(rapport.soldeInvestisseursEur).toBe(1500);
    expect(rapport.soldeStripeEur).toBe(1500);
    expect(rapport.ecartStripeEur).toBe(0);
    expect(rapport.equilibre).toBe(true);

    // Silence radio : alerter sur un contrôle au vert est le plus sûr moyen
    // de faire ignorer la prochaine vraie alerte.
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();

    // Jauge de fraîcheur posée en fin d'exécution réussie : c'est elle qui
    // permet d'alerter sur un job qui ne tourne PLUS.
    const fraicheur = jauge(METRIC.RECONCILIATION_LAST_SUCCESS_TIMESTAMP);
    expect(fraicheur).toBeDefined();
    expect(fraicheur![2]).toEqual({ job: 'grand-livre' });
    expect(typeof fraicheur![1]).toBe('number');
    expect(fraicheur![1]).toBeGreaterThan(1_700_000_000);

    expect(jauge(METRIC.WALLET_LEDGER_DISCREPANCY_EUR)![1]).toBe(0);
    expect(jauge(METRIC.STRIPE_BALANCE_DISCREPANCY_EUR)![1]).toBe(0);
  });

  it('détecte une écriture manquante et alerte les équipes financières', async () => {
    // La souscription de 2 000 € disparaît du registre : les SOLDES restent
    // justes (l'argent a bien bougé), seul l'historique ment. C'est exactement
    // le défaut qu'aucun contrôle de solde ne peut voir.
    pagesEcritures = [
      [
        ecriture(null, W_INV_1, '1000.00'),
        ecriture(null, W_INV_2, '2500.00'),
      ],
      [],
    ];

    const rapport = await service.reconcilier();

    expect(rapport.equilibre).toBe(false);
    expect(rapport.ecarts).toHaveLength(2);
    // w-inv-2 : 500 détenus contre 2 500 au registre ; w-projet : 2 000
    // détenus contre 0. Écart cumulé en valeur absolue : 4 000 €.
    const parWallet = new Map(rapport.ecarts.map((e) => [e.walletId, e.ecart]));
    expect(parWallet.get(W_INV_2)).toBeCloseTo(-2000, 6);
    expect(parWallet.get(W_PROJET)).toBeCloseTo(2000, 6);
    expect(rapport.ecartLedgerTotalEur).toBeCloseTo(4000, 6);
    expect(jauge(METRIC.WALLET_LEDGER_DISCREPANCY_EUR)![1]).toBeCloseTo(4000, 6);

    expect(notifications.pushToAdmins).toHaveBeenCalledTimes(1);
    const alerte = notifications.pushToAdmins.mock.calls[0][0];
    expect(alerte.type).toBe(NotificationType.SECURITE);
    expect(alerte.roles).toEqual([UserRole.FINANCIER, UserRole.SUPER_ADMIN]);
    expect(alerte.titre).toContain('Réconciliation financière');

    // RGPD : l'alerte ne transporte que des identifiants de PORTEFEUILLE et
    // des montants — jamais l'identifiant du titulaire ni son e-mail.
    const charge = JSON.stringify(alerte.metadata);
    expect(charge).toContain(W_INV_2);
    expect(charge).not.toContain('proprietaireUserId');
    expect(charge).not.toContain('@');
  });

  it('aboutit malgré un prestataire de paiement injoignable', async () => {
    plateformeBalance.lireSolde.mockRejectedValueOnce(
      new Error('Stripe API unreachable'),
    );

    // Aucune exception ne remonte : le contrôle du grand livre interne a de la
    // valeur à lui seul et ne doit pas dépendre de la disponibilité du PSP.
    const rapport = await service.reconcilier();

    expect(rapport.soldeStripeEur).toBeNull();
    expect(rapport.ecartStripeEur).toBeNull();
    // Le grand livre, lui, a bien été rapproché.
    expect(rapport.ecarts).toEqual([]);
    expect(rapport.ecartLedgerTotalEur).toBe(0);

    // Aucune jauge d'écart PSP : publier un 0 ferait passer pour vérifié un
    // contrôle qui n'a pas eu lieu.
    expect(jauge(METRIC.STRIPE_BALANCE_DISCREPANCY_EUR)).toBeUndefined();
    // Le job, lui, est bien allé au bout.
    expect(jauge(METRIC.RECONCILIATION_LAST_SUCCESS_TIMESTAMP)).toBeDefined();

    // ARBITRAGE ASSUMÉ : un contrôle non mené n'est pas un contrôle réussi.
    // L'équipe est prévenue que le volet PSP n'a pas pu être vérifié.
    expect(rapport.equilibre).toBe(false);
    expect(notifications.pushToAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.pushToAdmins.mock.calls[0][0].message).toContain(
      'INDISPONIBLE',
    );
  });

  it('alerte sur un écart de couverture PSP même quand le grand livre est rapproché', async () => {
    // 1 200 € détenus chez le prestataire pour 1 500 € dus aux investisseurs :
    // la plateforme doit à ses clients plus qu'elle ne détient.
    plateformeBalance.lireSolde.mockResolvedValueOnce({
      totalEur: 1200,
      devise: 'EUR',
    });

    const rapport = await service.reconcilier();

    expect(rapport.ecarts).toEqual([]);
    expect(rapport.soldeInvestisseursEur).toBe(1500);
    expect(rapport.soldeStripeEur).toBe(1200);
    expect(rapport.ecartStripeEur).toBeCloseTo(-300, 6);
    expect(rapport.equilibre).toBe(false);

    expect(jauge(METRIC.STRIPE_BALANCE_DISCREPANCY_EUR)![1]).toBeCloseTo(300, 6);

    expect(notifications.pushToAdmins).toHaveBeenCalledTimes(1);
    const alerte = notifications.pushToAdmins.mock.calls[0][0];
    expect(alerte.roles).toEqual([UserRole.FINANCIER, UserRole.SUPER_ADMIN]);
    expect(alerte.message).toContain('Couverture PSP');
    expect(alerte.metadata.ecartStripeEur).toBeCloseTo(-300, 6);
  });

  it('arrête la pagination du grand livre dès qu’une page est incomplète', async () => {
    await service.reconcilier();

    // Trois écritures pour des lots de 5 000 : la page est incomplète, donc
    // c'est la dernière. Une requête de confirmation sur une table de plusieurs
    // millions de lignes serait un aller-retour gratuit, tous les matins.
    expect(txRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('ne compte que les portefeuilles investisseurs dans l’engagement client', async () => {
    const rapport = await service.reconcilier();

    // 1 000 (w-inv-1, dont 400 bloqués) + 500 (w-inv-2) = 1 500. Le
    // portefeuille technique du projet (2 000 €) n'est dû à AUCUN client : le
    // compter gonflerait artificiellement la couverture attendue.
    expect(rapport.soldeInvestisseursEur).toBe(1500);
  });

  it('reconstitue le registre depuis les écritures dont le mouvement est APPLIQUÉ, retraits en vol compris', async () => {
    await service.reconcilier();

    const qb = txRepo.createQueryBuilder.mock.results[0].value;
    const [, parametres] = qb.where.mock.calls[0];

    // Un retrait débite son portefeuille dès la DEMANDE, bien avant que la
    // banque ne confirme. Restreindre le registre au seul REUSSI faisait donc
    // apparaître, toutes les nuits, un écart négatif sur chaque portefeuille
    // ayant un retrait en cours — une fausse alerte sur le contrôle financier
    // le plus critique de la plateforme.
    expect(parametres.statuts).toEqual(
      expect.arrayContaining([
        TransactionStatus.REUSSI,
        TransactionStatus.EN_COURS,
        TransactionStatus.EN_ATTENTE_PAIEMENT,
      ]),
    );

    // Et surtout : ce qui n'a rien déplacé, ou dont le mouvement a été DÉFAIT
    // par un recrédit, reste hors du registre.
    expect(parametres.statuts).not.toEqual(
      expect.arrayContaining([TransactionStatus.INITIE]),
    );
    expect(parametres.statuts).not.toEqual(
      expect.arrayContaining([TransactionStatus.ECHOUE]),
    );
    expect(parametres.statuts).not.toEqual(
      expect.arrayContaining([TransactionStatus.ANNULE]),
    );
    expect(parametres.statuts).not.toEqual(
      expect.arrayContaining([TransactionStatus.REMBOURSE]),
    );
  });

  it('reste rapproché sur un portefeuille dont le retrait est encore en vol', async () => {
    // w-inv-2 demande un retrait de 500 € : son solde tombe à 0 immédiatement,
    // et l'écriture existe au statut EN_COURS. Le registre — qui compte
    // désormais cette écriture — doit suivre le solde à l'euro près.
    wallets[1].solde = '0.00';
    pagesEcritures = [
      [
        ecriture(null, W_INV_1, '1000.00'),
        ecriture(null, W_INV_2, '2500.00'),
        ecriture(W_INV_2, W_PROJET, '2000.00'),
        ecriture(W_INV_2, null, '500.00'), // retrait EN_COURS
      ],
    ];
    plateformeBalance.lireSolde = jest.fn(async () => ({
      totalEur: 1000,
      devise: 'EUR',
    }));

    const rapport = await service.reconcilier();

    expect(rapport.ecarts).toEqual([]);
    expect(rapport.equilibre).toBe(true);
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();
  });
});
