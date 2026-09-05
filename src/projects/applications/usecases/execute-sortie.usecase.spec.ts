import { ExecuteSortieUseCase } from './execute-sortie.usecase';
import { StatutSortie } from '../../domains/sortie-projet';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import {
  mouvementsDepuisInstantanes,
  rapprocherGrandLivre,
  variationTotale,
} from 'src/wallets/domains/grand-livre';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Registre en mémoire : portefeuilles ET écritures, tenus comme en base.
 *
 * C'est ce qui manquait pour voir B2 : les suites précédentes n'exerçaient
 * que le cas « aucun investisseur confirmé », où aucune écriture n'est
 * produite. Aucune ne regardait la contrepartie des cinq crédits.
 */
function construireRegistre() {
  const wallets: any[] = [];
  const ecritures: any[] = [];
  let seq = 0;

  const creer = (attrs: any) => {
    const w = {
      id: `w-${++seq}`,
      solde: 0,
      soldeBloque: 0,
      devise: 'EUR',
      projetId: null,
      proprietaireUserId: null,
      ...attrs,
    };
    wallets.push(w);
    return w;
  };

  const em: any = {
    findOne: jest.fn(async (_entity: any, options: any) => {
      const where = options?.where ?? {};
      return (
        wallets.find((w) =>
          Object.entries(where).every(([cle, val]) => w[cle] === val),
        ) ?? null
      );
    }),
    create: jest.fn((_entity: any, obj: any) => obj),
    save: jest.fn(async (_entity: any, obj: any) => {
      // Écriture du grand livre (porte un `montant`) vs portefeuille.
      if (obj && obj.montant !== undefined && obj.type !== undefined) {
        ecritures.push(obj);
        return { id: `tx-${++seq}`, ...obj };
      }
      const existant = wallets.find((w) => w.id === obj.id);
      if (existant) {
        Object.assign(existant, obj);
        return existant;
      }
      return creer(obj);
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        _set: null,
        _params: {} as Record<string, any>,
        update: () => qb,
        set: (payload: any) => {
          qb._set = payload;
          return qb;
        },
        setParameter: (cle: string, valeur: any) => {
          qb._params[cle] = valeur;
          return qb;
        },
        where: (_clause: string, params: any) => {
          Object.assign(qb._params, params ?? {});
          return qb;
        },
        execute: async () => {
          const wallet = wallets.find((w) => w.id === qb._params.id);
          if (!wallet) return { affected: 0 };
          const expr = String(qb._set.solde());
          const montant = Number(qb._params.montant);
          wallet.solde = round2(
            Number(wallet.solde) + (expr.includes('-') ? -montant : montant),
          );
          return { affected: 1 };
        },
      };
      return qb;
    }),
  };

  return { wallets, ecritures, em, creer };
}

