import { CreateInvestmentUseCase } from 'src/investments/applications/usecases/create-investment.usecase';
import { InitiateInvestmentUseCase } from 'src/investments/applications/usecases/initiate-investment.usecase';
import { TopUpInvestmentUseCase } from 'src/investments/applications/usecases/top-up-investment.usecase';
import { CreateReservationUseCase } from 'src/reservations/applications/usecases/create-reservation.usecase';
import { InitiateBuyUseCase } from 'src/secondarymarket/applications/usecases/initiate-buy.usecase';
import { ExprimerInteretUseCase } from 'src/secondarymarket/applications/usecases/exprimer-interet.usecase';
import { RepondreInteretUseCase } from 'src/secondarymarket/applications/usecases/repondre-interet.usecase';
import { CreateProjectUseCase } from 'src/projects/applications/usecases/create-project.usecase';
import { ConflitsInteretsService } from './conflits-interets.service';
import {
  DetenteurDePartsDeLaSocieteSupportError,
  PorteurDeSonPropreProjetError,
} from 'src/projects/domains/errors/conflits-interets.errors';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { statutHttpDeLErreur } from 'src/common/audit/statut-erreur-metier';

/**
 * Contrat transversal de la décision fondateur D5 : un porteur ne peut PAS
 * investir dans SON propre projet.
 *
 * Les SEPT portes par lesquelles de l'argent — ou l'engagement d'en verser —
 * entre sur un projet appellent la même garde centralisée, et la refusent au
 * porteur de ce projet précis. La règle n'est écrite qu'une fois
 * (`ConflitsInteretsService`) : ce fichier prouve qu'aucune porte ne l'a
 * oubliée, et que la huitième — le rattachement d'un porteur — tient le sens
 * inverse.
 *
 * Technique : le service de conflits est RÉEL (seuls ses ports sont simulés),
 * les collaborateurs qui viennent APRÈS la garde jettent SENTINELLE. Porteur du
 * projet → refus 403 à code stable. Toute autre personne → l'exécution dépasse
 * la garde et tombe sur SENTINELLE, preuve que la garde ne bloque personne
 * d'autre.
 */
const SENTINELLE = new Error('SENTINELLE: collaborateur atteint après la garde');

/** Proxy qui jette SENTINELLE sur n'importe quel appel de méthode. */
const piege = (): any =>
  new Proxy(
    {},
    {
      get: () => () => {
        throw SENTINELLE;
      },
    },
  );

const PORTEUR_ID = 42;
const AUTRE_PORTEUR_ID = 7;
const INVESTISSEUR_ID = 99;
const PROJET_ID = 'projet-1';
const INVESTISSEMENT_VENDEUR_ID = 'inv-vendeur';

/** Projet minimal exploitable par les flux primaires, porté par PORTEUR_ID. */
const projet = (statut: ProjectStatus) => ({
  id: PROJET_ID,
  porteurId: PORTEUR_ID,
  statut,
  titre: 'Résidence Les Jardins',
  ville: 'Lyon',
  pays: 'FR',
  instrument: 'part_sociale',
  capitalCible: 100_000,
  ticketMinimum: 100,
  ticketMaximum: null,
  nbFractions: 1000,
  prixFraction: 100,
  triCible: 8,
  dureeMois: 24,
  estPreInvestissable: true,
  plafondPreInvestissement: null,
});

/**
 * Service RÉEL — c'est lui qui décide. Ses ports sont les seuls doubles :
 * le projet est porté par PORTEUR_ID, l'investissement du vendeur pointe
 * dessus, et aucune détention n'est constatée sauf demande contraire.
 */
const serviceConflits = (detention = false) =>
  new ConflitsInteretsService(
    { findOne: jest.fn() } as any,
    { findOne: jest.fn() } as any,
    {
      findProjectById: jest.fn(async () => projet(ProjectStatus.EN_COLLECTE)),
    } as any,
    {
      findInvestmentById: jest.fn(async () => ({
        id: INVESTISSEMENT_VENDEUR_ID,
        projetId: PROJET_ID,
      })),
      existeDetentionSurSocieteSupport: jest.fn(async () => detention),
    } as any,
  );

