import { GetOnboardingStatusUseCase } from './get-onboarding-status.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/profiles/domains/enums/kyc-status.enum';
import { KycFactory } from 'src/profiles/domains/factories/kyc.factory';
import { ProfilPMFactory } from 'src/profiles/domains/factories/profil-pm.factory';
import { ProfilPPFactory } from 'src/profiles/domains/factories/profil-pp.factory';
import { QuestionnaireAdequationFactory } from 'src/profiles/domains/factories/questionnaire-adequation.factory';
import { KycMapper } from 'src/profiles/domains/mappers/kyc.mapper';
import type { KycRepository } from 'src/profiles/domains/ports/kyc.repository';
import type { ProfilPMRepository } from 'src/profiles/domains/ports/profil-pm.repository';
import type { ProfilPPRepository } from 'src/profiles/domains/ports/profil-pp.repository';
import type { QuestionnaireAdequationRepository } from 'src/profiles/domains/ports/questionnaire-adequation.repository';

const UTILISATEUR = 42;

const profilPPRenseigne = () =>
  ProfilPPFactory.creer({
    utilisateurId: UTILISATEUR,
    prenom: 'Awa',
    nom: 'Koné',
    nationalite: 'FR',
  });

/** Profil créé mais formulaire jamais ouvert : aucun champ du dossier rempli. */
const profilPPVide = () =>
  ProfilPPFactory.creer({
    utilisateurId: UTILISATEUR,
    prenom: 'Awa',
    nom: 'Koné',
  });

