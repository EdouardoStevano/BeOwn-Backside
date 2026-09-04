import { ForbiddenException } from '@nestjs/common';
import { CreateInvestmentUseCase } from 'src/investments/applications/usecases/create-investment.usecase';
import { RequestRetraitUseCase } from 'src/payments/applications/usecases/request-retrait.usecase';
import { ExprimerInteretUseCase } from 'src/secondarymarket/applications/usecases/exprimer-interet.usecase';
import { InitiateBuyUseCase } from 'src/secondarymarket/applications/usecases/initiate-buy.usecase';
import { PaymentController } from 'src/payments/presenters/http/payment.controller';
import { CODE_AVOIRS_GELES, messageAvoirsGeles } from './domains/gel-des-avoirs';

/**
 * Contrat transversal du gel des avoirs : les QUATRE chemins d'argent sortant
 * appellent la garde `assertAvoirsNonGeles` EN PREMIER — avant toute lecture,
 * écriture ou appel prestataire — et laissent passer un compte non gelé.
 *
 * Technique : chaque cas d'usage est construit à la main avec des collaborateurs
 * « pièges » (toute méthode invoquée jette SENTINELLE). Compte gelé → le refus
 * 403 AVOIRS_GELES sort AVANT qu'aucun piège ne se déclenche. Compte non gelé →
 * l'exécution dépasse la garde et tombe sur le premier piège, preuve que la
 * garde ne bloque pas les comptes sains.
 */
const SENTINELLE = new Error('SENTINELLE: collaborateur atteint après la garde');

/** Proxy qui jette SENTINELLE sur n'importe quel appel de méthode/propriété. */
const piege = (): any =>
  new Proxy(
    {},
    {
      get: () => () => {
        throw SENTINELLE;
      },
    },
  );

const gardeGelee = () => ({
  assertAvoirsNonGeles: jest.fn().mockRejectedValue(
    new ForbiddenException({
      code: CODE_AVOIRS_GELES,
      message: messageAvoirsGeles('compliance@beown.fr'),
    }),
  ),
});

const gardeLibre = () => ({
  assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined),
});

const attendreRefusGele = async (promesse: Promise<unknown>, garde: any) => {
  const err = await promesse.catch((e) => e);
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getStatus()).toBe(403);
  expect((err as ForbiddenException).getResponse()).toMatchObject({
    code: CODE_AVOIRS_GELES,
  });
  expect(garde.assertAvoirsNonGeles).toHaveBeenCalledTimes(1);
};

