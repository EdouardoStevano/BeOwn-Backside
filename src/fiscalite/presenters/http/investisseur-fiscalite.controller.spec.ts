import { NotFoundException } from '@nestjs/common';
import { InvestisseurFiscaliteController } from './investisseur-fiscalite.controller';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';

/**
 * Minimisation (art. 5.1.c RGPD) : la résidence fiscale et le NIF étaient
 * collectés au profil, validés, stockés et exportés — et lus par AUCUN calcul
 * ni AUCUN document. Deux issues : cesser de les collecter, ou leur rendre
 * l'usage réglementaire qui les justifie. C'est la seconde qui a été retenue
 * (art. 242 ter CGI pour la déclaration des revenus de capitaux mobiliers ;
 * art. 1649 AC CGI / DAC2-CRS pour l'identification d'un bénéficiaire
 * non-résident) : les deux champs figurent désormais au cadre « Bénéficiaire »
 * du récapitulatif fiscal.
 */
describe('InvestisseurFiscaliteController — identification fiscale de l’IFU', () => {
  const investisseur: ActiveUser = {
    userId: 42,
    email: 'jean@example.com',
    role: 'investisseur',
  };

  const construire = (profil: unknown) => {
    const docRepo = { findByUser: jest.fn(), findByUserEtAnnee: jest.fn() };
    const generateUseCase = {
      execute: jest.fn().mockResolvedValue({
        userId: 42,
        annee: 2026,
        montantBrut: 1000,
        montantIR: 128,
        montantCSG: 172,
        montantNet: 700,
      }),
    };
    const pdfService = { streamToResponse: jest.fn() };
    const userRepo = {
      findById: jest.fn().mockResolvedValue({
        firstname: 'Jean',
        lastname: 'Dupont',
        email: 'jean@example.com',
      }),
    };
    const profilRepo = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(profil),
    };
    const controller = new InvestisseurFiscaliteController(
      docRepo as any,
      generateUseCase as any,
      pdfService as any,
      userRepo as any,
      profilRepo as any,
    );
    return { controller, pdfService, generateUseCase, profilRepo };
  };

  const res = {} as any;

  it('transmet la résidence fiscale et le NIF déclarés au générateur', async () => {
    const { controller, pdfService } = construire({
      residenceFiscale: 'BE',
      nif: '00.00.00-000.00',
    });

    await controller.download('2026', investisseur, res);

    expect(pdfService.streamToResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 42,
        firstName: 'Jean',
        lastName: 'Dupont',
        residenceFiscale: 'BE',
        nif: '00.00.00-000.00',
      }),
      res,
    );
  });

  /**
   * Ni l'un ni l'autre n'est obligatoire au profil : un IFU d'investisseur
   * résident sans NIF reste parfaitement valide. Un champ vide ne doit pas
   * produire une ligne vide sur le document — il ne produit rien.
   */
  it.each([
    ['profil absent (personne morale, onboarding inachevé)', null],
    ['profil sans identification fiscale', { residenceFiscale: null, nif: null }],
  ])('%s : les deux champs valent null, jamais undefined', async (_l, profil) => {
    const { controller, pdfService } = construire(profil);

    await controller.download('2026', investisseur, res);

    const investorInfo = pdfService.streamToResponse.mock.calls[0][1];
    expect(investorInfo.residenceFiscale).toBeNull();
    expect(investorInfo.nif).toBeNull();
  });

  it('aucune distribution sur l’année : 404, et le profil n’est même pas lu', async () => {
    const { controller, generateUseCase, profilRepo } = construire(null);
    generateUseCase.execute.mockResolvedValue({
      userId: 42,
      annee: 2026,
      montantBrut: 0,
      montantIR: 0,
      montantCSG: 0,
      montantNet: 0,
    });

    await expect(
      controller.download('2026', investisseur, res),
    ).rejects.toThrow(NotFoundException);
    expect(profilRepo.findProfilPPByUserId).not.toHaveBeenCalled();
  });
});
