import { BadRequestException } from '@nestjs/common';
import { RepondreInteretUseCase } from './repondre-interet.usecase';
import { InitiateBuyUseCase } from './initiate-buy.usecase';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { SignatureProviderUnavailableError } from 'src/common/yousign/signature-provider.error';
import { ConflitsInteretsService } from 'src/projects/applications/conflits-interets.service';
import { PorteurDeSonPropreProjetError } from 'src/projects/domains/errors/conflits-interets.errors';

/**
 * Intégration des deux use cases du parcours de cession — ANO-01.
 *
 * `repondre-interet.usecase.spec.ts` remplace `InitiateBuyUseCase` par un
 * `jest.fn()` : il vérifie la délégation, jamais l'accord des contrats entre
 * les deux étapes. C'est ce trou qui a laissé passer une précondition de
 * statut incompatible — l'acceptation écrit ACCEPTE, l'initiation n'acceptait
 * que EN_CARNET — et rendu le marché secondaire inaboutissable par tout
 * chemin, sans qu'aucune des 147 suites ne le voie.
 *
 * Ici les deux use cases sont réels et partagent le MÊME dépôt d'ordres :
 * l'écriture de statut faite par l'acceptation est donc bien celle que relit
 * l'initiation. Seules les dépendances externes (PDF, stockage, prestataire de
 * signature, autres dépôts) sont simulées.
 */
