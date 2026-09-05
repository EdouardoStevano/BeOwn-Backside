import { YouSignWebhookController } from './yousign-webhook.controller';
import { FinalizeSignedContractUseCase } from 'src/signatures/applications/usecases/finalize-signed-contract.usecase';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  grandLivreEquilibre,
  mouvementsDepuisInstantanes,
  variationTotale,
} from 'src/wallets/domains/grand-livre';
import type { PositionWallet } from 'src/wallets/domains/grand-livre';

/**
 * Régression sécurité (fix paiements) : la signature n'est marquée SIGNED
 * qu'APRÈS l'exécution atomique. Ces tests couvrent la branche souscription
 * initiale (ordreId = null) via un EntityManager simulé.
 */
describe('YouSignWebhookController.handleSignatureDone (atomicité SIGNED)', () => {
  const REQ_ID = 'ys-req-1';

  function makeChainableQb() {
    const qb: any = {};
    qb.select = () => qb;
    qb.where = () => qb;
    qb.andWhere = () => qb;
    qb.getRawOne = async () => ({ total: '0' });
    return qb;
  }

  /**
   * Fabrique le contrôleur + le store partagé. `lockedSignature` permet de
   * simuler une relecture SOUS VERROU qui diffère de la lecture pré-transaction
   * (livraison concurrente déjà committée).
   */
  function setup(opts: {
    solde: number;
    preTxSignature: Partial<SignatureEntity>;
    lockedSignature?: Partial<SignatureEntity>;
    /**
     * Surcharges du projet lié à la souscription — sert notamment à jouer le
     * modèle économique (obligataire / equity). `undefined` reproduit une ligne
     * antérieure à l'ajout de la colonne.
     */
    project?: Partial<ProjectEntity>;
  }) {
    const signature: any = {
      id: 'sig-1',
      youSignRequestId: REQ_ID,
      statut: SignatureStatus.PENDING,
      ordreId: null,
      investmentId: 'inv-1',
      documentId: null,
      userId: 1,
      signedAt: null,
      ...opts.preTxSignature,
    };
    const lockedSignature: any =
      opts.lockedSignature === undefined
        ? signature
        : { ...signature, ...opts.lockedSignature };

    const investment: any = {
      id: 'inv-1',
      statut: InvestmentStatus.INITIE,
      montant: 100,
      utilisateurId: 1,
      projetId: 'proj-1',
      nbTitres: 1,
    };
    const wallet: any = {
      id: 'w-1',
      solde: opts.solde,
      devise: 'EUR',
      proprietaireUserId: 1,
      type: WalletType.INVESTISSEUR,
    };
    const project: any = {
      id: 'proj-1',
      triCible: 0,
      dureeMois: 12,
      ticketMinimum: 100,
      nbFractions: 10,
      capitalCible: 1000,
      titre: 'Projet Test',
      ...opts.project,
    };

    const manager: any = {
      findOne: jest.fn(async (Entity: any) => {
        if (Entity === SignatureEntity) return lockedSignature;
        if (Entity === InvestmentEntity) return investment;
        if (Entity === ProjectEntity) return project;
        if (Entity === WalletEntity) return wallet;
        return null;
      }),
      save: jest.fn(async (_Entity: any, obj: any) => obj),
      create: jest.fn((_Entity: any, obj: any) => obj),
      update: jest.fn(async () => ({})),
      createQueryBuilder: jest.fn(() => makeChainableQb()),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    const signatureRepo: any = { findOne: jest.fn(async () => signature), save: jest.fn() };
    const noopRepo: any = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
    const youSignService: any = {
      downloadSignedDocument: jest.fn(async () => Buffer.from('pdf')),
    };
    const cloudStorage: any = {
      upload: jest.fn(async () => ({ objectName: 'o', publicUrl: 'u' })),
    };
    const notificationService: any = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    const notificationEvents: any = { investmentCreated: jest.fn() };
    const userRepository: any = { findById: jest.fn(async () => ({ userId: 1 })) };
    const platformFees: any = { getRates: jest.fn(), computeResaleFees: jest.fn() };
    const metrics: any = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    const expirerSignature: any = {
      parRequeteFournisseur: jest.fn().mockResolvedValue('noop'),
      execute: jest.fn().mockResolvedValue('noop'),
    };

    // Le règlement atomique vit désormais dans FinalizeSignedContractUseCase
    // (extraction verbatim hors du presenter) : c'est LUI que ces tests
    // exercent — le contrôleur ne fait plus que router le webhook vers lui.
    const finalize = new FinalizeSignedContractUseCase(
      signatureRepo,
      noopRepo, // ordreRepo (branche souscription initiale : inutilisé)
      noopRepo, // projectRepo
      noopRepo, // documentRepo
      dataSource,
      youSignService,
      notificationService,
      cloudStorage,
      userRepository,
      notificationEvents,
      platformFees,
      metrics,
    );
    const controller = new YouSignWebhookController(
      youSignService,
      metrics,
      expirerSignature,
      finalize,
    );

    return { controller, finalize, signature, lockedSignature, investment, wallet, project, dataSource, manager, notificationEvents, expirerSignature };
  }

  it('laisse la signature PENDING quand l\'exécution échoue (rejouable), puis réussit au rejeu', async () => {
    // Solde insuffisant → executeInvestmentSignature lève avant tout write.
    const ctx = setup({ solde: 50, preTxSignature: {} });

    await expect(ctx.finalize.execute(REQ_ID)).rejects.toThrow(
      /Solde insuffisant/,
    );

    // La signature n'a PAS été marquée SIGNED → un rejeu du webhook ré-exécute.
    expect(ctx.signature.statut).toBe(SignatureStatus.PENDING);
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);

    // Rejeu après approvisionnement du wallet : l'exécution aboutit.
    ctx.wallet.solde = 500;
    await ctx.finalize.execute(REQ_ID);

    expect(ctx.investment.statut).toBe(InvestmentStatus.CONFIRME);
    expect(ctx.signature.statut).toBe(SignatureStatus.SIGNED);
    expect(ctx.signature.signedAt).toBeInstanceOf(Date);
    expect(ctx.notificationEvents.investmentCreated).toHaveBeenCalledTimes(1);
  });

  it('no-op si la signature est déjà traitée avant la transaction (livraison dupliquée)', async () => {
    const ctx = setup({
      solde: 500,
      preTxSignature: { statut: SignatureStatus.SIGNED },
    });

    await ctx.finalize.execute(REQ_ID);

    // Aucune transaction ouverte, aucune exécution.
    expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);
    expect(ctx.notificationEvents.investmentCreated).not.toHaveBeenCalled();
  });

  it('no-op sous verrou si une livraison concurrente a déjà finalisé la signature', async () => {
    // Pré-transaction : PENDING (course gagnée à la lecture) ; sous verrou :
    // SIGNED (l'autre livraison a committé entre-temps) → aucune exécution.
    const ctx = setup({
      solde: 500,
      preTxSignature: {},
      lockedSignature: { statut: SignatureStatus.SIGNED },
    });

    await ctx.finalize.execute(REQ_ID);

    expect(ctx.dataSource.transaction).toHaveBeenCalledTimes(1);
    // La branche exécution n'est jamais atteinte : l'investissement reste INITIE.
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);
    expect(ctx.notificationEvents.investmentCreated).not.toHaveBeenCalled();
    // Le manager n'a interrogé QUE la signature (verrou), pas l'investissement.
    const queriedInvestment = ctx.manager.findOne.mock.calls.some(
      (c: any[]) => c[0] === InvestmentEntity,
    );
    expect(queriedInvestment).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Exclusivité des deux moteurs de rendement.
  //
  // `executeInvestmentSignature` générait un échéancier de coupons à la
  // signature de TOUTE souscription, sans regarder le modèle économique. Sur un
  // projet equity — rémunéré par les distributions de loyers réels — cela
  // faisait compter DEUX FOIS le rendement dû à l'investisseur : coupons
  // calculés sur `triCible` + distributions de loyers.
  // ══════════════════════════════════════════════════════════════════════════
  describe('échéancier de coupons — modèle OBLIGATAIRE uniquement', () => {
    /** Échéances effectivement envoyées à la persistance, à plat. */
    function echeancesSauvegardees(manager: any): any[] {
      return manager.save.mock.calls
        .filter((c: any[]) => c[0] === EcheanceEntity)
        .flatMap((c: any[]) => (Array.isArray(c[1]) ? c[1] : [c[1]]));
    }

    it('OBLIGATAIRE : génère un échéancier complet (une échéance par mois de durée) — comportement inchangé', async () => {
      const ctx = setup({
        solde: 500,
        preTxSignature: {},
        project: { modeleEconomique: ModeleEconomique.OBLIGATAIRE } as any,
      });

      await ctx.finalize.execute(REQ_ID);

      const echeances = echeancesSauvegardees(ctx.manager);
      expect(echeances).toHaveLength(12); // dureeMois du projet de test
      expect(echeances[11].montantCapital).toBe(100); // capital in fine
      expect(ctx.investment.statut).toBe(InvestmentStatus.CONFIRME);
    });

    it('EQUITY : ne crée AUCUNE échéance (pas de double rendement loyers + coupons)', async () => {
      const ctx = setup({
        solde: 500,
        preTxSignature: {},
        project: { modeleEconomique: ModeleEconomique.EQUITY } as any,
      });

      await ctx.finalize.execute(REQ_ID);

      expect(echeancesSauvegardees(ctx.manager)).toHaveLength(0);
      // Le reste de la souscription se déroule normalement : la garde ne
      // concerne QUE l'échéancier.
      expect(ctx.investment.statut).toBe(InvestmentStatus.CONFIRME);
      expect(ctx.wallet.solde).toBe(400); // 500 − 100 investis
      expect(ctx.notificationEvents.investmentCreated).toHaveBeenCalledTimes(1);
    });

    it('modèle absent (ligne héritée) : traité comme OBLIGATAIRE — aucune régression sur les projets existants', async () => {
      const ctx = setup({
        solde: 500,
        preTxSignature: {},
        project: { modeleEconomique: undefined } as any,
      });

      await ctx.finalize.execute(REQ_ID);

      expect(echeancesSauvegardees(ctx.manager)).toHaveLength(12);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Marché secondaire — règlement d'une cession signée.
//
// C'est le seul endroit où l'argent, les fractions et l'état de l'annonce
// changent ensemble. Quatre défauts y étaient invisibles depuis l'interface :
// un crédit vendeur silencieusement omis, un reliquat de cession partielle gelé
// à vie, une position vendeur décrémentée du prix de vente au lieu du coût
// d'acquisition, et des fonds consommés hors de la réservation.
// ═══════════════════════════════════════════════════════════════════════════

describe('YouSignWebhookController — règlement marché secondaire', () => {
  const REQ_ID = 'ys-req-secondaire';
  const VENDEUR_ID = 7;
  const ACHETEUR_ID = 42;

  const arrondi = (n: number) => Math.round(n * 100) / 100;

  /**
   * Contexte de règlement complet : une annonce de 10 fractions à 150 €,
   * acquises 100 € pièce, dont l'acheteur en prend `nbFractionsSignees`.
   * Ses fonds sont déjà RÉSERVÉS (soldeBloque) — état posé à l'acceptation.
   */
  function setupCession(opts: {
    nbFractionsSignees: number;
    /** Absence volontaire du portefeuille vendeur (anomalie de données). */
    sansWalletVendeur?: boolean;
    /** Réservation absente : signature ouverte avant la réservation des fonds. */
    fondsNonReserves?: boolean;
  }) {
    const nbFractions = opts.nbFractionsSignees;

    const signature: any = {
      id: 'sig-sec-1',
      youSignRequestId: REQ_ID,
      statut: SignatureStatus.PENDING,
      ordreId: 'ordre-1',
      investmentId: null,
      documentId: null,
      nbFractions,
      userId: ACHETEUR_ID,
      signedAt: null,
    };

    const sellerInvest: any = {
      id: 'inv-vendeur',
      projetId: 'proj-1',
      utilisateurId: VENDEUR_ID,
      montant: 1000,
      nbTitres: 10,
      valeurTitre: 100,
      instrument: 'action',
      statut: InvestmentStatus.CONFIRME,
    };

    const ordre: any = {
      id: 'ordre-1',
      investissementId: 'inv-vendeur',
      investissement: sellerInvest,
      vendeurId: VENDEUR_ID,
      acheteurId: ACHETEUR_ID,
      sens: 'vente',
      nbFractions: 10,
      montant: 1500,
      prixUnitaire: 150,
      statut: OrdreMarcheStatus.ACCEPTE,
      interetNbFractions: nbFractions,
      interetExprimeLe: new Date('2026-08-01T10:00:00Z'),
    };

    const montantCession = arrondi(nbFractions * 150);
    const buyerWallet: any = {
      id: 'w-acheteur',
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: ACHETEUR_ID,
      devise: 'EUR',
      solde: opts.fondsNonReserves ? montantCession : 0,
      soldeBloque: opts.fondsNonReserves ? 0 : montantCession,
    };
    const sellerWallet: any = {
      id: 'w-vendeur',
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: VENDEUR_ID,
      devise: 'EUR',
      solde: 0,
      soldeBloque: 0,
    };
    const platformWallet: any = {
      id: 'w-plateforme',
      type: WalletType.FRAIS_PLATEFORME,
      proprietaireUserId: null,
      devise: 'EUR',
      solde: 0,
      soldeBloque: 0,
    };

    const wallets: any[] = opts.sansWalletVendeur
      ? [buyerWallet, platformWallet]
      : [buyerWallet, sellerWallet, platformWallet];
    const investissements: any[] = [sellerInvest];
    const project: any = { id: 'proj-1', titre: 'Résidence Test' };
    const transactions: any[] = [];

    // La résolution par ID est nécessaire depuis le verrouillage ordonné : les
    // portefeuilles sont d'abord résolus par propriétaire, puis RE-LUS par
    // identifiant dans l'ordre croissant pour prendre les verrous.
    const trouverWallet = (where: any) =>
      wallets.find((w) =>
        where.id !== undefined
          ? w.id === where.id
          : where.proprietaireUserId !== undefined
            ? w.proprietaireUserId === where.proprietaireUserId && w.type === where.type
            : w.type === where.type,
      ) ?? null;

    const manager: any = {
      findOne: jest.fn(async (Entity: any, options: any) => {
        const where = options?.where ?? {};
        if (Entity === SignatureEntity) return signature;
        if (Entity === OrdreMarcheEntity) return ordre;
        if (Entity === InvestmentEntity)
          return investissements.find((i) => i.id === where.id) ?? null;
        if (Entity === WalletEntity) return trouverWallet(where);
        if (Entity === ProjectEntity) return project;
        return null;
      }),
      create: jest.fn((_Entity: any, obj: any) => ({ ...obj })),
      save: jest.fn(async (Entity: any, obj: any) => {
        if (Entity === TransactionEntity) transactions.push(obj);
        if (Entity === InvestmentEntity && !investissements.includes(obj)) {
          investissements.push(Object.assign(obj, { id: obj.id ?? 'inv-acheteur' }));
        }
        if (Entity === WalletEntity && !wallets.includes(obj)) wallets.push(obj);
        return obj;
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      /**
       * Constructeur de requêtes qui APPLIQUE réellement ce qu'on lui demande :
       * la clause `WHERE` est évaluée, et les expressions relatives du `SET`
       * (`solde - :x`, `"nbTitres" - :n`) sont calculées sur la ligne.
       *
       * Sans cela, un dépôt simulé qui rend toujours `affected: 1` accepterait
       * une double-vente que la base refuse — et le test ne prouverait rien de
       * ce que le correctif vise.
       */
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        let entite: any = null;
        let payload: any = null;
        const params: Record<string, any> = {};
        let clause = '';

        // Ancien usage (agrégat de lecture), conservé tel quel.
        qb.select = () => qb;
        qb.getRawOne = async () => ({ total: '0' });
        qb.andWhere = () => qb;

        qb.update = (E: any) => {
          entite = E;
          return qb;
        };
        qb.set = (p: any) => {
          payload = p;
          return qb;
        };
        qb.setParameter = (nom: string, valeur: any) => {
          params[nom] = valeur;
          return qb;
        };
        qb.setParameters = (p: Record<string, any>) => {
          Object.assign(params, p);
          return qb;
        };
        qb.where = (c: string, p?: Record<string, any>) => {
          clause = c;
          Object.assign(params, p ?? {});
          return qb;
        };

        const lignesDe = (E: any): any[] =>
          E === WalletEntity
            ? wallets
            : E === InvestmentEntity
              ? investissements
              : E === OrdreMarcheEntity
                ? [ordre]
                : [];

        /** `col OP :param`, conjonctions séparées par AND. */
        const clauseSatisfaite = (ligne: any): boolean =>
          clause.split(/\s+AND\s+/i).every((cond) => {
            const m = cond.match(/"?([A-Za-z]+)"?\s*(>=|<=|=|>|<)\s*:(\w+)/);
            if (!m) return true;
            const [, col, op, nom] = m;
            const attendu = params[nom];
            const actuel = ligne[col];
            if (op === '=') return String(actuel) === String(attendu);
            const a = Number(actuel);
            const b = Number(attendu);
            return op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : a < b;
          });

        qb.execute = async () => {
          if (!entite) return { affected: 0 };
          const ligne = lignesDe(entite).find((l) => l.id === params.id);
          if (!ligne || !clauseSatisfaite(ligne)) return { affected: 0 };

          for (const [col, valeur] of Object.entries(payload ?? {})) {
            if (typeof valeur === 'function') {
              const expr = String((valeur as () => string)());
              const m = expr.match(/([+\-])\s*:(\w+)/);
              if (!m) continue;
              const delta = Number(params[m[2]]);
              ligne[col] = arrondi(
                Number(ligne[col]) + (m[1] === '-' ? -delta : delta),
              );
            } else {
              ligne[col] = valeur;
            }
          }
          return { affected: 1 };
        };
        return qb;
      }),
    };

    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const signatureRepo: any = {
      findOne: jest.fn(async () => signature),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const ordreRepo: any = { findOne: jest.fn(async () => ordre) };
    const projectRepo: any = { findOne: jest.fn(async () => project) };
    const documentRepo: any = { update: jest.fn() };
    const noopRepo: any = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };

    const notificationService: any = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    const notificationEvents: any = {
      secondaryTradeExecuted: jest.fn().mockResolvedValue(undefined),
    };
    const userRepository: any = {
      findById: jest.fn(async (id: number) => ({ userId: id })),
    };
    // Grille par défaut : 1 % du montant + 15 % de la plus-value.
    const platformFees: any = {
      getRates: jest.fn(async () => ({
        resaleTransactionFeePct: 1,
        shareSaleGainFeePct: 15,
      })),
      computeResaleFees: jest.fn(async (montant: number, plusValue: number) => ({
        transactionFee: arrondi(montant * 0.01),
        gainFee: arrondi(Math.max(0, plusValue) * 0.15),
      })),
    };
    const metrics: any = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    const expirerSignature: any = {
      parRequeteFournisseur: jest.fn().mockResolvedValue('noop'),
      execute: jest.fn().mockResolvedValue('noop'),
    };

    const youSignService = {
      downloadSignedDocument: jest.fn(),
      verifyWebhookSignature: () => true,
    } as any;
    const finalize = new FinalizeSignedContractUseCase(
      signatureRepo,
      ordreRepo,
      projectRepo,
      documentRepo,
      dataSource,
      youSignService,
      notificationService,
      { upload: jest.fn() } as any,
      userRepository,
      notificationEvents,
      platformFees,
      metrics,
    );
    const controller = new YouSignWebhookController(
      youSignService,
      metrics,
      expirerSignature,
      finalize,
    );

    /** Position (solde + soldeBloque) de chaque portefeuille, à un instant t. */
    const instantane = (): Map<string, PositionWallet> =>
      new Map(
        wallets.map((w) => [
          w.id,
          { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
        ]),
      );

    return {
      controller,
      finalize,
      signature,
      ordre,
      sellerInvest,
      buyerWallet,
      sellerWallet,
      platformWallet,
      wallets,
      investissements,
      transactions,
      montantCession,
      notificationService,
      expirerSignature,
      instantane,
      manager,
    };
  }

  // ── B5 — concurrence : la double-vente est refusée PAR LE SQL ──────────────

  /**
   * Le règlement lisait la position du vendeur, calculait le restant EN
   * MÉMOIRE et réécrivait la ligne entière (`Math.max(0, remaining)`). Deux
   * règlements concurrents lisaient tous deux 10 fractions, écrivaient tous
   * deux 0, et le vendeur livrait vingt fractions qu'il n'avait pas — le
   * `Math.max` ne protégeait rien, il MASQUAIT le découvert en le ramenant à
   * zéro.
   *
   * Les écritures sont désormais RELATIVES ET CONDITIONNELLES : c'est la base
   * qui évalue `"nbTitres" >= :n` au moment de l'écriture. Le dépôt simulé de
   * cette suite applique réellement la clause — sans quoi le test ne
   * prouverait rien.
   */
  describe('double-vente des mêmes fractions', () => {
    it('un second règlement sur une position épuisée est REFUSÉ', async () => {
      const ctx = setupCession({ nbFractionsSignees: 10 });

      await ctx.finalize.execute(REQ_ID);
      expect(ctx.investissements[0].nbTitres).toBe(0);

      // Second règlement : la signature est rejouée alors que la position est
      // vide. L'acheteur est REPROVISIONNÉ pour que le refus ne puisse venir
      // que de la garde qu'on veut éprouver — la position du vendeur — et non
      // du contrôle de fonds situé plus haut.
      ctx.buyerWallet.soldeBloque = ctx.montantCession;
      ctx.signature.statut = SignatureStatus.PENDING;
      await expect(ctx.finalize.execute(REQ_ID)).rejects.toThrow(
        /Position vendeur .* insuffisante|Annonce .* déjà servie/,
      );
    });

    it('la position du vendeur ne passe JAMAIS en négatif', async () => {
      const ctx = setupCession({ nbFractionsSignees: 10 });

      await ctx.finalize.execute(REQ_ID);
      ctx.signature.statut = SignatureStatus.PENDING;
      await ctx.finalize.execute(REQ_ID).catch(() => undefined);

      expect(Number(ctx.investissements[0].nbTitres)).toBeGreaterThanOrEqual(0);
    });

    it('le portefeuille acheteur ne peut pas être débité deux fois', async () => {
      const ctx = setupCession({ nbFractionsSignees: 10 });

      await ctx.finalize.execute(REQ_ID);
      const apresPremier = {
        solde: ctx.buyerWallet.solde,
        bloque: ctx.buyerWallet.soldeBloque,
      };

      ctx.signature.statut = SignatureStatus.PENDING;
      await ctx.finalize.execute(REQ_ID).catch(() => undefined);

      // Le second passage échoue AVANT ou PENDANT le débit ; dans les deux cas
      // la position de l'acheteur est inchangée.
      expect(ctx.buyerWallet.solde).toBe(apresPremier.solde);
      expect(ctx.buyerWallet.soldeBloque).toBe(apresPremier.bloque);
    });

    it("une annonce déjà servie n'est pas réécrite", async () => {
      const ctx = setupCession({ nbFractionsSignees: 10 });

      await ctx.finalize.execute(REQ_ID);
      expect(ctx.ordre.statut).toBe(OrdreMarcheStatus.EXECUTE);

      ctx.signature.statut = SignatureStatus.PENDING;
      await ctx.finalize.execute(REQ_ID).catch(() => undefined);

      expect(ctx.ordre.statut).toBe(OrdreMarcheStatus.EXECUTE);
      expect(ctx.ordre.acheteurId).toBe(ACHETEUR_ID);
    });
  });

  // ── Équilibre comptable ────────────────────────────────────────────────────

  it('le règlement est ÉQUILIBRÉ : la somme des variations de fonds détenus vaut zéro', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });
    const avant = ctx.instantane();

    await ctx.finalize.execute(REQ_ID);

    const mouvements = mouvementsDepuisInstantanes(avant, ctx.instantane());
    expect(grandLivreEquilibre(mouvements)).toBe(true);
    expect(variationTotale(mouvements)).toBeCloseTo(0, 6);

    // Détail : 600 € quittent l'acheteur, 564 € vont au vendeur, 36 € de frais
    // à la plateforme (1 % de 600 + 15 % de 200 de plus-value).
    expect(ctx.buyerWallet.soldeBloque).toBe(0);
    expect(ctx.buyerWallet.solde).toBe(0);
    expect(ctx.sellerWallet.solde).toBe(564);
    expect(ctx.platformWallet.solde).toBe(36);
  });

  it('les fonds consommés sont ceux qui avaient été RÉSERVÉS, pas le solde disponible', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });
    // L'acheteur dispose en plus de 5 000 € libres : ils ne doivent pas bouger.
    ctx.buyerWallet.solde = 5000;

    await ctx.finalize.execute(REQ_ID);

    expect(ctx.buyerWallet.soldeBloque).toBe(0);
    expect(ctx.buyerWallet.solde).toBe(5000);
  });

  it('repli documenté : une signature ouverte AVANT la réservation se règle sur le solde disponible, sans déséquilibre', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4, fondsNonReserves: true });
    const avant = ctx.instantane();

    await ctx.finalize.execute(REQ_ID);

    expect(ctx.buyerWallet.solde).toBe(0);
    expect(ctx.buyerWallet.soldeBloque).toBe(0);
    expect(
      grandLivreEquilibre(mouvementsDepuisInstantanes(avant, ctx.instantane())),
    ).toBe(true);
  });

  // ── Crédit vendeur : échec explicite, jamais d'omission silencieuse ────────

  it('un vendeur SANS portefeuille fait échouer le règlement au lieu de perdre son crédit', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4, sansWalletVendeur: true });
    const avant = ctx.instantane();

    await expect(ctx.finalize.execute(REQ_ID)).rejects.toThrow(
      /Wallet vendeur .* introuvable/,
    );

    // La signature reste PENDING : le webhook est rejouable une fois le
    // portefeuille créé. Rien n'a bougé côté acheteur ni côté annonce.
    expect(ctx.signature.statut).toBe(SignatureStatus.PENDING);
    expect(ctx.ordre.statut).toBe(OrdreMarcheStatus.ACCEPTE);
    expect(
      variationTotale(mouvementsDepuisInstantanes(avant, ctx.instantane())),
    ).toBe(0);
  });

  it('un règlement en échec prévient les DEUX parties et les administrateurs', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4, sansWalletVendeur: true });

    await expect(ctx.finalize.execute(REQ_ID)).rejects.toThrow();

    const destinataires = ctx.notificationService.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires).toContain(ACHETEUR_ID);
    expect(destinataires).toContain(VENDEUR_ID);
    expect(ctx.notificationService.pushToAdmins).toHaveBeenCalledTimes(1);
  });

  // ── Fill partiel : le reliquat retourne au carnet ──────────────────────────

  it('fill PARTIEL : le reliquat revient EN_CARNET, purgé de tout acheteur', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });

    await ctx.finalize.execute(REQ_ID);

    expect(ctx.ordre.statut).toBe(OrdreMarcheStatus.EN_CARNET);
    expect(ctx.ordre.nbFractions).toBe(6); // 10 − 4
    expect(ctx.ordre.montant).toBe(900); // 1500 − 600
    // Purge : sans elle, l'annonce republiée porterait encore l'acheteur servi.
    expect(ctx.ordre.acheteurId).toBeNull();
    expect(ctx.ordre.interetNbFractions).toBeNull();
    expect(ctx.ordre.interetExprimeLe).toBeNull();
  });

  it("fill TOTAL : l'annonce est servie — EXECUTE, acheteur inscrit", async () => {
    const ctx = setupCession({ nbFractionsSignees: 10 });

    await ctx.finalize.execute(REQ_ID);

    expect(ctx.ordre.statut).toBe(OrdreMarcheStatus.EXECUTE);
    expect(ctx.ordre.acheteurId).toBe(ACHETEUR_ID);
  });

  // ── Coût d'acquisition : pas de dérive du coût moyen ───────────────────────

  it("la position du vendeur est décrémentée du COÛT D'ACQUISITION, pas du prix de vente", async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });

    await ctx.finalize.execute(REQ_ID);

    // 4 fractions cédées 150 € mais acquises 100 € : la position perd 400 € de
    // coût, pas 600 € de produit. Le coût moyen résiduel reste 600/6 = 100 €.
    expect(ctx.sellerInvest.nbTitres).toBe(6);
    expect(ctx.sellerInvest.montant).toBe(600);
    expect(ctx.sellerInvest.montant / ctx.sellerInvest.nbTitres).toBe(100);
  });

  it('la plus-value facturée est celle du coût réel (frais sur gain non nuls)', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });

    await ctx.finalize.execute(REQ_ID);

    const fraisGain = ctx.transactions.find(
      (tx: any) => tx.metadata?.source === 'gain_revente_actions',
    );
    expect(fraisGain).toBeDefined();
    expect(fraisGain.metadata.coutAcquisition).toBe(400);
    expect(fraisGain.metadata.plusValueVendeur).toBe(200);
    expect(fraisGain.montant).toBe(30); // 15 % de 200
  });

  it('le grand livre crédite le vendeur de son NET, sans double compte ni source externe', async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });

    await ctx.finalize.execute(REQ_ID);

    // Le paiement brut acheteur → vendeur est la SEULE écriture créditrice du
    // vendeur ; les frais repartent de lui vers la plateforme. Son net au
    // grand livre (crédits − débits) doit valoir exactement 564 — l'ancienne
    // écriture ∅ → vendeur du net, en plus du brut, le comptait deux fois.
    const paiementBrut = ctx.transactions.find(
      (tx: any) => tx.idempotencyKey === `rachat:buyer:${ctx.signature.id}`,
    );
    expect(paiementBrut).toBeDefined();
    expect(paiementBrut.walletDestination).toBe('w-vendeur');

    const netVendeurAuLivre = ctx.transactions.reduce(
      (somme: number, tx: any) =>
        somme +
        (tx.walletDestination === 'w-vendeur' ? Number(tx.montant) : 0) -
        (tx.walletSource === 'w-vendeur' ? Number(tx.montant) : 0),
      0,
    );
    expect(netVendeurAuLivre).toBe(564);

    // Plus AUCUNE écriture de règlement à source externe : tout euro crédité
    // quelque part est débité ailleurs — condition du rapprochement à zéro.
    const sourcesExternes = ctx.transactions.filter(
      (tx: any) => tx.walletSource == null,
    );
    expect(sourcesExternes).toEqual([]);
  });

  // ── Expiration : l'annonce et les fonds sont libérés ───────────────────────

  it("expiration : le webhook délègue la libération de l'ordre et des fonds", async () => {
    const ctx = setupCession({ nbFractionsSignees: 4 });

    await ctx.controller.handleWebhook(
      { rawBody: Buffer.from('{}') } as any,
      {
        event_name: 'signature_request.expired',
        data: { signature_request: { id: REQ_ID } },
      },
      'sig-header',
    );

    expect(ctx.expirerSignature.parRequeteFournisseur).toHaveBeenCalledWith(REQ_ID);
  });
});
