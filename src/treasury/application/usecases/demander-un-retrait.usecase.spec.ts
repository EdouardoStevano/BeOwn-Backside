import { DemanderUnRetraitUseCase } from './demander-un-retrait.usecase';
import { SortieDeFondsService } from '../services/sortie-de-fonds.service';
import { AcheminementDuRetraitService } from '../services/acheminement-du-retrait.service';
import {
  RetraitADemanderManuellementDomainEvent,
  RetraitEnRouteDomainEvent,
} from 'src/treasury/domain/events/retrait.domain-event';
import { Wallet } from 'src/treasury/domain/aggregates/wallet';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import { Money } from 'src/treasury/domain/value-objects/money.vo';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletStatut,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import type { CompteDeRetrait } from '../ports/connect.gateway';

const TITULAIRE = 42;

const portefeuille = (solde = 1_000, statut = WalletStatut.ACTIF) =>
  new Wallet({
    id: 'w-1',
    type: WalletType.INVESTISSEUR,
    proprietaireUserId: TITULAIRE,
    projetId: null,
    spvId: null,
    fournisseurRef: 'INV-42-auto',
    devise: 'EUR',
    solde,
    statut,
    createdAt: new Date('2026-01-01'),
  });

const mouvement = () =>
  new Transaction({
    id: 'tx-1',
    walletSource: null,
    walletId: 'w-1',
    walletDestination: null,
    montant: 100,
    devise: 'EUR',
    type: TransactionType.RETRAIT,
    referenceExterne: null,
    fournisseur: TransactionFournisseur.STRIPE,
    fournisseurRef: null,
    statut: TransactionStatus.EN_COURS,
    investissementId: null,
    echeanceId: null,
    reservationId: null,
    projetId: null,
    idempotencyKey: 'retrait:42:k1',
    fraisPsp: 0,
    fraisPlateforme: 0,
    metadata: { userId: TITULAIRE },
    motifEchec: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const comptePret: CompteDeRetrait = {
  connected: true,
  accountId: 'acct_1',
  detailsSubmitted: true,
  chargesEnabled: true,
  payoutsEnabled: true,
};

const compteAbsent: CompteDeRetrait = {
  connected: false,
  accountId: null,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

function monter(
  etat: {
    wallet?: Wallet;
    compte?: CompteDeRetrait;
    consignation?: 'consigne' | 'solde-insuffisant';
    dejaDemande?: Transaction | null;
    transfertEchoue?: boolean;
    versementRefuse?: boolean;
  } = {},
) {
  const wallets = {
    findById: jest.fn().mockResolvedValue(etat.wallet ?? portefeuille()),
    findByUser: jest.fn().mockResolvedValue(etat.wallet ?? portefeuille()),
  };

  const registre = {
    findByIdempotencyKey: jest.fn().mockResolvedValue(etat.dejaDemande ?? null),
    consignerUnDebit: jest
      .fn()
      .mockResolvedValue(
        etat.consignation === 'solde-insuffisant'
          ? { issue: 'solde-insuffisant' }
          : { issue: 'consigne', mouvement: mouvement() },
      ),
    save: jest.fn((m: Transaction) => Promise.resolve(m)),
  };

  const connect = {
    statutDuCompte: jest.fn().mockResolvedValue(etat.compte ?? comptePret),
    transferer: etat.transfertEchoue
      ? jest.fn().mockRejectedValue(new Error('transfer refusé'))
      : jest.fn().mockResolvedValue('tr_1'),
    verser: etat.versementRefuse
      ? jest.fn().mockRejectedValue(new Error('payouts automatiques'))
      : jest.fn().mockResolvedValue('po_1'),
  };

  // Le use case ne notifie plus : il publie des faits. Ce que les tests
  // éprouvent est donc ce qu'il annonce, pas qui il appelle.
  const eventBus = { publish: jest.fn() };

  const rendreLeSolde = { execute: jest.fn().mockResolvedValue('rendu') };

  // Les deux services sont montés **pour de vrai** : ce sont eux qui portent
  // désormais le débit et le dialogue avec le fournisseur, c'est-à-dire ce que
  // ces tests protègent. Les doubler reviendrait à ne plus éprouver que
  // l'enchaînement, alors que la règle est dans les services.
  const useCase = new DemanderUnRetraitUseCase(
    new SortieDeFondsService(wallets as never, registre as never),
    new AcheminementDuRetraitService(connect as never),
    eventBus as never,
    rendreLeSolde as never,
  );

  /** Le premier fait publié d'un type donné, ou `undefined`. */
  const faitPublie = (type: new (...args: never[]) => object) =>
    eventBus.publish.mock.calls
      .map(([fait]) => fait as object)
      .find((fait) => fait instanceof type);

  return {
    useCase,
    wallets,
    registre,
    connect,
    eventBus,
    faitPublie,
    rendreLeSolde,
  };
}

const demande = (extra: Record<string, unknown> = {}) => ({
  utilisateurId: TITULAIRE,
  montant: Money.euros(100),
  ...extra,
});

describe('DemanderUnRetraitUseCase — le solde', () => {
  it('refuse un retrait que le solde ne couvre pas, sans rien consigner', async () => {
    const { useCase, registre } = monter({ wallet: portefeuille(50) });

    const issue = await useCase.execute(demande());

    expect(issue).toEqual({
      issue: 'solde-insuffisant',
      motif: 'Solde insuffisant',
    });
    expect(registre.consignerUnDebit).not.toHaveBeenCalled();
  });

  it('refuse aussi quand la condition en base tranche après l’agrégat', async () => {
    // Entre la lecture de l'agrégat et l'écriture, un autre mouvement est
    // passé : le décrément conditionnel n'affecte aucune ligne.
    const { useCase } = monter({ consignation: 'solde-insuffisant' });

    const issue = await useCase.execute(demande());

    expect(issue).toMatchObject({ issue: 'solde-insuffisant' });
  });

  it('refuse tout retrait sur un portefeuille gelé', async () => {
    // Le décrément conditionnel SQL, seul garde-fou avant ce refactoring, ne
    // regardait que le solde : un portefeuille gelé était débitable.
    const { useCase, registre } = monter({
      wallet: portefeuille(1_000, WalletStatut.GELE),
    });

    await expect(useCase.execute(demande())).rejects.toThrow();
    expect(registre.consignerUnDebit).not.toHaveBeenCalled();
  });
});

describe('DemanderUnRetraitUseCase — idempotence', () => {
  it('rend le retrait déjà ouvert sous la même clé, sans rejouer le débit', async () => {
    const { useCase, registre } = monter({ dejaDemande: mouvement() });

    const issue = await useCase.execute(demande({ cleDIdempotence: 'k1' }));

    expect(issue).toMatchObject({
      issue: 'deja-demande',
      transactionId: 'tx-1',
    });
    expect(registre.consignerUnDebit).not.toHaveBeenCalled();
  });

  it('rend le retrait existant quand deux soumissions se croisent', async () => {
    // La relecture d'entrée n'a rien vu ; c'est la contrainte d'unicité qui a
    // tranché. Le débit est défait avec la transaction, et le titulaire doit
    // lire son retrait — pas « solde insuffisant », qui lui ferait croire que
    // son argent a disparu.
    const { useCase, registre } = monter();
    registre.consignerUnDebit.mockResolvedValue({ issue: 'deja-consigne' });
    registre.findByIdempotencyKey
      .mockResolvedValueOnce(null) // relecture d'entrée : rien
      .mockResolvedValueOnce(mouvement()); // après collision : le retrait ouvert

    const issue = await useCase.execute(demande({ cleDIdempotence: 'k1' }));

    expect(issue).toMatchObject({
      issue: 'deja-demande',
      transactionId: 'tx-1',
    });
  });

  it('interroge le registre avec la clé composée par le domaine', async () => {
    // Écriture et relecture doivent former la même clé ; une divergence d'un
    // caractère et l'idempotence ne protège plus de rien.
    const { useCase, registre } = monter();

    await useCase.execute(demande({ cleDIdempotence: 'k1' }));

    expect(registre.findByIdempotencyKey).toHaveBeenCalledWith('retrait:42:k1');
  });
});

describe('DemanderUnRetraitUseCase — Stripe Connect', () => {
  it('débite, transfère, verse, et laisse le retrait en cours', async () => {
    const { useCase, connect, faitPublie } = monter();

    const issue = await useCase.execute(demande());

    expect(issue).toMatchObject({
      issue: 'en-route',
      transactionId: 'tx-1',
      transfertId: 'tr_1',
      versementId: 'po_1',
    });
    expect(connect.transferer).toHaveBeenCalled();
    expect(faitPublie(RetraitEnRouteDomainEvent)).toMatchObject({
      utilisateurId: TITULAIRE,
      transactionId: 'tx-1',
    });
  });

  it('rend le solde intégralement quand le transfert échoue', async () => {
    const { useCase, rendreLeSolde } = monter({ transfertEchoue: true });

    const issue = await useCase.execute(demande());

    expect(issue).toMatchObject({ issue: 'transfert-refuse' });
    expect(rendreLeSolde.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tx-1',
        statutFinal: TransactionStatus.ECHOUE,
      }),
    );
  });

  it('ne défait rien quand seul le versement explicite est refusé', async () => {
    // Le transfert a réussi : les fonds sont chez l'investisseur, et le compte
    // verse probablement de lui-même. Rapatrier reviendrait à rappeler des
    // fonds déjà en route.
    const { useCase, rendreLeSolde } = monter({ versementRefuse: true });

    const issue = await useCase.execute(demande());

    expect(issue).toMatchObject({ issue: 'en-route', transfertId: 'tr_1' });
    expect(rendreLeSolde.execute).not.toHaveBeenCalled();
  });
});

describe('DemanderUnRetraitUseCase — parcours de secours', () => {
  it('bascule sur le traitement manuel quand un IBAN est fourni', async () => {
    const { useCase, faitPublie } = monter({ compte: compteAbsent });

    const issue = await useCase.execute(
      demande({ ibanDestination: 'FR76...' }),
    );

    expect(issue).toMatchObject({ issue: 'a-traiter-manuellement' });
    expect(faitPublie(RetraitADemanderManuellementDomainEvent)).toMatchObject({
      ibanDestination: 'FR76...',
    });
  });

  it('réclame le compte de retrait quand il n’y a ni compte ni IBAN', async () => {
    const { useCase, registre } = monter({ compte: compteAbsent });

    const issue = await useCase.execute(demande());

    expect(issue).toEqual({ issue: 'compte-de-retrait-non-pret' });
    expect(registre.consignerUnDebit).not.toHaveBeenCalled();
  });

  it('bascule sur le secours plutôt que d’échouer si le fournisseur est indisponible', async () => {
    // Le repli est un compte **non connecté**, jamais un compte présumé prêt :
    // un incident chez Stripe ne doit ni bloquer le retrait, ni faire partir un
    // transfert vers un compte dont on ignore l'état.
    const { useCase, connect, faitPublie } = monter();
    connect.statutDuCompte.mockRejectedValue(new Error('Stripe indisponible'));

    const issue = await useCase.execute(
      demande({ ibanDestination: 'FR76...' }),
    );

    expect(issue).toMatchObject({ issue: 'a-traiter-manuellement' });
    expect(connect.transferer).not.toHaveBeenCalled();
    expect(faitPublie(RetraitADemanderManuellementDomainEvent)).toBeDefined();
  });
});

describe('DemanderUnRetraitUseCase — titularité du portefeuille', () => {
  it('traite comme introuvable un portefeuille qui n’est pas celui de l’appelant', async () => {
    const { useCase, wallets } = monter();
    wallets.findById.mockResolvedValue(
      new Wallet({
        id: 'w-autre',
        type: WalletType.INVESTISSEUR,
        proprietaireUserId: 7,
        projetId: null,
        spvId: null,
        fournisseurRef: 'INV-7-auto',
        devise: 'EUR',
        solde: 10_000,
        statut: WalletStatut.ACTIF,
        createdAt: new Date(),
      }),
    );

    await expect(
      useCase.execute(demande({ walletId: 'w-autre' })),
    ).rejects.toThrow();
  });
});
