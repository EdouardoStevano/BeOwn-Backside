import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Caractérisation forceExecute — dérive du coût moyen (audit lot 2, point 1).
 *
 * Le règlement forcé décrémente l'investissement vendeur du COÛT D'ACQUISITION
 * des parts cédées (coût moyen pondéré — domains/cout-acquisition.ts), jamais
 * du prix de vente, aligné sur le chemin webhook corrigé au lot 1
 * (finalize-signed-contract étape 5). Décrémenter du prix de vente déplaçait
 * le coût moyen à chaque cession partielle et rendait `montant` négatif dès
 * que la vente se faisait en plus-value.
 */
describe('AdminSecondaryMarketController — forceExecute (coût moyen vendeur)', () => {
  const admin = { userId: 99 };

  interface Scenario {
    sellerInvest: {
      id: string;
      nbTitres: number;
      montant: number;
      valeurTitre: number | null;
    };
    nbFractions: number;
    prixUnitaire: number;
    buyerSolde?: number;
  }

  // Construit le contrôleur à la main (comme le spec cancelOrder) : aucune DB,
  // aucun réseau — le em de la transaction est entièrement simulé.
  const build = (sc: Scenario) => {
    // La relation `ordre.investissement` porte l'état vendeur AVANT cession :
    // c'est elle que computeCoutAcquisition lit (hors transaction).
    const ordre = {
      id: 'ord-1',
      investissementId: sc.sellerInvest.id,
      investissement: {
        projetId: 'proj-1',
        instrument: 'action',
        montant: sc.sellerInvest.montant,
        nbTitres: sc.sellerInvest.nbTitres,
        valeurTitre: sc.sellerInvest.valeurTitre,
      },
      vendeurId: 1,
      acheteurId: 2,
      nbFractions: sc.nbFractions,
      prixUnitaire: sc.prixUnitaire,
      statut: OrdreMarcheStatus.MATCH_PROPOSE,
    };

    // Copie mutable : c'est l'objet relu PENDANT la transaction et sauvé.
    const sellerInvest: any = { ...sc.sellerInvest, statut: InvestmentStatus.CONFIRME };
    const buyerWallet: any = {
      id: 'w-buyer',
      proprietaireUserId: 2,
      type: WalletType.INVESTISSEUR,
      solde: sc.buyerSolde ?? 100000,
      devise: 'EUR',
    };
    const sellerWallet: any = {
      id: 'w-seller',
      proprietaireUserId: 1,
      type: WalletType.INVESTISSEUR,
      solde: 0,
      devise: 'EUR',
    };
    let ordreSaved: any = null;

    const em: any = {
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === WalletEntity) {
          if (opts.where?.proprietaireUserId === 2) return Promise.resolve(buyerWallet);
          if (opts.where?.proprietaireUserId === 1) return Promise.resolve(sellerWallet);
          return Promise.resolve(null); // wallet plateforme — frais à 0 ici
        }
        if (entity === InvestmentEntity) {
          if (opts.where?.id === sc.sellerInvest.id) return Promise.resolve(sellerInvest);
          return Promise.resolve(null); // pas d'investissement acheteur existant
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation((_entity: any, obj: any) => obj),
      save: jest.fn().mockImplementation((entity: any, obj: any) => {
        if (entity === OrdreMarcheEntity) ordreSaved = obj;
        if (obj && obj.id === undefined) obj.id = 'inv-buyer-new';
        return Promise.resolve(obj);
      }),
    };

    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(em)) };
    const ordreRepo = { findOne: jest.fn().mockResolvedValue(ordre) };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role: UserRole.SUPER_ADMIN }),
    };
    // Frais neutralisés : la caractérisation porte sur titres/montant vendeur.
    const platformFees = {
      getRates: jest.fn().mockResolvedValue({}),
      computeResaleFees: jest.fn().mockResolvedValue({ transactionFee: 0, gainFee: 0 }),
    };

    const controller = new AdminSecondaryMarketController(
      ordreRepo as any,
      {} as any, // investRepo
      userRepo as any,
      {} as any, // walletRepo
      {} as any, // txRepo
      { findOne: jest.fn().mockResolvedValue(null) } as any, // projectRepo → pas de notif
      dataSource,
      { push: jest.fn(), pushToAdmins: jest.fn() } as any,
      { secondaryTradeExecuted: jest.fn() } as any,
      platformFees as any,
    );

    return { controller, sellerInvest, buyerWallet, sellerWallet, getOrdreSaved: () => ordreSaved };
  };

  it('vente partielle : le montant restant = coût d’acquisition résiduel, pas prix de vente', async () => {
    // 100 titres pour 1000 € (coût moyen 10 €) ; vend 40 à 25 € (vente 1000 €).
    // Coût d'acquisition cédé = 40 × 10 = 400 → il reste 60 titres / 600 €.
    // L'ancien code décrémentait la vente (1000) → montant tombait à 0.
    const { controller, sellerInvest, buyerWallet, sellerWallet } = build({
      sellerInvest: { id: 'inv-seller', nbTitres: 100, montant: 1000, valeurTitre: 10 },
      nbFractions: 40,
      prixUnitaire: 25,
    });

    const result = await controller.forceExecute('ord-1', admin as any);

    expect(result.success).toBe(true);
    expect(sellerInvest.nbTitres).toBe(60);
    expect(sellerInvest.montant).toBe(600); // coût moyen intact : 600/60 = 10 €
    // Les mouvements wallet restent au PRIX DE VENTE, eux :
    expect(buyerWallet.solde).toBe(100000 - 1000);
    expect(sellerWallet.solde).toBe(1000); // frais neutralisés à 0
  });

  it('vente partielle en plus-value : le montant restant n’est JAMAIS négatif', async () => {
    // 100 titres / 1000 € ; vend 50 à 30 € (vente 1500 €, coût cédé 500 €).
    // Ancien code : 1000 − 1500 = −500. Attendu : 1000 − 500 = 500.
    const { controller, sellerInvest } = build({
      sellerInvest: { id: 'inv-seller', nbTitres: 100, montant: 1000, valeurTitre: 10 },
      nbFractions: 50,
      prixUnitaire: 30,
    });

    await controller.forceExecute('ord-1', admin as any);

    expect(sellerInvest.nbTitres).toBe(50);
    expect(sellerInvest.montant).toBe(500);
    expect(sellerInvest.montant).toBeGreaterThanOrEqual(0);
  });

  it('vente totale : titres et montant tombent à 0', async () => {
    const { controller, sellerInvest, getOrdreSaved } = build({
      sellerInvest: { id: 'inv-seller', nbTitres: 100, montant: 1000, valeurTitre: 10 },
      nbFractions: 100,
      prixUnitaire: 12,
    });

    await controller.forceExecute('ord-1', admin as any);

    expect(sellerInvest.nbTitres).toBe(0);
    expect(sellerInvest.montant).toBe(0);
    expect(getOrdreSaved()?.statut).toBe(OrdreMarcheStatus.EXECUTE);
  });

  it('fallback valeurTitre supérieur au montant tracé : clamp à 0, pas de négatif', async () => {
    // montant non tracé (0) → computeCoutAcquisition retombe sur valeurTitre :
    // coût cédé = 4 × 12 = 48 > montant restant (0) → clamp.
    const { controller, sellerInvest } = build({
      sellerInvest: { id: 'inv-seller', nbTitres: 10, montant: 0, valeurTitre: 12 },
      nbFractions: 4,
      prixUnitaire: 15,
    });

    await controller.forceExecute('ord-1', admin as any);

    expect(sellerInvest.nbTitres).toBe(6);
    expect(sellerInvest.montant).toBe(0);
  });
});