describe('ExecuteSortieUseCase', () => {
  const PROJET_ID = 'p1';
  const SORTIE_ID = 's1';

  const construire = ({
    plusValueBrute = 0,
    investissements = [] as any[],
    soldeProjet = 1_000_000,
    tauxFraisPct = 0,
  } = {}) => {
    const registre = construireRegistre();
    const walletProjet = registre.creer({
      type: WalletType.TECHNIQUE_PROJET,
      projetId: PROJET_ID,
      solde: soldeProjet,
    });
    for (const inv of investissements) {
      registre.creer({
        type: WalletType.INVESTISSEUR,
        proprietaireUserId: inv.utilisateurId,
        solde: 0,
      });
    }

    const sortie = {
      id: SORTIE_ID,
      projetId: PROJET_ID,
      prixRevente: 100_000,
      dateRevente: new Date(),
      plusValueBrute,
      statut: StatutSortie.ACTEE,
    };

    const useCase = new ExecuteSortieUseCase(
      { findById: jest.fn(async () => sortie), save: jest.fn(async (s) => s) } as any,
      {
        findProjectById: jest.fn(async () => ({ capitalCible: 100_000 })),
        updateProjectStatus: jest.fn(),
      } as any,
      { findByProjetId: jest.fn(async () => investissements) } as any,
      /* walletRepo */ {} as any,
      /* txRepo */ {} as any,
      { transaction: jest.fn(async (cb: any) => cb(registre.em)) } as any,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      { check: jest.fn().mockResolvedValue(undefined) } as any,
      {
        computePropertySaleGainFee: jest.fn(async (pv: number) =>
          pv <= 0 ? 0 : round2((pv * tauxFraisPct) / 100),
        ),
      } as any,
    );

    return { useCase, ...registre, walletProjet };
  };

  const investisseur = (utilisateurId: number, montant: number) => ({
    id: `inv-${utilisateurId}`,
    utilisateurId,
    montant,
    statut: InvestmentStatus.CONFIRME,
  });

  /** Les primitives du grand livre travaillent sur des Map, pas des objets. */
  const instantane = (wallets: any[]) =>
    new Map<string, { solde: number; soldeBloque: number }>(
      wallets.map((w) => [
        w.id,
        { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque) },
      ]),
    );

  // ── B2 — la contrepartie manquante ────────────────────────────────────────

  describe('B2 — aucune sortie ne crée d’argent', () => {
    it('CHAQUE écriture porte une contrepartie (walletSource non nul)', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 60_000), investisseur(2, 40_000)],
      });

      await h.useCase.execute(SORTIE_ID, 7);

      // Cinq natures d'écriture : frais de plateforme, capital, plus-value,
      // IR, CSG. Aucune ne créditait quiconque sans débiter personne.
      expect(h.ecritures.length).toBeGreaterThan(0);
      for (const ecriture of h.ecritures) {
        expect(ecriture.walletSource).toBeTruthy();
        expect(ecriture.walletDestination).toBeTruthy();
      }
    });

    it("les retenues fiscales sont prélevées sur l'INVESTISSEUR, pas sur le projet", async () => {
      const h = construire({
        plusValueBrute: 10_000,
        investissements: [investisseur(1, 100_000)],
      });

      await h.useCase.execute(SORTIE_ID, 7);

      const walletInvestisseur = h.wallets.find(
        (w) => w.proprietaireUserId === 1,
      );
      const impots = h.ecritures.filter((e) => e.type === 'impots');
      expect(impots).toHaveLength(2);
      // Le projet verse le BRUT à l'investisseur, qui en reverse la part
      // fiscale : c'est ce qui rend le registre cohérent avec les soldes, où
      // l'investisseur ne reçoit que le net.
      for (const impot of impots) {
        expect(impot.walletSource).toBe(walletInvestisseur.id);
      }
    });

    it('les écritures de distribution partent bien du portefeuille du projet', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 100_000)],
      });

      await h.useCase.execute(SORTIE_ID, 7);

      const depuisProjet = h.ecritures.filter((e) => e.type !== 'impots');
      expect(depuisProjet.length).toBeGreaterThan(0);
      for (const ecriture of depuisProjet) {
        expect(ecriture.walletSource).toBe(h.walletProjet.id);
      }
    });

    it('la variation totale des fonds détenus est NULLE', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 60_000), investisseur(2, 40_000)],
      });
      const avant = instantane(h.wallets);

      await h.useCase.execute(SORTIE_ID, 7);

      const mouvements = mouvementsDepuisInstantanes(avant, instantane(h.wallets));
      expect(variationTotale(mouvements)).toBeCloseTo(0, 6);
    });

    it('le registre se rapproche EXACTEMENT des soldes (aucun écart)', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 60_000), investisseur(2, 40_000)],
      });
      const soldeProjetInitial = Number(h.walletProjet.solde);

      await h.useCase.execute(SORTIE_ID, 7);

      // Le portefeuille projet part d'un solde préexistant : on le neutralise
      // pour ne rapprocher que ce que CETTE opération a écrit.
      const positions = new Map<string, { solde: number; soldeBloque: number }>(
        h.wallets.map((w) => [
          w.id,
          {
            solde:
              w.id === h.walletProjet.id
                ? round2(Number(w.solde) - soldeProjetInitial)
                : Number(w.solde),
            soldeBloque: Number(w.soldeBloque),
          },
        ]),
      );

      expect(rapprocherGrandLivre(positions, h.ecritures)).toEqual([]);
    });

    it('le débit du projet égale au centime la somme des crédits', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 60_000), investisseur(2, 40_000)],
      });
      const soldeAvant = Number(h.walletProjet.solde);

      await h.useCase.execute(SORTIE_ID, 7);

      const debit = round2(soldeAvant - Number(h.walletProjet.solde));
      const credits = round2(
        h.wallets
          .filter((w) => w.id !== h.walletProjet.id)
          .reduce((total, w) => total + Number(w.solde), 0),
      );
      expect(debit).toBe(credits);
    });
  });

  // ── B3 — assiette du prorata ──────────────────────────────────────────────

  describe('B3 — la plus-value se partage sur le COLLECTÉ, pas sur l’objectif', () => {
    it('collecte partielle : 100 % de la plus-value est distribuée', async () => {
      // Objectif 100 000 €, collecté 60 000 € seulement. L'ancien prorata
      // (montant / capitalCible) ne distribuait que 60 % de la plus-value ;
      // les 40 % restants n'allaient à personne.
      const h = construire({
        plusValueBrute: 10_000,
        investissements: [investisseur(1, 40_000), investisseur(2, 20_000)],
      });

      const res = await h.useCase.execute(SORTIE_ID, 7);

      expect(res.totalPlusValueDistribuee).toBe(10_000);
    });

    it('la répartition suit la quote-part réelle de chacun', async () => {
      const h = construire({
        plusValueBrute: 9_000,
        investissements: [investisseur(1, 40_000), investisseur(2, 20_000)],
      });

      await h.useCase.execute(SORTIE_ID, 7);

      const pv = h.ecritures.filter((e) => e.montant === 6_000 || e.montant === 3_000);
      // 2/3 et 1/3 de 9 000 € — et non 40 % / 20 % de l'objectif.
      expect(pv.map((e) => e.montant).sort((a, b) => a - b)).toEqual([3_000, 6_000]);
    });

    it('collecte complète : comportement inchangé', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        investissements: [investisseur(1, 60_000), investisseur(2, 40_000)],
      });

      const res = await h.useCase.execute(SORTIE_ID, 7);

      expect(res.totalPlusValueDistribuee).toBe(10_000);
    });

    it('les frais de plateforme sortent AVANT le partage', async () => {
      const h = construire({
        plusValueBrute: 10_000,
        tauxFraisPct: 15,
        investissements: [investisseur(1, 50_000), investisseur(2, 50_000)],
      });

      const res = await h.useCase.execute(SORTIE_ID, 7);

      expect(res.performanceFeePrelevee).toBe(1_500);
      expect(res.totalPlusValueDistribuee).toBe(8_500);
    });
  });

  // ── Comportement historique préservé ──────────────────────────────────────

  describe('audit role', () => {
    it('audite avec SUPER_ADMIN quand adminRole est omis', async () => {
      const h = construire();
      const auditLog = (h.useCase as any).auditLog;

      await h.useCase.execute(SORTIE_ID, 7);

      expect(auditLog.create).toHaveBeenCalledWith(
        '7',
        UserRole.SUPER_ADMIN,
        'equity.sortie.execute',
        'sortie_projet',
        SORTIE_ID,
        undefined,
        undefined,
        expect.any(Object),
      );
    });

    it("audite avec le rôle réel de l'acteur quand adminRole est fourni", async () => {
      const h = construire();
      const auditLog = (h.useCase as any).auditLog;

      await h.useCase.execute(SORTIE_ID, 7, UserRole.CIO);

      expect(auditLog.create).toHaveBeenCalledWith(
        '7',
        UserRole.CIO,
        'equity.sortie.execute',
        'sortie_projet',
        SORTIE_ID,
        undefined,
        undefined,
        expect.any(Object),
      );
    });
  });

  it('un projet sans investisseur confirmé reste clôturable', async () => {
    // Tous les souscripteurs se sont rétractés : rien à distribuer, mais la
    // sortie doit pouvoir aller au bout.
    const h = construire();

    await expect(h.useCase.execute(SORTIE_ID, 7)).resolves.toMatchObject({
      nbInvestisseursPayes: 0,
    });
    expect(h.ecritures).toEqual([]);
  });
});