describe('Acceptation vendeur → initiation de cession (intégration)', () => {
  const ORDRE_ID = 'ordre-1';
  const VENDEUR_ID = 1;
  const ACHETEUR_ID = 42;

  const construireOrdre = () => ({
    id: ORDRE_ID,
    investissementId: 'inv-vendeur',
    vendeurId: VENDEUR_ID,
    acheteurId: ACHETEUR_ID,
    statut: OrdreMarcheStatus.INTERET_EXPRIME,
    nbFractions: 5,
    interetNbFractions: 3,
    interetExprimeLe: new Date('2026-08-01T10:00:00.000Z'),
    prixUnitaire: 100,
    montant: 500,
    investissement: {
      id: 'inv-vendeur',
      projetId: 'projet-1',
      projet: {
        id: 'projet-1',
        titre: 'Résidence Cocody',
        ville: 'Abidjan',
        pays: 'CI',
        triCible: 8,
        dureeMois: 24,
      },
    },
  });

  /**
   * Dépôt d'ordres en mémoire, partagé par les deux use cases.
   *
   * `createQueryBuilder().update().set().where().execute()` applique réellement
   * la clause `WHERE statut = :attendu` : une transition conditionnelle qui ne
   * correspond pas laisse l'ordre intact et renvoie `affected: 0`, comme en
   * base. C'est indispensable pour que la compensation soit testée pour ce
   * qu'elle est.
   */
  const construireDepotOrdres = (ordre: any) => ({
    findOne: jest.fn(async () => ordre),
    createQueryBuilder: jest.fn(() => {
      let valeurs: any = null;
      let attendu: any = null;
      const qb: any = {
        update: jest.fn(() => qb),
        set: jest.fn((v: any) => {
          valeurs = v;
          return qb;
        }),
        where: jest.fn((_clause: string, params: any) => {
          attendu = params;
          return qb;
        }),
        execute: jest.fn(async () => {
          const statutAttendu = attendu?.enAttente ?? attendu?.accepte;
          if (attendu?.id !== ordre.id || ordre.statut !== statutAttendu) {
            return { affected: 0 };
          }
          Object.assign(ordre, valeurs);
          return { affected: 1 };
        }),
      };
      return qb;
    }),
  });

  const construire = (
    {
      ordre = construireOrdre(),
      erreurYousign = null,
      porteurDuProjet = VENDEUR_ID,
    }: {
      ordre?: any;
      erreurYousign?: Error | null;
      porteurDuProjet?: number | null;
    } = {},
  ) => {
    const ordreRepo = construireDepotOrdres(ordre);

    // Service de conflits d'intérêts RÉEL, partagé par les deux use cases —
    // même raison que le dépôt d'ordres : c'est l'accord des deux étapes qu'on
    // veut éprouver, pas la délégation à un `jest.fn()`. Seuls ses ports sont
    // simulés. Par défaut le porteur est le VENDEUR : personne n'est en
    // conflit, les scénarios historiques sont inchangés.
    const conflitsInterets = new ConflitsInteretsService(
      { findOne: jest.fn(async () => null) } as any, // userRepo (art. 8)
      { findOne: jest.fn(async () => null) } as any, // profilRepo (art. 8)
      {
        findProjectById: jest.fn(async () => ({
          id: 'projet-1',
          porteurId: porteurDuProjet,
        })),
      } as any,
      {
        findInvestmentById: jest.fn(async () => ({
          id: 'inv-vendeur',
          projetId: 'projet-1',
        })),
      } as any,
    );

    const signaturesEnregistrees: any[] = [];
    const initiateBuy = new InitiateBuyUseCase(
      ordreRepo as any,
      // investRepo — l'acheteur n'a pas encore investi sur ce projet (cas B).
      { findOne: jest.fn(async () => null) } as any,
      // documentRepo
      {
        create: jest.fn((d: any) => d),
        save: jest.fn(async (d: any) => ({ ...d, id: 'doc-1' })),
      } as any,
      // signatureRepo
      {
        create: jest.fn((s: any) => s),
        save: jest.fn(async (s: any) => {
          const saved = { ...s, id: 'sig-1' };
          signaturesEnregistrees.push(saved);
          return saved;
        }),
      } as any,
      // walletRepo — l'acheteur est solvable.
      { findOne: jest.fn(async () => ({ solde: 10_000 })) } as any,
      // userRepo
      {
        findOne: jest.fn(async () => ({
          userId: ACHETEUR_ID,
          firstname: 'Ibrahima',
          lastname: 'Ba',
        })),
      } as any,
      // userEmailRepo
      { findOne: jest.fn(async () => ({ email: 'ibrahima@example.test' })) } as any,
      // cloudStorage
      {
        upload: jest.fn(async () => ({
          objectName: 'contrats/contrat.pdf',
          publicUrl: 'https://stockage.example/contrats/contrat.pdf',
        })),
      } as any,
      // contractGenerator
      {
        generateContratRachat: jest.fn(async () => Buffer.from('%PDF-1.4 contrat')),
      } as any,
      // youSignService
      {
        createEmbeddedSignatureRequest: jest.fn(async () => {
          if (erreurYousign) throw erreurYousign;
          return {
            requestId: 'ys-req-1',
            signerId: 'ys-signer-1',
            signingUrl: 'https://yousign.example/sign/abc',
          };
        }),
      } as any,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
      conflitsInterets,
    );

    const notifications = { push: jest.fn() };
    // Réservation des fonds : simulée, avec une position d'acheteur réelle pour
    // que blocage et libération se compensent réellement dans les scénarios de
    // compensation ci-dessous.
    const position = { disponible: 10_000, bloque: 0 };
    const compensation = {
      reserverFonds: jest.fn(async (_acheteurId: number, montant: number) => {
        if (position.disponible < montant) {
          throw new Error('Solde insuffisant');
        }
        position.disponible -= montant;
        position.bloque += montant;
      }),
      libererFonds: jest.fn(async (_acheteurId: number, montant: number) => {
        if (position.bloque < montant) return 0;
        position.bloque -= montant;
        position.disponible += montant;
        return montant;
      }),
    };
    const repondre = new RepondreInteretUseCase(
      ordreRepo as any,
      initiateBuy,
      notifications as any,
      compensation as any,
      conflitsInterets,
    );

    return {
      repondre,
      initiateBuy,
      ordre,
      ordreRepo,
      notifications,
      compensation,
      position,
      signaturesEnregistrees,
    };
  };

  it("l'acceptation du vendeur produit un parcours de signature (aucun 400 « ordre indisponible »)", async () => {
    const { repondre, ordre, signaturesEnregistrees } = construire();

    const resultat = await repondre.accepter(ORDRE_ID, VENDEUR_ID);

    expect(resultat).toEqual({
      ordreId: ORDRE_ID,
      signingUrl: 'https://yousign.example/sign/abc',
      signatureId: 'sig-1',
    });
    // L'ordre reste ACCEPTE : la cession est engagée, l'annonce n'est plus
    // ni réservable ni exprimable par un tiers.
    expect(ordre.statut).toBe(OrdreMarcheStatus.ACCEPTE);
    // La signature porte bien l'ordre, l'acheteur et la quantité de l'intérêt.
    expect(signaturesEnregistrees).toHaveLength(1);
    expect(signaturesEnregistrees[0]).toMatchObject({
      ordreId: ORDRE_ID,
      userId: ACHETEUR_ID,
      nbFractions: 3,
      youSignRequestId: 'ys-req-1',
    });
  });

  it("l'initiation accepte le statut que l'acceptation vient d'écrire — préconditions alignées", async () => {
    const { initiateBuy, ordre } = construire();

    // On rejoue la transition faite par `accepter`, puis on appelle
    // directement l'initiation : si sa précondition redevient incompatible
    // avec ACCEPTE, ce test échoue, quel que soit l'état du use case appelant.
    ordre.statut = OrdreMarcheStatus.ACCEPTE;

    await expect(
      initiateBuy.execute(ORDRE_ID, ACHETEUR_ID, 3),
    ).resolves.toMatchObject({ signatureId: 'sig-1' });
  });

  it("aucune cession ne s'initie sans l'accord du vendeur (annonce encore en carnet)", async () => {
    const { initiateBuy, ordre } = construire();
    ordre.statut = OrdreMarcheStatus.EN_CARNET;

    await expect(
      initiateBuy.execute(ORDRE_ID, ACHETEUR_ID, 3),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("si le prestataire de signature tombe, l'annonce revient en interet_exprime et reste répondable", async () => {
    const { repondre, ordre } = construire({
      erreurYousign: new Error('YouSign indisponible'),
    });

    await expect(repondre.accepter(ORDRE_ID, VENDEUR_ID)).rejects.toThrow(
      'YouSign indisponible',
    );

    // Compensation effective : la clause conditionnelle du retour arrière a
    // bien trouvé l'ordre en ACCEPTE et l'a ramené en attente de réponse.
    expect(ordre.statut).toBe(OrdreMarcheStatus.INTERET_EXPRIME);
  });

  // ── F-02 : abonnement Yousign expiré, reproduit en conditions réelles ──────

  const panneAbonnementExpire = () =>
    new SignatureProviderUnavailableError({
      operation: 'POST /signature_requests',
      motif: 'authentification_refusee',
      statutFournisseur: 401,
      detailFournisseur:
        '{"detail":"You are not authorized to perform this action, please contact ' +
        'our sales team to check your subscription and the validity of your trial period."}',
    });

  it("l'indisponibilité du prestataire remonte TYPÉE, pour que la couche HTTP réponde 503 et non 500", async () => {
    const { repondre } = construire({ erreurYousign: panneAbonnementExpire() });

    const erreur = await repondre
      .accepter(ORDRE_ID, VENDEUR_ID)
      .catch((e) => e);

    // C'est ce type, et lui seul, que le filtre du contrôleur intercepte.
    expect(erreur).toBeInstanceOf(SignatureProviderUnavailableError);
    expect(erreur.code).toBe('SIGNATURE_PROVIDER_UNAVAILABLE');
  });

  it("la compensation reste jouée sur une panne prestataire : rien de perdu, le vendeur peut réessayer", async () => {
    const { repondre, ordre, signaturesEnregistrees } = construire({
      erreurYousign: panneAbonnementExpire(),
    });

    await expect(repondre.accepter(ORDRE_ID, VENDEUR_ID)).rejects.toBeInstanceOf(
      SignatureProviderUnavailableError,
    );

    expect(ordre.statut).toBe(OrdreMarcheStatus.INTERET_EXPRIME);
    // La marque d'intérêt est intacte : quantité, acheteur, date.
    expect(ordre.interetNbFractions).toBe(3);
    expect(ordre.acheteurId).toBe(ACHETEUR_ID);
    // Aucune signature n'a été ouverte : rien à annuler, rien à nettoyer.
    expect(signaturesEnregistrees).toHaveLength(0);
  });

  it("une acceptation compensée ne prévient PAS l'acheteur d'un accord qui n'existe pas", async () => {
    const { repondre, notifications } = construire({
      erreurYousign: panneAbonnementExpire(),
    });

    await expect(repondre.accepter(ORDRE_ID, VENDEUR_ID)).rejects.toBeInstanceOf(
      SignatureProviderUnavailableError,
    );

    expect(notifications.push).not.toHaveBeenCalled();
  });

  it("une acceptation réussie prévient bien l'acheteur", async () => {
    const { repondre, notifications } = construire();

    await repondre.accepter(ORDRE_ID, VENDEUR_ID);

    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ utilisateurId: ACHETEUR_ID }),
    );
  });

  it("les fonds de l'acheteur sont bloqués dès l'acceptation, pas au règlement", async () => {
    const { repondre, position } = construire();

    await repondre.accepter(ORDRE_ID, VENDEUR_ID);

    // 3 fractions × 100 € : le montant quitte la poche disponible sans quitter
    // le portefeuille — les fonds détenus sont inchangés.
    expect(position.bloque).toBe(300);
    expect(position.disponible).toBe(9_700);
    expect(position.bloque + position.disponible).toBe(10_000);
  });

  it('une panne prestataire rend les fonds : rien ne reste bloqué sur une cession non initiée', async () => {
    const { repondre, position } = construire({
      erreurYousign: panneAbonnementExpire(),
    });

    await expect(repondre.accepter(ORDRE_ID, VENDEUR_ID)).rejects.toBeInstanceOf(
      SignatureProviderUnavailableError,
    );

    expect(position.bloque).toBe(0);
    expect(position.disponible).toBe(10_000);
  });

  it("une annonce déjà acceptée ne peut pas être acceptée deux fois", async () => {
    const { repondre, ordre } = construire();
    ordre.statut = OrdreMarcheStatus.ACCEPTE;

    await expect(repondre.accepter(ORDRE_ID, VENDEUR_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ── Conflits d'intérêts sur le parcours complet (décision D5) ─────────────
  //
  // La garde est posée aux deux étapes ; ce qui compte ici, c'est qu'un refus
  // à la première n'abandonne RIEN derrière lui — ni annonce coincée en
  // ACCEPTE, ni euro bloqué sur un acheteur qui ne peut pas acheter.

  it("l'acheteur porteur du projet est refusé : aucun fonds bloqué, l'annonce reste répondable", async () => {
    const { repondre, position, ordre, signaturesEnregistrees } = construire({
      porteurDuProjet: ACHETEUR_ID,
    });

    await expect(
      repondre.accepter(ORDRE_ID, VENDEUR_ID),
    ).rejects.toBeInstanceOf(PorteurDeSonPropreProjetError);

    // Refus AVANT la réservation : rien n'a bougé sur le portefeuille.
    expect(position.bloque).toBe(0);
    expect(position.disponible).toBe(10_000);
    // Ni sur l'annonce, qui n'a jamais quitté l'attente de réponse.
    expect(ordre.statut).toBe(OrdreMarcheStatus.INTERET_EXPRIME);
    // Et aucun contrat n'a été émis : l'initiation n'a pas été atteinte.
    expect(signaturesEnregistrees).toHaveLength(0);
  });

  it('CONTRE-ÉPREUVE : le vendeur porteur du projet ne bloque pas la cession', async () => {
    // La garde vise l'ACHETEUR. Un vendeur qui se trouve être le porteur cède
    // ses propres parts : c'est une sortie, pas une entrée d'argent.
    const { repondre, position } = construire({ porteurDuProjet: VENDEUR_ID });

    await expect(
      repondre.accepter(ORDRE_ID, VENDEUR_ID),
    ).resolves.toMatchObject({ ordreId: ORDRE_ID });
    expect(position.bloque).toBe(300);
  });
});
