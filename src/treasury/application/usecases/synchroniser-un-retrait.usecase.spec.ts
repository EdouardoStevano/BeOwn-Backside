import { SynchroniserUnRetraitUseCase } from './synchroniser-un-retrait.usecase';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { RetraitIntrouvableError } from 'src/treasury/domain/errors/treasury.errors';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/treasury/domain/enums/wallet.enum';
import type { MetadonneesMouvement } from 'src/treasury/domain/aggregates/transaction';

const TITULAIRE = 42;

const retrait = (
  metadata: MetadonneesMouvement = {
    userId: TITULAIRE,
    payoutId: 'po_1',
    connectedAccountId: 'acct_1',
  },
  type: TransactionType = TransactionType.RETRAIT,
) =>
  new Transaction({
    id: 'tx-1',
    walletSource: null,
    walletId: 'w-1',
    walletDestination: null,
    montant: 100,
    devise: 'EUR',
    type,
    referenceExterne: null,
    fournisseur: TransactionFournisseur.STRIPE,
    fournisseurRef: 'tr_1',
    statut: TransactionStatus.EN_COURS,
    investissementId: null,
    echeanceId: null,
    reservationId: null,
    projetId: null,
    idempotencyKey: 'retrait:42:k1',
    fraisPsp: 0,
    fraisPlateforme: 0,
    metadata,
    motifEchec: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

function monter(
  etat: {
    mouvement?: Transaction | null;
    etatDuVersement?: 'arrive' | 'echoue' | 'en-cours' | 'inconnu';
  } = {},
) {
  const registre = {
    findById: jest
      .fn()
      .mockResolvedValue(
        etat.mouvement === undefined ? retrait() : etat.mouvement,
      ),
  };
  const connect = {
    etatDuVersement: jest
      .fn()
      .mockResolvedValue(etat.etatDuVersement ?? 'arrive'),
  };
  const regler = {
    verse: jest.fn().mockResolvedValue({ issue: 'verse' }),
    echoue: jest.fn().mockResolvedValue({ issue: 'solde-rendu' }),
  };

  const useCase = new SynchroniserUnRetraitUseCase(
    registre as never,
    connect as never,
    regler as never,
  );

  return { useCase, registre, connect, regler };
}

/**
 * La réconciliation d'un retrait débloque un mouvement figé `EN_COURS` faute de
 * webhook. Ce qu'elle ne doit pas devenir : un chemin qui tranche là où le
 * webhook ne trancherait pas.
 */
describe('SynchroniserUnRetraitUseCase', () => {
  it('finalise le retrait quand le fournisseur dit le versement arrivé', async () => {
    const { useCase, connect, regler } = monter({ etatDuVersement: 'arrive' });

    const issue = await useCase.execute('tx-1');

    expect(connect.etatDuVersement).toHaveBeenCalledWith('po_1', 'acct_1');
    expect(regler.verse).toHaveBeenCalled();
    expect(issue).toMatchObject({ issue: 'etat-lu', etat: 'arrive' });
  });

  it('rend le solde quand le fournisseur dit le versement échoué', async () => {
    const { useCase, regler } = monter({ etatDuVersement: 'echoue' });

    const issue = await useCase.execute('tx-1');

    expect(regler.echoue).toHaveBeenCalled();
    expect(issue).toMatchObject({ issue: 'etat-lu', etat: 'echoue' });
  });

  it.each(['en-cours', 'inconnu'] as const)(
    'ne tranche rien sur un versement « %s »',
    async (etat) => {
      // L'argent est encore en chemin, ou le fournisseur ne reconnaît pas ce
      // versement : toucher au retrait serait décider sans information.
      const { useCase, regler } = monter({ etatDuVersement: etat });

      const issue = await useCase.execute('tx-1');

      expect(regler.verse).not.toHaveBeenCalled();
      expect(regler.echoue).not.toHaveBeenCalled();
      expect(issue).toEqual({ issue: 'etat-lu', etat });
    },
  );

  it('n’a rien à relire quand le versement était automatique', async () => {
    // La plateforme n'a pas demandé ce versement : elle n'en connaît pas la
    // référence, et la deviner sur le compte connecté serait une inférence
    // qu'on ne fait pas sur de l'argent.
    const { useCase, connect } = monter({
      mouvement: retrait({ userId: TITULAIRE, connectedAccountId: 'acct_1' }),
    });

    const issue = await useCase.execute('tx-1');

    expect(issue).toEqual({ issue: 'aucun-versement' });
    expect(connect.etatDuVersement).not.toHaveBeenCalled();
  });

  it('refuse un mouvement qui n’est pas un retrait', async () => {
    const { useCase } = monter({
      mouvement: retrait(
        { userId: TITULAIRE, payoutId: 'po_1', connectedAccountId: 'acct_1' },
        TransactionType.DEPOT,
      ),
    });

    await expect(useCase.execute('tx-1')).rejects.toBeInstanceOf(
      RetraitIntrouvableError,
    );
  });

  it('traite comme introuvable le retrait d’un autre titulaire', async () => {
    // Répondre « ce retrait n'est pas le vôtre » confirmerait son existence à
    // qui le sonde.
    const { useCase, connect } = monter();

    await expect(useCase.execute('tx-1', 7)).rejects.toBeInstanceOf(
      RetraitIntrouvableError,
    );
    expect(connect.etatDuVersement).not.toHaveBeenCalled();
  });

  it('laisse passer le titulaire sur son propre retrait', async () => {
    const { useCase, regler } = monter();

    await useCase.execute('tx-1', TITULAIRE);

    expect(regler.verse).toHaveBeenCalled();
  });
});
