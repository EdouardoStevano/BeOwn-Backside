import {
  RetraitsReaperService,
  DELAI_ALERTE_SANS_PAYOUT_JOURS,
} from './retraits-reaper.service';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Le balayage ne DÉCIDE rien lui-même : il interroge le prestataire et délègue
 * la clôture au même service que le webhook (`RetraitSettlementService`). Ce
 * qui se teste ici est donc le TRI — quel retrait part vers quelle issue, avec
 * quels arguments — et la seule écriture que le balayage possède en propre :
 * l'alerte unique sur un retrait ancien sans identifiant de payout.
 */

const MAINTENANT = new Date('2026-09-01T12:00:00Z');

/** Retrait `en_cours` créé il y a `ageHeures` heures. */
function retrait(overrides: Partial<Record<string, any>> = {}, ageHeures = 1) {
  return {
    id: overrides.id ?? 'tx-1',
    type: TransactionType.RETRAIT,
    statut: TransactionStatus.EN_COURS,
    montant: 250,
    devise: 'EUR',
    createdAt: new Date(MAINTENANT.getTime() - ageHeures * 60 * 60 * 1000),
    metadata: {
      payoutId: 'po_1',
      connectedAccountId: 'acct_1',
      userId: 7,
    },
    ...overrides,
  } as any;
}

function build(options: {
  candidats?: any[];
  payout?: any;
  clotureIssue?: 'clos' | 'noop';
  denouementIssue?: 'compense' | 'noop';
} = {}) {
  const txRepo: any = {
    find: jest.fn().mockResolvedValue(options.candidats ?? []),
    save: jest.fn().mockImplementation(async (tx: any) => tx),
  };
  const stripeConnect: any = {
    retrievePayout: jest.fn().mockResolvedValue(options.payout ?? null),
  };
  const settlement: any = {
    cloturerRetraitPaye: jest
      .fn()
      .mockResolvedValue(options.clotureIssue ?? 'clos'),
    denouerPayoutNonAbouti: jest
      .fn()
      .mockResolvedValue(options.denouementIssue ?? 'compense'),
  };
  const notifications: any = {
    pushToAdmins: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new RetraitsReaperService(
      txRepo,
      stripeConnect,
      settlement,
      notifications,
    ),
    txRepo,
    stripeConnect,
    settlement,
    notifications,
  };
}

