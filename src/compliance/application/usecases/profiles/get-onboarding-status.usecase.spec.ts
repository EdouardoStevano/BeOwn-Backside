import { GetOnboardingStatusUseCase } from './get-onboarding-status.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { KycFactory } from 'src/compliance/domain/factories/kyc.factory';
import { ProfilPMFactory } from 'src/compliance/domain/factories/profil-pm.factory';
import { ProfilPPFactory } from 'src/compliance/domain/factories/profil-pp.factory';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import type { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import type { ProfilPMRepository } from 'src/compliance/domain/repositories/profil-pm.repository';
import type { ProfilPPRepository } from 'src/compliance/domain/repositories/profil-pp.repository';

const UTILISATEUR = 42;

const profilPPRenseigne = () =>
  ProfilPPFactory.creer({
    userId: UTILISATEUR,
    nationalite: 'FR',
  });

/** Profil créé mais formulaire jamais ouvert : aucun champ du dossier rempli. */
const profilPPVide = () => ProfilPPFactory.creer({ userId: UTILISATEUR });

const kycAuStatut = (statut: KycStatus) =>
  KycMapper.restore({
    id: 'kyc-1',
    statut,
    niveau: KycNiveau.STANDARD,
    fournisseur: 'stripeIdentity',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

function monter(
  etat: {
    profilPP?: ReturnType<typeof profilPPVide> | null;
    profilPM?: ReturnType<typeof ProfilPMFactory.creer> | null;
    kyc?: ReturnType<typeof kycAuStatut> | null;
    questionnaire?: ReturnType<
      typeof QuestionnaireAdequationFactory.repondre
    > | null;
  } = {},
) {
  const useCase = new GetOnboardingStatusUseCase(
    {
      findByUserId: jest.fn().mockResolvedValue(etat.profilPP ?? null),
    } as unknown as ProfilPPRepository,
    {
      // Le port rend la liste des sociétés du compte : le montage n'en pose
      // qu'une, ce qui suffit à établir la nature du dossier.
      listerParUtilisateur: jest
        .fn()
        .mockResolvedValue(etat.profilPM ? [etat.profilPM] : []),
    } as unknown as ProfilPMRepository,
    {
      // Dossier de vérification et questionnaire sont deux pièces d'une même
      // racine : une seule lecture les rend toutes les deux.
      findByInvestorId: jest.fn().mockResolvedValue(
        new InvestorComplianceProfile({
          investorId: UTILISATEUR,
          kycCase: etat.kyc ?? null,
          adequacy: etat.questionnaire ?? null,
        }),
      ),
    } as unknown as InvestorComplianceProfileRepository,
  );

  return useCase;
}

const etape = (
  statut: Awaited<ReturnType<GetOnboardingStatusUseCase['execute']>>,
  id: string,
) => statut.completionSteps.find((e) => e.id === id)!;

describe('GetOnboardingStatusUseCase', () => {
  it("part de zéro quand aucun dossier n'existe", async () => {
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
    const statut = await monter({
      profilPM: ProfilPMFactory.creer({
        userId: UTILISATEUR,
        raisonSociale: 'BeOwn',
      }),
    }).execute({ utilisateurId: UTILISATEUR, typeDeclare: 'PP' });

    // Le dossier prime sur l'annonce : c'est lui qui est opposable.
    expect(statut.userType).toBe('PM');
  });

  it('affiche « PM » au représentant légal, qui a aussi son dossier physique', async () => {
    // Les deux coexistent : le dossier physique est l'identité du représentant,
    // la société ce par quoi il investit. `userType` lisait le dossier physique
    // d'abord — un compte moral se serait donc affiché « PP » dès qu'il aurait
    // renseigné son identité, c'est-à-dire toujours, puisqu'elle est requise.
    const statut = await monter({
      profilPP: profilPPRenseigne(),
      profilPM: ProfilPMFactory.creer({
        userId: UTILISATEUR,
        raisonSociale: 'BeOwn',
      }),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(statut.userType).toBe('PM');
  });

  it('tient le profil pour commencé dès la société, dossier physique vide', async () => {
    // L'ordre de remplissage est libre. La condition enchaînait les deux
    // sources par `??`, qui ne regarde la seconde que si la première est
    // absente : un dossier physique vide — donc présent — masquait la société.
    const statut = await monter({
      profilPP: profilPPVide(),
      profilPM: ProfilPMFactory.creer({
        userId: UTILISATEUR,
        raisonSociale: 'BeOwn',
      }),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'profil_investisseur').status).toBe('completed');
    expect(statut.completionStep).toBe(2);
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
        userId: UTILISATEUR,
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

  it('distingue le profil ouvert du profil renseigné', async () => {
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
        listerParUtilisateur: jest.fn().mockResolvedValue([]),
      } as unknown as ProfilPMRepository,
      {
        findByInvestorId: jest.fn().mockResolvedValue(
          new InvestorComplianceProfile({
            investorId: UTILISATEUR,
            kycCase: kycAuStatut(KycStatus.VALIDE),
            adequacy: null,
          }),
        ),
      } as unknown as InvestorComplianceProfileRepository,
    );

    await expect(
      useCase.execute({ utilisateurId: UTILISATEUR }),
    ).resolves.toMatchObject({ profilPP: null });
  });

  it("n'invente pas de dossier KYC quand il n'y en a pas", async () => {
    const statut = await monter({
      kyc: KycFactory.creer(),
    }).execute({ utilisateurId: UTILISATEUR });

    expect(etape(statut, 'kyc').status).toBe('not_started');
  });
});
