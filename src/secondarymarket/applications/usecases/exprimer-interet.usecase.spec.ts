import { BadRequestException } from '@nestjs/common';
import { ExprimerInteretUseCase } from './exprimer-interet.usecase';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { DevisCessionService } from 'src/secondarymarket/applications/devis-cession.service';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';

/**
 * L'expression d'intérêt ne forme aucun contrat — mais elle doit désormais
 * annoncer les frais de la cession envisagée, calculés depuis la grille
 * administrable, jamais depuis un taux en dur.
 */
describe('ExprimerInteretUseCase', () => {
  const ordreOuvert = {
    id: 'ordre-1',
    vendeurId: 1,
    statut: OrdreMarcheStatus.EN_CARNET,
    nbFractions: 10,
    prixUnitaire: '120.00',
    investissementId: 'inv-1',
  };

  const investissementVendeur = {
    id: 'inv-1',
    valeurTitre: '100.00',
    nbTitres: 100,
    montant: '10000.00',
  };

  const build = (commissions?: Record<string, number>) => {
    const ordreRepo = {
      findOne: jest.fn().mockResolvedValue({ ...ordreOuvert }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };
    const walletRepo = {
      findOne: jest.fn().mockResolvedValue({ solde: '100000.00' }),
    };
    const investRepo = {
      findOne: jest.fn().mockResolvedValue({ ...investissementVendeur }),
    };
    const notifications = { push: jest.fn() };

    // Vraie chaîne de frais, grille simulée : le test prouve que le devis suit
    // la grille, pas un taux codé.
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue(
        commissions ? { id: 'default', settings: { commissions } } : null,
      ),
    };
    const devisCession = new DevisCessionService(
      new PlatformFeesService(settingsRepo as any),
    );

    const usecase = new ExprimerInteretUseCase(
      ordreRepo as any,
      walletRepo as any,
      investRepo as any,
      notifications as any,
      devisCession,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { usecase, ordreRepo, walletRepo, investRepo, notifications };
  };

  it('expose le devis de frais dans la réponse (taux par défaut : 1 % et 15 %)', async () => {
    const { usecase } = build();

    const resultat = await usecase.execute('ordre-1', 2, 5);

    // 5 × 120 = 600 de cession ; plus-value (120 − 100) × 5 = 100.
    expect(resultat.montantIndicatif).toBe(600);
    expect(resultat.devis).toMatchObject({
      montantBrut: 600,
      plusValueVendeur: 100,
      fraisTransaction: 6, // 1 % de 600
      fraisPlusValue: 15, // 15 % de 100
      totalFrais: 21,
      netVendeur: 579,
      aLaChargeDe: 'vendeur',
    });
  });

  it('modifier la grille de frais change le devis servi', async () => {
    const grilleDouble = build({
      resaleTransactionFeePct: 2,
      shareSaleGainFeePct: 30,
    });

    const resultat = await grilleDouble.usecase.execute('ordre-1', 2, 5);

    expect(resultat.devis.fraisTransaction).toBe(12); // 2 % de 600
    expect(resultat.devis.fraisPlusValue).toBe(30); // 30 % de 100
    expect(resultat.devis.tauxTransactionPct).toBe(2);
    expect(resultat.devis.tauxPlusValuePct).toBe(30);
  });

  it("l'intérêt reste une sollicitation : statut interet_exprime, mention art. 25 servie", async () => {
    const { usecase, notifications } = build();

    const resultat = await usecase.execute('ordre-1', 2, 5);

    expect(resultat.statut).toBe(OrdreMarcheStatus.INTERET_EXPRIME);
    expect(resultat.mention).toContain("n'exploite pas un système de négociation");
    // Le vendeur est sollicité, jamais court-circuité.
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ utilisateurId: 1 }),
    );
  });

  it('refuse toujours le vendeur acquéreur de sa propre annonce', async () => {
    const { usecase } = build();
    await expect(usecase.execute('ordre-1', 1, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ── Durée de validité ─────────────────────────────────────────────────────
  //
  // Le statut EN_CARNET ne suffit pas : entre deux passages du cron, une
  // annonce échue reste au carnet. Sans ce contrôle, le vendeur pouvait être
  // sollicité — et engagé — sur une offre qu'il avait lui-même bornée.

  it("refuse une marque d'intérêt sur une annonce échue, code métier stable", async () => {
    const { usecase, ordreRepo } = build();
    ordreRepo.findOne.mockResolvedValue({
      ...ordreOuvert,
      valideJusquAu: '2020-01-01',
    });

    const erreur = await usecase.execute('ordre-1', 2, 5).catch((e) => e);

    expect(erreur).toBeInstanceOf(BadRequestException);
    expect(erreur.getResponse()).toMatchObject({
      code: 'SECONDARY_ORDER_EXPIRED',
      expireeLe: '2020-01-01T23:59:59.999Z',
    });
  });

  it("accepte une annonce dont l'échéance n'est pas atteinte", async () => {
    const { usecase, ordreRepo } = build();
    const dansUnAn = new Date();
    dansUnAn.setFullYear(dansUnAn.getFullYear() + 1);
    ordreRepo.findOne.mockResolvedValue({
      ...ordreOuvert,
      valideJusquAu: dansUnAn.toISOString().slice(0, 10),
    });

    await expect(usecase.execute('ordre-1', 2, 5)).resolves.toMatchObject({
      statut: OrdreMarcheStatus.INTERET_EXPRIME,
    });
  });

  it('une annonce sans échéance reste indéfiniment sollicitable', async () => {
    const { usecase, ordreRepo } = build();
    ordreRepo.findOne.mockResolvedValue({ ...ordreOuvert, valideJusquAu: null });

    await expect(usecase.execute('ordre-1', 2, 5)).resolves.toMatchObject({
      statut: OrdreMarcheStatus.INTERET_EXPRIME,
    });
  });
});