/** Refus attendu : 403, code stable, journalisé comme tel. */
const attendreRefus = async (promesse: Promise<unknown>) => {
  const err: unknown = await promesse.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PorteurDeSonPropreProjetError);
  expect((err as PorteurDeSonPropreProjetError).code).toBe(
    'CONFLIT_INTERETS_PORTEUR_DU_PROJET',
  );
  // Le journal d'audit doit écrire le statut réellement envoyé au client.
  expect(statutHttpDeLErreur(err)).toBe(403);
};

describe('Décision D5 — les sept portes d’entrée refusent le porteur du projet', () => {
  describe('1. Souscription directe (CreateInvestmentUseCase)', () => {
    const construire = () =>
      new CreateInvestmentUseCase(
        piege(), // investmentRepository
        {
          findProjectById: jest.fn(async () => projet(ProjectStatus.EN_COLLECTE)),
        } as any,
        piege(), // walletRepository
        piege(), // documentRepository
        piege(), // userRepository
        piege(), // profilRepository — premier collaborateur APRÈS la garde
        piege(), // contractGenerator
        piege(), // cloudStorage
        piege(), // notificationService
        piege(), // notificationEvents
        piege(), // dataSource
        piege(), // metrics
        piege(), // projectWalletResolver
        piege(), // amlMonitor
        piege(), // bonusParrainage
        { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
        serviceConflits(),
      );

    const souscrire = (userId: number) =>
      construire().execute(userId, {
        projetId: PROJET_ID,
        nbFractions: 1,
      } as any);

    it('le porteur du projet est refusé (403, code stable)', async () => {
      await attendreRefus(souscrire(PORTEUR_ID));
    });

    it('CONTRE-ÉPREUVE : le porteur d’un AUTRE projet passe la garde', async () => {
      await expect(souscrire(AUTRE_PORTEUR_ID)).rejects.toThrow(SENTINELLE);
    });

    it('CONTRE-ÉPREUVE : un investisseur ordinaire passe la garde', async () => {
      await expect(souscrire(INVESTISSEUR_ID)).rejects.toThrow(SENTINELLE);
    });
  });

  describe('2. Souscription signée (InitiateInvestmentUseCase)', () => {
    const construire = () =>
      new InitiateInvestmentUseCase(
        {
          findOne: jest.fn(async () => projet(ProjectStatus.EN_COLLECTE)),
        } as any, // projectRepo
        piege(), // investRepo — premier collaborateur APRÈS la garde
        piege(), // documentRepo
        piege(), // signatureRepo
        piege(), // walletRepo
        piege(), // userRepo
        piege(), // userEmailRepo
        piege(), // cloudStorage
        piege(), // contractGenerator
        piege(), // signatureProvider
        serviceConflits(),
      );

    it('le porteur du projet est refusé', async () => {
      await attendreRefus(construire().execute(PORTEUR_ID, PROJET_ID, 1));
    });

    it('CONTRE-ÉPREUVE : un autre porteur et un investisseur passent', async () => {
      await expect(
        construire().execute(AUTRE_PORTEUR_ID, PROJET_ID, 1),
      ).rejects.toThrow(SENTINELLE);
      await expect(
        construire().execute(INVESTISSEUR_ID, PROJET_ID, 1),
      ).rejects.toThrow(SENTINELLE);
    });
  });

  describe('3. Ajout de fractions (TopUpInvestmentUseCase)', () => {
    const construire = (userId: number) =>
      new TopUpInvestmentUseCase(
        {
          findInvestmentById: jest.fn(async () => ({
            id: 'inv-1',
            utilisateurId: userId,
            projetId: PROJET_ID,
            statut: InvestmentStatus.CONFIRME,
            nbTitres: 5,
            montant: 500,
            valeurTitre: 100,
          })),
          // Premier collaborateur APRÈS la garde.
          countFractionsVendues: jest.fn(() => {
            throw SENTINELLE;
          }),
        } as any,
        {
          findProjectById: jest.fn(async () => projet(ProjectStatus.EN_COLLECTE)),
        } as any,
        piege(), // walletRepository
        piege(), // documentRepository
        piege(), // userRepository
        piege(), // contractGenerator
        piege(), // cloudStorage
        piege(), // notificationService
        piege(), // notificationEvents
        piege(), // dataSource
        piege(), // projectWalletResolver
        serviceConflits(),
      );

    it('le porteur du projet ne peut pas renforcer sa position dessus', async () => {
      await attendreRefus(construire(PORTEUR_ID).execute('inv-1', PORTEUR_ID, 1));
    });

    it('CONTRE-ÉPREUVE : tout autre détenteur passe la garde', async () => {
      await expect(
        construire(INVESTISSEUR_ID).execute('inv-1', INVESTISSEUR_ID, 1),
      ).rejects.toThrow(SENTINELLE);
    });
  });

  describe('4. Réservation / pré-investissement (CreateReservationUseCase)', () => {
    const construire = () =>
      new CreateReservationUseCase(
        piege(), // reservationRepository — premier appel APRÈS la garde
        {
          findProjectById: jest.fn(async () => projet(ProjectStatus.ANNONCE)),
        } as any,
        serviceConflits(),
      );

    const reserver = (userId: number) =>
      construire().execute(userId, { projetId: PROJET_ID, montant: 500 } as any);

    it('le porteur du projet ne réserve pas sur sa propre collecte', async () => {
      await attendreRefus(reserver(PORTEUR_ID));
    });

    it('CONTRE-ÉPREUVE : un autre porteur et un investisseur passent', async () => {
      await expect(reserver(AUTRE_PORTEUR_ID)).rejects.toThrow(SENTINELLE);
      await expect(reserver(INVESTISSEUR_ID)).rejects.toThrow(SENTINELLE);
    });
  });

  describe('5. Marché secondaire — initiation d’achat (InitiateBuyUseCase)', () => {
    const construire = () =>
      new InitiateBuyUseCase(
        {
          findOne: jest.fn(async () => ({
            id: 'ordre-1',
            statut: OrdreMarcheStatus.ACCEPTE,
            vendeurId: 1,
            nbFractions: 5,
            prixUnitaire: 100,
            investissementId: INVESTISSEMENT_VENDEUR_ID,
            investissement: {
              id: INVESTISSEMENT_VENDEUR_ID,
              projetId: PROJET_ID,
              projet: projet(ProjectStatus.EN_COLLECTE),
            },
          })),
        } as any,
        piege(), // investRepo
        piege(), // documentRepo
        piege(), // signatureRepo
        piege(), // walletRepo — premier collaborateur APRÈS la garde
        piege(), // userRepo
        piege(), // userEmailRepo
        piege(), // cloudStorage
        piege(), // contractGenerator
        piege(), // signatureProvider
        { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
        serviceConflits(),
      );

    it('le porteur du projet ne rachète pas les parts de sa société support', async () => {
      await attendreRefus(construire().execute('ordre-1', PORTEUR_ID, 2));
    });

    it('CONTRE-ÉPREUVE : tout autre acheteur passe la garde', async () => {
      await expect(
        construire().execute('ordre-1', INVESTISSEUR_ID, 2),
      ).rejects.toThrow(SENTINELLE);
    });
  });

  describe('6. Marché secondaire — marque d’intérêt (ExprimerInteretUseCase)', () => {
    const construire = () =>
      new ExprimerInteretUseCase(
        {
          findOne: jest.fn(async () => ({
            id: 'ordre-1',
            statut: OrdreMarcheStatus.EN_CARNET,
            vendeurId: 1,
            nbFractions: 5,
            prixUnitaire: 100,
            valideJusquAu: null,
            investissementId: INVESTISSEMENT_VENDEUR_ID,
          })),
        } as any,
        piege(), // walletRepo — premier collaborateur APRÈS la garde
        piege(), // investRepo
        piege(), // notifications
        piege(), // devisCession
        { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
        serviceConflits(),
      );

    it('le porteur du projet ne sollicite pas le vendeur de ses propres parts', async () => {
      await attendreRefus(construire().execute('ordre-1', PORTEUR_ID, 2));
    });

    it('CONTRE-ÉPREUVE : tout autre acheteur passe la garde', async () => {
      await expect(
        construire().execute('ordre-1', INVESTISSEUR_ID, 2),
      ).rejects.toThrow(SENTINELLE);
    });
  });

  describe('7. Marché secondaire — acceptation du vendeur (RepondreInteretUseCase)', () => {
    // Le vendeur répond, mais c'est l'ACHETEUR qui acquiert et qui est débité :
    // la garde vise donc l'acheteur désigné par l'annonce, jamais l'appelant.
    const construire = (acheteurId: number) =>
      new RepondreInteretUseCase(
        {
          findOne: jest.fn(async () => ({
            id: 'ordre-1',
            statut: OrdreMarcheStatus.INTERET_EXPRIME,
            vendeurId: 1,
            acheteurId,
            interetNbFractions: 3,
            prixUnitaire: 100,
            investissementId: INVESTISSEMENT_VENDEUR_ID,
          })),
          // Premier collaborateur APRÈS la garde : la transition ACCEPTE.
          createQueryBuilder: jest.fn(() => {
            throw SENTINELLE;
          }),
        } as any,
        piege(), // initiateBuy
        piege(), // notifications
        piege(), // compensation
        serviceConflits(),
      );

    it('refuse quand l’ACHETEUR est le porteur du projet — le vendeur, lui, est hors de cause', async () => {
      // Appelant = vendeur (1), acheteur = porteur du projet.
      await attendreRefus(construire(PORTEUR_ID).accepter('ordre-1', 1));
    });

    it('CONTRE-ÉPREUVE : un acheteur ordinaire laisse l’acceptation suivre son cours', async () => {
      await expect(
        construire(INVESTISSEUR_ID).accepter('ordre-1', 1),
      ).rejects.toThrow(SENTINELLE);
    });
  });
});

describe('Décision D5, SENS INVERSE — rattachement d’un porteur (CreateProjectUseCase)', () => {
  const construire = (detention: boolean) =>
    new CreateProjectUseCase(
      {
        findProjectBySlug: jest.fn(async () => null),
        findOffresPorteurDepuis: jest.fn(async () => []),
        saveProject: jest.fn(async (p: unknown) => p),
      } as any,
      serviceConflits(detention),
    );

  const dto = () =>
    ({
      titre: 'Résidence Les Jardins',
      spvId: 'spv-1',
      type: 'residentiel',
      capitalCible: 600_000,
      capitalMinimum: 360_000,
      dureeMois: 36,
      instrument: 'part_sociale',
    }) as any;

  it('refuse le candidat qui détient déjà des parts de la société support (409)', async () => {
    const erreur = await construire(true)
      .execute(dto(), PORTEUR_ID)
      .catch((e) => e);

    expect(erreur).toBeInstanceOf(DetenteurDePartsDeLaSocieteSupportError);
    expect(erreur.code).toBe('CONFLIT_INTERETS_DETENTION_SOCIETE_SUPPORT');
    // Refus d'ÉTAT, pas d'identité : céder ses parts lèverait l'obstacle.
    expect(statutHttpDeLErreur(erreur)).toBe(409);
  });

  it('CONTRE-ÉPREUVE : sans détention, le projet est bien créé et rattaché', async () => {
    const projetCree: any = await construire(false).execute(dto(), PORTEUR_ID);
    expect(projetCree.porteurId).toBe(PORTEUR_ID);
  });

  it('un projet sans société support n’est pas concerné par la réciproque', async () => {
    // `detention: true` mais `spvId` absent : il n'y a pas d'émetteur commun à
    // constater, la règle n'a pas d'objet.
    const sansSpv = { ...dto(), spvId: undefined };
    const projetCree: any = await construire(true).execute(sansSpv, PORTEUR_ID);
    expect(projetCree.porteurId).toBe(PORTEUR_ID);
  });
});

describe('Câblage — chaque module gardé importe le fournisseur de la règle', () => {
  // Les tests ci-dessus construisent les use cases à la main : ils prouvent la
  // règle, pas l'injection. Un module qui oublierait l'import ne planterait
  // qu'au démarrage de l'application. Ce garde-fou lit les métadonnées réelles
  // des modules et le dit tout de suite.
  it.each([
    ['InvestmentsModule', () => require('src/investments/applications/investments.module').InvestmentsModule],
    ['ReservationsModule', () => require('src/reservations/applications/reservations.module').ReservationsModule],
    ['SecondaryMarketModule', () => require('src/secondarymarket/applications/secondary-market.module').SecondaryMarketModule],
    ['ProjectsModule', () => require('src/projects/applications/projects.module').ProjectsModule],
  ])('%s importe ConflitsInteretsModule', (_nom, charger) => {
    const {
      ConflitsInteretsModule,
    } = require('./conflits-interets.module') as {
      ConflitsInteretsModule: unknown;
    };
    const imports: unknown[] =
      Reflect.getMetadata('imports', charger() as object) ?? [];
    expect(imports).toContain(ConflitsInteretsModule);
  });
});
