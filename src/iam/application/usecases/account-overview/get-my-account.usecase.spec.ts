import { GetMyAccountUseCase } from './get-my-account.usecase';
import { UtilisateurIntrouvableError } from 'src/iam/domain/errors';
import { NatureProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';
import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from 'src/adequacy/domain/enums/etape-questionnaire.enum';

const UTILISATEUR = 42;

/** Ce que le contexte conformité rend de l'avancement, réduit à l'utile ici. */
const dossier = {
  userType: 'PM',
  profilPP: null,
  profilsPM: [],
  kyc: null,
  classement: {
    categoriePsfp: CategoriePsfp.NON_AVERTI,
    patrimoineDeclare: 50_000,
    montantMaxConseille: 2_000,
  },
  etapeSuivanteQuestionnaire: EtapeQuestionnaire.QUALIFICATION,
  etapesQuestionnaireRepondues: [EtapeQuestionnaire.PRE_QUALIFICATION],
  completionStep: 3,
  completionSteps: [],
  completionProgress: 75,
  isProfileComplete: false,
};

const nomPropre = {
  nature: NatureProfilInvestisseur.PP,
  societeId: null,
  libelle: 'En mon nom propre',
  actif: true,
  aptitude: { peutOperer: true, motifs: [] },
};

const societe = {
  nature: NatureProfilInvestisseur.PM,
  societeId: 'societe-1',
  libelle: 'BeOwn SAS',
  actif: false,
  aptitude: {
    peutOperer: false,
    motifs: [
      {
        code: 'KYB_EN_INSTRUCTION' as const,
        libelle: "Le dossier de la société est en cours d'instruction.",
      },
    ],
  },
};

function monter(
  etat: {
    profils?: (typeof nomPropre)[];
    profilsEnErreur?: boolean;
  } = {},
) {
  const ports = {
    userRepository: {
      findById: jest.fn().mockResolvedValue({
        userType: 'PP',
        toJSON: () => ({ userId: UTILISATEUR, email: 'jean@example.com' }),
      }),
    },
    getOnboardingStatus: { execute: jest.fn().mockResolvedValue(dossier) },
    listerProfilsInvestisseur: {
      execute: etat.profilsEnErreur
        ? jest.fn().mockRejectedValue(new Error('base HS'))
        : jest.fn().mockResolvedValue(etat.profils ?? [nomPropre, societe]),
    },
    getPreferences: { execute: jest.fn().mockResolvedValue({ langue: 'fr' }) },
    documentRepository: { findByUserId: jest.fn().mockResolvedValue([]) },
    walletRepository: { findByUser: jest.fn().mockResolvedValue(null) },
  };

  const useCase = new GetMyAccountUseCase(
    ports.userRepository as never,
    ports.getOnboardingStatus as never,
    ports.listerProfilsInvestisseur as never,
    ports.getPreferences as never,
    ports.documentRepository as never,
    ports.walletRepository as never,
  );

  return { useCase, ports };
}

describe('GetMyAccountUseCase', () => {
  it("refuse de composer la vue d'un compte qui n'existe pas", async () => {
    const { useCase, ports } = monter();
    ports.userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(UTILISATEUR)).rejects.toBeInstanceOf(
      UtilisateurIntrouvableError,
    );
  });

  it('publie au nom de qui le compte agit, et ce que ses autres identités permettent', async () => {
    // `userType` ne répond pas à cette question : il vaut « PM » dès qu'une
    // société est déclarée, y compris quand le titulaire opère en son nom
    // propre. Seul le profil actif le dit.
    const { useCase } = monter();

    const vue = await useCase.execute(UTILISATEUR);

    expect(vue.profilActif).toMatchObject({
      nature: NatureProfilInvestisseur.PP,
      societeId: null,
    });
    expect(vue.profilsDisponibles).toHaveLength(2);
  });

  it("transporte le motif qui empêche une société d'opérer", async () => {
    // Griser une société sans dire pourquoi renvoie le titulaire à deviner
    // s'il lui manque un KBIS, un bénéficiaire ou sa propre vérification.
    const { useCase } = monter();

    const vue = await useCase.execute(UTILISATEUR);

    expect(vue.profilsDisponibles[1].aptitude).toMatchObject({
      peutOperer: false,
      motifs: [{ code: 'KYB_EN_INSTRUCTION' }],
    });
  });

  it('publie le classement PSFP et l’étape de questionnaire qui reste à poser', async () => {
    const { useCase } = monter();

    const vue = await useCase.execute(UTILISATEUR);

    expect(vue.classement.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(vue.etapeSuivanteQuestionnaire).toBe(
      EtapeQuestionnaire.QUALIFICATION,
    );
  });

  it("survit à un sélecteur d'identité indisponible", async () => {
    // Cette route est la page d'accueil de l'espace connecté : elle dégrade,
    // elle ne refuse pas.
    const { useCase } = monter({ profilsEnErreur: true });

    const vue = await useCase.execute(UTILISATEUR);

    expect(vue.profilActif).toBeNull();
    expect(vue.profilsDisponibles).toEqual([]);
  });
});
