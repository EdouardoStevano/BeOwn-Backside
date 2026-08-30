import { DevisCessionService } from './devis-cession.service';
import {
  PlatformFeesService,
  PlatformFeeRates,
  DEFAULT_FEE_RATES,
} from 'src/common/platform-fees/platform-fees.service';

/**
 * Le devis ne doit JAMAIS porter de taux en dur : il lit la grille
 * administrable. Ces tests le prouvent en changeant la grille et en observant
 * le devis bouger.
 */
describe('DevisCessionService', () => {
  /** Vrai service de frais branché sur un dépôt de settings simulé. */
  const serviceAvecGrille = (commissions?: Partial<PlatformFeeRates>) => {
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue(
        commissions ? { id: 'default', settings: { commissions } } : null,
      ),
    };
    const platformFees = new PlatformFeesService(settingsRepo as any);
    return {
      devis: new DevisCessionService(platformFees),
      settingsRepo,
    };
  };

  it('applique les taux par défaut quand aucune grille n\'est enregistrée', async () => {
    const { devis } = serviceAvecGrille();

    const resultat = await devis.calculer({
      nbFractions: 10,
      prixUnitaire: 120,
      prixRevientUnitaire: 100,
    });

    // Montant brut 1 200 ; plus-value 200.
    expect(resultat.montantBrut).toBe(1200);
    expect(resultat.plusValueVendeur).toBe(200);
    // 1 % de 1 200 = 12 ; 15 % de 200 = 30.
    expect(resultat.fraisTransaction).toBe(12);
    expect(resultat.fraisPlusValue).toBe(30);
    expect(resultat.totalFrais).toBe(42);
    expect(resultat.netVendeur).toBe(1158);
    expect(resultat.tauxTransactionPct).toBe(DEFAULT_FEE_RATES.resaleTransactionFeePct);
    expect(resultat.tauxPlusValuePct).toBe(DEFAULT_FEE_RATES.shareSaleGainFeePct);
  });

  it('modifier la grille change le devis — aucun taux en dur', async () => {
    const parDefaut = serviceAvecGrille();
    const grilleModifiee = serviceAvecGrille({
      resaleTransactionFeePct: 5,
      shareSaleGainFeePct: 30,
    });

    const assiette = {
      nbFractions: 10,
      prixUnitaire: 120,
      prixRevientUnitaire: 100,
    };

    const avant = await parDefaut.devis.calculer(assiette);
    const apres = await grilleModifiee.devis.calculer(assiette);

    expect(avant.fraisTransaction).toBe(12); // 1 %
    expect(apres.fraisTransaction).toBe(60); // 5 %
    expect(avant.fraisPlusValue).toBe(30); // 15 %
    expect(apres.fraisPlusValue).toBe(60); // 30 %
    expect(apres.totalFrais).toBe(120);
    expect(apres.netVendeur).toBe(1080);
    expect(apres.tauxTransactionPct).toBe(5);
    expect(apres.tauxPlusValuePct).toBe(30);
  });

  it('aucun frais de plus-value sur une moins-value', async () => {
    const { devis } = serviceAvecGrille();

    const resultat = await devis.calculer({
      nbFractions: 10,
      prixUnitaire: 80,
      prixRevientUnitaire: 100,
    });

    expect(resultat.plusValueVendeur).toBe(0);
    expect(resultat.fraisPlusValue).toBe(0);
    expect(resultat.fraisTransaction).toBe(8);
    expect(resultat.netVendeur).toBe(792);
  });

  it('les frais sont annoncés à la charge du vendeur', async () => {
    const { devis } = serviceAvecGrille();
    const resultat = await devis.calculer({
      nbFractions: 1,
      prixUnitaire: 100,
      prixRevientUnitaire: null,
    });
    expect(resultat.aLaChargeDe).toBe('vendeur');
  });

  it('un snapshot de taux évite toute relecture de la grille par ligne', async () => {
    const { devis, settingsRepo } = serviceAvecGrille({
      resaleTransactionFeePct: 2,
    });

    const taux = await devis.chargerTaux();
    settingsRepo.findOne.mockClear();

    await devis.calculer({ nbFractions: 1, prixUnitaire: 100, prixRevientUnitaire: null }, taux);
    await devis.calculer({ nbFractions: 2, prixUnitaire: 100, prixRevientUnitaire: null }, taux);

    // Trois lignes calculées, zéro lecture supplémentaire : pas de N+1 et pas
    // de dérive de taux en cours de page.
    expect(settingsRepo.findOne).not.toHaveBeenCalled();
  });
});