describe('RetraitsReaperService — tri des retraits en cours', () => {
  it('payout `paid` : rejoue la clôture du webhook, avec NOTRE txId posé sur le payout', async () => {
    const tx = retrait();
    const h = build({
      candidats: [tx],
      payout: { id: 'po_1', status: 'paid', metadata: {} },
      clotureIssue: 'clos',
    });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 1, compenses: 0, laisses: 0, alertes: 0 });
    // Le rattachement vient de la ligne en base, jamais de Stripe seul.
    expect(h.settlement.cloturerRetraitPaye).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'po_1',
        metadata: expect.objectContaining({ retraitTxId: 'tx-1' }),
      }),
      'acct_1',
    );
    expect(h.settlement.denouerPayoutNonAbouti).not.toHaveBeenCalled();
  });

  it('payout `paid` déjà clos par un webhook tardif : no-op compté « laissé », jamais un second crédit', async () => {
    const h = build({
      candidats: [retrait()],
      payout: { id: 'po_1', status: 'paid', metadata: {} },
      clotureIssue: 'noop',
    });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 1, alertes: 0 });
  });

  it('payout `failed` : compensation par le MÊME dénouement durci que le webhook (ECHOUE)', async () => {
    const h = build({
      candidats: [retrait()],
      payout: { id: 'po_1', status: 'failed', metadata: {} },
      denouementIssue: 'compense',
    });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 1, laisses: 0, alertes: 0 });
    expect(h.settlement.denouerPayoutNonAbouti).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ retraitTxId: 'tx-1' }),
      }),
      'acct_1',
      expect.objectContaining({
        evenement: 'reaper.payout.failed',
        statutFinal: TransactionStatus.ECHOUE,
      }),
    );
  });

  it('payout `canceled` : même discipline, statut final ANNULE', async () => {
    const h = build({
      candidats: [retrait()],
      payout: { id: 'po_1', status: 'canceled', metadata: {} },
      denouementIssue: 'compense',
    });

    await h.service.reap(MAINTENANT);

    expect(h.settlement.denouerPayoutNonAbouti).toHaveBeenCalledWith(
      expect.anything(),
      'acct_1',
      expect.objectContaining({
        evenement: 'reaper.payout.canceled',
        statutFinal: TransactionStatus.ANNULE,
      }),
    );
  });

  it('payout encore en vol (`in_transit`) : rien à décider, retrait laissé tel quel', async () => {
    const h = build({
      candidats: [retrait()],
      payout: { id: 'po_1', status: 'in_transit', metadata: {} },
    });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 1, alertes: 0 });
    expect(h.settlement.cloturerRetraitPaye).not.toHaveBeenCalled();
    expect(h.settlement.denouerPayoutNonAbouti).not.toHaveBeenCalled();
  });

  it('lecture Stripe impossible : une absence de preuve ne conclut RIEN', async () => {
    const h = build({ candidats: [retrait()], payout: null });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 1, alertes: 0 });
    expect(h.settlement.cloturerRetraitPaye).not.toHaveBeenCalled();
  });

  it('un retrait en erreur n’empêche pas le traitement des suivants', async () => {
    const h = build({
      candidats: [retrait({ id: 'tx-ko' }), retrait({ id: 'tx-ok' })],
      payout: { id: 'po_1', status: 'paid', metadata: {} },
      clotureIssue: 'clos',
    });
    h.stripeConnect.retrievePayout
      .mockRejectedValueOnce(new Error('Stripe indisponible'))
      .mockResolvedValueOnce({ id: 'po_1', status: 'paid', metadata: {} });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 2, clos: 1, compenses: 0, laisses: 1, alertes: 0 });
  });
});

describe('RetraitsReaperService — retrait sans identifiant de payout', () => {
  const AGE_ANCIEN_HEURES = (DELAI_ALERTE_SANS_PAYOUT_JOURS + 1) * 24;

  it('récent : laissé en l’état, aucune alerte — l’identifiant peut encore arriver', async () => {
    const tx = retrait({ metadata: { userId: 7 } }, /* ageHeures */ 2);
    const h = build({ candidats: [tx] });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 1, alertes: 0 });
    expect(h.notifications.pushToAdmins).not.toHaveBeenCalled();
    expect(h.txRepo.save).not.toHaveBeenCalled();
  });

  it('ancien (> 7 jours) : escalade financière SANS aucun recrédit, marquée sur la transaction', async () => {
    const tx = retrait({ metadata: { userId: 7 } }, AGE_ANCIEN_HEURES);
    const h = build({ candidats: [tx] });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 0, alertes: 1 });
    // AUCUN mouvement d'argent : ni clôture, ni compensation.
    expect(h.settlement.cloturerRetraitPaye).not.toHaveBeenCalled();
    expect(h.settlement.denouerPayoutNonAbouti).not.toHaveBeenCalled();
    // L'alerte est adressée aux rôles financiers et marquée sur la ligne.
    expect(h.notifications.pushToAdmins).toHaveBeenCalledTimes(1);
    expect(h.txRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          alerteReaper: expect.objectContaining({ raison: 'payout_absent' }),
        }),
      }),
    );
  });

  it('alerte UNIQUE : un retrait déjà escaladé n’est pas réalerté au balayage suivant', async () => {
    const tx = retrait(
      {
        metadata: {
          userId: 7,
          alerteReaper: { raison: 'payout_absent', detecteLe: '2026-08-20T00:00:00Z' },
        },
      },
      AGE_ANCIEN_HEURES,
    );
    const h = build({ candidats: [tx] });

    const resultat = await h.service.reap(MAINTENANT);

    expect(resultat).toEqual({ verifies: 1, clos: 0, compenses: 0, laisses: 1, alertes: 0 });
    expect(h.notifications.pushToAdmins).not.toHaveBeenCalled();
  });
});
