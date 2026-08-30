import { GetKycImagesUseCase } from './get-kyc-images.usecase';
import type { DossierKycPublie } from 'src/onboarding/application/ports/dossier-kyc.query';
import type { KycReportData } from 'src/onboarding/application/ports/identity-verification.port';

const TITULAIRE = 42;

const rapport = (): KycReportData => ({
  reportId: 'vr_1',
  nom: 'Dupont',
  prenom: 'Jean',
  documentFrontFileId: 'file_front',
  documentBackFileId: 'file_back',
  selfieFileId: 'file_selfie',
});

const dossier = (etat: Partial<DossierKycPublie> = {}) =>
  ({
    investorId: TITULAIRE,
    fournisseurRef: 'vs_1',
    stripeReportId: null,
    identiteExtrait: null,
    ...etat,
  }) as DossierKycPublie;

function monter(
  etat: {
    dossier?: DossierKycPublie | null;
    rapportDistant?: KycReportData | null;
  } = {},
) {
  const dossiers = {
    parTitulaire: jest
      .fn()
      .mockResolvedValue(etat.dossier === undefined ? dossier() : etat.dossier),
  };
  const identity = {
    extractReportData: jest
      .fn()
      .mockResolvedValue(
        etat.rapportDistant === undefined ? rapport() : etat.rapportDistant,
      ),
    getImageUrls: jest
      .fn()
      .mockResolvedValue({ documentFrontUrl: 'https://…/front.jpg' }),
  };

  const useCase = new GetKycImagesUseCase(dossiers as never, identity as never);

  return { useCase, dossiers, identity };
}

describe('GetKycImagesUseCase', () => {
  it("sert l'archive quand nous en avons une, sans interroger le fournisseur", async () => {
    // La copie locale est pérenne : les identifiants de fichier du
    // fournisseur, eux, expirent. Elle prime, et évite un aller-retour réseau
    // à chaque consultation d'un écran d'administration.
    const { useCase, identity } = monter({
      dossier: dossier({
        stripeReportId: 'vr_archive',
        identiteExtrait: {
          nom: 'Dupont',
          documentFrontFileId: 'https://cdn/…',
        },
      }),
    });

    const resultat = await useCase.execute(TITULAIRE);

    expect(resultat).toMatchObject({
      available: true,
      source: 'archive',
      stripeReportId: 'vr_archive',
    });
    expect(identity.extractReportData).not.toHaveBeenCalled();
  });

  it('va chercher les pièces chez le fournisseur quand le webhook n’a rien archivé', async () => {
    // Le cas qui bloquait : les documents sont chez le prestataire, le webhook
    // n'est jamais arrivé, et l'équipe conformité ne voyait donc rien du
    // dossier qu'elle doit précisément examiner.
    const { useCase, identity } = monter();

    const resultat = await useCase.execute(TITULAIRE);

    expect(identity.extractReportData).toHaveBeenCalledWith('vs_1');
    expect(resultat).toMatchObject({
      available: true,
      source: 'fournisseur',
      stripeReportId: 'vr_1',
      identiteExtrait: { nom: 'Dupont', prenom: 'Jean' },
    });
  });

  it('résout les URLs depuis les identifiants lus chez le fournisseur', async () => {
    const { useCase, identity } = monter();

    await useCase.execute(TITULAIRE);

    expect(identity.getImageUrls).toHaveBeenCalledWith({
      documentFrontFileId: 'file_front',
      documentBackFileId: 'file_back',
      selfieFileId: 'file_selfie',
    });
  });

  it("n'interroge pas le fournisseur quand aucune session n'a été ouverte", async () => {
    const { useCase, identity } = monter({
      dossier: dossier({ fournisseurRef: null }),
    });

    const resultat = await useCase.execute(TITULAIRE);

    expect(resultat).toEqual({ available: false });
    expect(identity.extractReportData).not.toHaveBeenCalled();
  });

  it('rend « indisponible » quand le fournisseur n’a pas encore de rapport', async () => {
    // Une session ouverte mais non aboutie : il n'y a rien à montrer, et ce
    // n'est pas une erreur.
    const { useCase } = monter({ rapportDistant: null });

    expect(await useCase.execute(TITULAIRE)).toEqual({ available: false });
  });

  it('rend « indisponible » quand le titulaire n’a aucun dossier', async () => {
    const { useCase, identity } = monter({ dossier: null });

    expect(await useCase.execute(TITULAIRE)).toEqual({ available: false });
    expect(identity.extractReportData).not.toHaveBeenCalled();
  });
});