const kycAuStatut = (statut: KycStatus) =>
  KycMapper.restore({
    id: 'kyc-1',
    utilisateurId: UTILISATEUR,
    statut,
    niveau: KycNiveau.STANDARD,
    fournisseur: 'stripeIdentity',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

function monter(etat: {
  profilPP?: ReturnType<typeof profilPPVide> | null;
  profilPM?: ReturnType<typeof ProfilPMFactory.creer> | null;
  kyc?: ReturnType<typeof kycAuStatut> | null;
  questionnaire?: ReturnType<
    typeof QuestionnaireAdequationFactory.repondre
  > | null;
} = {}) {
  const useCase = new GetOnboardingStatusUseCase(
    {
      findByUserId: jest.fn().mockResolvedValue(etat.profilPP ?? null),
    } as unknown as ProfilPPRepository,
    {
      findByUserId: jest.fn().mockResolvedValue(etat.profilPM ?? null),
    } as unknown as ProfilPMRepository,
    {
      findByUserId: jest.fn().mockResolvedValue(etat.kyc ?? null),
    } as unknown as KycRepository,
    {
      findByUserId: jest.fn().mockResolvedValue(etat.questionnaire ?? null),
    } as unknown as QuestionnaireAdequationRepository,
  );

  return useCase;
}

const etape = (
  statut: Awaited<ReturnType<GetOnboardingStatusUseCase['execute']>>,
  id: string,
) => statut.completionSteps.find((e) => e.id === id)!;

describe('GetOnboardingStatusUseCase', () => {
  it('part de zéro quand aucun dossier n\'existe', async () => {
    const statut = await monter().execute({ utilisateurId: UTILISATEUR });

    expect(statut.userType).toBeNull();
    expect(statut.completionStep).toBe(0);
    expect(statut.completionProgress).toBe(0);
    expect(statut.isProfileComplete).toBe(false);
    expect(etape(statut, 'user_type').status).toBe('not_started');
  });

  it("tient l'étape « type de compte » pour franchie dès qu'il est annoncé", async () => {
    // Choisir PP ou PM est justement ce qu'on fait avant d'avoir un dossier :
    // déduire le type du dossier rendait cette première étape infranchissable.
    const statut = await monter().execute({
      utilisateurId: UTILISATEUR,
      typeDeclare: 'PP',
    });

    expect(etape(statut, 'user_type').status).toBe('completed');
    expect(statut.completionStep).toBe(1);
    // Le type effectif reste nul : rien n'a encore été ouvert.
    expect(statut.userType).toBeNull();
  });

  it('déduit le type du dossier réellement ouvert', async () => {
    const statut = await monter({ profilPM: ProfilPMFactory.creer({
      utilisateurId: UTILISATEUR,
      raisonSociale: 'BeOwn',
    }) }).execute({ utilisateurId: UTILISATEUR, typeDeclare: 'PP' });

    // Le dossier prime sur l'annonce : c'est lui qui est opposable.
    expect(statut.userType).toBe('PM');
  });

  it("n'affiche pas le questionnaire comme répondu tant qu'il ne l'est pas", async () => {
    // Le défaut historique : la condition lisait `categoriePsfp`, qui vaut
    // `non_averti` par défaut — donc toujours vraie dès qu'un profil existe.
    const statut = await monter({
      profilPP: profilPPRenseigne(),
      kyc: kycAuStatut(KycStatus.VALIDE),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'questionnaire').status).toBe('pending');
    expect(statut.isProfileComplete).toBe(false);
  });

  it('reconnaît un questionnaire réellement rempli', async () => {
    const statut = await monter({
      profilPP: profilPPRenseigne(),
      questionnaire: QuestionnaireAdequationFactory.repondre({
        utilisateurId: UTILISATEUR,
        patrimoineNet: 50_000,
      }),
      kyc: kycAuStatut(KycStatus.VALIDE),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'questionnaire').status).toBe('completed');
    expect(statut.isProfileComplete).toBe(true);
    expect(statut.completionStep).toBe(4);
    expect(statut.completionProgress).toBe(100);
  });

  it('dispense la personne morale du questionnaire, comme avant', async () => {
    // Raccourci historique conservé : le changer relève du métier, pas du
    // correctif.
    const statut = await monter({
      profilPM: ProfilPMFactory.creer({
        utilisateurId: UTILISATEUR,
        raisonSociale: 'BeOwn',
      }),
      kyc: kycAuStatut(KycStatus.VALIDE),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'questionnaire').status).toBe('completed');
    expect(statut.isProfileComplete).toBe(true);
  });

  it.each([
    [KycStatus.EN_COURS, 'pending', 3],
    [KycStatus.EN_REVUE, 'pending', 3],
    [KycStatus.REFUSE, 'error', 2],
    [KycStatus.NON_DEMARRE, 'not_started', 2],
  ])('reflète le dossier KYC %s', async (statutKyc, attendu, rang) => {
    const statut = await monter({
      profilPP: profilPPRenseigne(),
      kyc: kycAuStatut(statutKyc),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'kyc').status).toBe(attendu);
    expect(statut.completionStep).toBe(rang);
  });

  it('reprend le motif de refus opposé au titulaire', async () => {
    const kyc = KycMapper.restore({
      id: 'kyc-1',
      utilisateurId: UTILISATEUR,
      statut: KycStatus.REFUSE,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      motifRefus: 'Document illisible',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const statut = await monter({ kyc }).execute({
      utilisateurId: UTILISATEUR,
    });

    expect(etape(statut, 'kyc').detail).toBe('Document illisible');
  });

  it("distingue le profil ouvert du profil renseigné", async () => {
    const statut = await monter({ profilPP: profilPPVide() }).execute({
      utilisateurId: UTILISATEUR,
    });

    expect(etape(statut, 'profil_investisseur').status).toBe('pending');
    expect(statut.completionStep).toBe(1);
  });

  it("survit à un dossier illisible plutôt que de refuser la page d'accueil", async () => {
    const useCase = new GetOnboardingStatusUseCase(
      {
        findByUserId: jest.fn().mockRejectedValue(new Error('base HS')),
      } as unknown as ProfilPPRepository,
      {
        findByUserId: jest.fn().mockResolvedValue(null),
      } as unknown as ProfilPMRepository,
      {
        findByUserId: jest.fn().mockResolvedValue(kycAuStatut(KycStatus.VALIDE)),
      } as unknown as KycRepository,
      {
        findByUserId: jest.fn().mockResolvedValue(null),
      } as unknown as QuestionnaireAdequationRepository,
    );

    await expect(
      useCase.execute({ utilisateurId: UTILISATEUR }),
    ).resolves.toMatchObject({ profilPP: null });
  });

  it("n'invente pas de dossier KYC quand il n'y en a pas", async () => {
    const statut = await monter({ kyc: KycFactory.creer({
      utilisateurId: UTILISATEUR,
    }) }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'kyc').status).toBe('not_started');
  });
});