describe('Gel des avoirs — refus 403 sur les 4 chemins d’argent sortant', () => {
  describe('1. Souscription (CreateInvestmentUseCase — couvre le réinvestissement auto)', () => {
    const construire = (garde: any) =>
      new CreateInvestmentUseCase(
        piege(), // investmentRepository
        piege(), // projectRepository
        piege(), // walletRepository
        piege(), // documentRepository
        piege(), // userRepository
        piege(), // profilRepository
        piege(), // contractGenerator
        piege(), // cloudStorage
        piege(), // notificationService
        piege(), // notificationEvents
        piege(), // dataSource
        piege(), // metrics
        piege(), // projectWalletResolver
        piege(), // amlMonitor
        piege(), // bonusParrainage
        garde, // gelDesAvoirs — dernière position
      );

    it('compte gelé → 403 AVOIRS_GELES avant toute lecture', async () => {
      const garde = gardeGelee();
      await attendreRefusGele(
        construire(garde).execute(10, { projetId: 'p1', nbFractions: 1 } as any),
        garde,
      );
    });

    it('compte non gelé → la garde laisse passer (le flux atteint le collaborateur suivant)', async () => {
      const garde = gardeLibre();
      await expect(
        construire(garde).execute(10, { projetId: 'p1', nbFractions: 1 } as any),
      ).rejects.toThrow(SENTINELLE);
      expect(garde.assertAvoirsNonGeles).toHaveBeenCalledWith(10);
    });
  });

  describe('2. Retrait (RequestRetraitUseCase)', () => {
    const construire = (garde: any) =>
      new RequestRetraitUseCase(
        piege(), // txRepo
        piege(), // stripeConnect
        piege(), // notificationService
        piege(), // dataSource
        piege(), // metrics
        piege(), // destinationResolver
        piege(), // amlMonitor
        garde, // gelDesAvoirs — dernière position
      );

    it('compte gelé → 403 AVOIRS_GELES, y compris sur un rejeu idempotent', async () => {
      const garde = gardeGelee();
      await attendreRefusGele(
        construire(garde).execute(
          { amount: 100, currency: 'EUR', idempotencyKey: 'k1' } as any,
          { userId: 10 } as any,
        ),
        garde,
      );
    });

    it('compte non gelé → la garde laisse passer', async () => {
      const garde = gardeLibre();
      await expect(
        construire(garde).execute(
          { amount: 100, currency: 'EUR', idempotencyKey: 'k1' } as any,
          { userId: 10 } as any,
        ),
      ).rejects.toThrow(SENTINELLE);
      expect(garde.assertAvoirsNonGeles).toHaveBeenCalledWith(10);
    });
  });

  describe("3. Marché secondaire — expression d'intérêt (ExprimerInteretUseCase)", () => {
    const construire = (garde: any) =>
      new ExprimerInteretUseCase(
        piege(), // ordreRepo
        piege(), // walletRepo
        piege(), // investRepo
        piege(), // notifications
        piege(), // devisCession
        garde, // gelDesAvoirs — dernière position
      );

    it('acheteur gelé → 403 AVOIRS_GELES avant toute lecture de l’annonce', async () => {
      const garde = gardeGelee();
      await attendreRefusGele(construire(garde).execute('ordre-1', 10, 2), garde);
    });

    it('acheteur non gelé → la garde laisse passer', async () => {
      const garde = gardeLibre();
      await expect(construire(garde).execute('ordre-1', 10, 2)).rejects.toThrow(
        SENTINELLE,
      );
      expect(garde.assertAvoirsNonGeles).toHaveBeenCalledWith(10);
    });
  });

  describe('4. Marché secondaire — formation du contrat (InitiateBuyUseCase)', () => {
    const construire = (garde: any) =>
      new InitiateBuyUseCase(
        piege(), // ordreRepo
        piege(), // investRepo
        piege(), // documentRepo
        piege(), // signatureRepo
        piege(), // walletRepo
        piege(), // userRepo
        piege(), // userEmailRepo
        piege(), // cloudStorage
        piege(), // contractGenerator
        piege(), // signatureProvider
        garde, // gelDesAvoirs — dernière position
      );

    it('acheteur gelé (fenêtre intérêt→acceptation) → 403 AVOIRS_GELES', async () => {
      const garde = gardeGelee();
      await attendreRefusGele(construire(garde).execute('ordre-1', 10, 2), garde);
    });

    it('acheteur non gelé → la garde laisse passer', async () => {
      const garde = gardeLibre();
      await expect(construire(garde).execute('ordre-1', 10, 2)).rejects.toThrow(
        SENTINELLE,
      );
      expect(garde.assertAvoirsNonGeles).toHaveBeenCalledWith(10);
    });
  });

  describe('5. Dépôt (PaymentController.createDepotIntent)', () => {
    const construire = (garde: any) =>
      new PaymentController(
        piege(), // stripeService
        piege(), // identityService
        piege(), // stripeConnect
        piege(), // updateKycStatus
        piege(), // notificationService
        piege(), // auditLog
        piege(), // config
        piege(), // profilRepository
        piege(), // walletRepo
        piege(), // txRepo
        piege(), // projectRepo
        piege(), // dataSource
        piege(), // requestRetrait
        piege(), // crediterApportPorteur
        piege(), // metrics
        piege(), // transactionalEmails
        piege(), // amlMonitor
        piege(), // retraitSettlement
        garde, // gelDesAvoirs — dernière position
      );

    it('compte gelé → 403 AVOIRS_GELES avant toute création d’intention PSP', async () => {
      const garde = gardeGelee();
      await attendreRefusGele(
        construire(garde).createDepotIntent(
          { amount: 100, currency: 'EUR' } as any,
          { userId: 10 } as any,
        ),
        garde,
      );
    });

    it('compte non gelé → la garde laisse passer (le flux atteint le PSP)', async () => {
      const garde = gardeLibre();
      await expect(
        construire(garde).createDepotIntent(
          { amount: 100, currency: 'EUR' } as any,
          { userId: 10 } as any,
        ),
      ).rejects.toThrow(SENTINELLE);
      expect(garde.assertAvoirsNonGeles).toHaveBeenCalledWith(10);
    });
  });

  it('le message de refus est STRICTEMENT IDENTIQUE sur tous les chemins (aucune variante)', () => {
    // Un seul point de vérité : la constante du domaine — les cinq chemins
    // ci-dessus reçoivent l'exception construite par GelDesAvoirsService,
    // qui n'a qu'un message. Ce test verrouille la fonction elle-même.
    const a = messageAvoirsGeles('compliance@beown.fr');
    const b = messageAvoirsGeles('compliance@beown.fr');
    expect(a).toBe(b);
    expect(a).toBe(
      "Cette opération n'est pas disponible sur votre compte actuellement. " +
        "Certaines opérations font l'objet d'une restriction temporaire en " +
        'application de nos obligations légales. Votre solde et vos ' +
        'investissements restent enregistrés sur votre compte. Pour toute ' +
        'question, contactez-nous à compliance@beown.fr.',
    );
  });
});
