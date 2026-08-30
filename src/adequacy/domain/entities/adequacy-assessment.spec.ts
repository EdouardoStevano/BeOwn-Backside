import { CategoriePsfp } from '../enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from '../enums/etape-questionnaire.enum';
import { NiveauRisque } from '../enums/niveau-risque.enum';
import { ChampProfilInvalideError } from '../errors';
import { QuestionnaireAdequationFactory } from '../factories/questionnaire-adequation.factory';
import { QuestionnaireAdequationMapper } from '../mappers/questionnaire-adequation.mapper';
import { ReponsesQuestionnaire } from './adequacy-assessment';

const repondre = (reponses: ReponsesQuestionnaire = {}) =>
  QuestionnaireAdequationFactory.repondre(reponses);

const REPONSES_PROFESSIONNEL: ReponsesQuestionnaire = {
  workInFinancialSector: true,
  portfolioOver500k: true,
};

const REPONSES_AVERTI: ReponsesQuestionnaire = {
  previousUnlistedInvestments: true,
  investmentExperienceOver5Years: true,
  financialPatrimonyOver500k: true,
  understandsTotalLossRisk: true,
};

describe('QuestionnaireAdequationFactory.repondre', () => {
  it('classe le titulaire à partir de ses seules réponses', () => {
    const questionnaire = repondre({
      ...REPONSES_PROFESSIONNEL,
      patrimoineNet: 800_000,
    });

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.PROFESSIONNEL);
    expect(questionnaire.montantMaxConseille).toBeNull();
  });

  it("n'expose pas le classement au formulaire", () => {
    // Se déclarer « professionnel » dispenserait du délai de rétractation et du
    // plafond d'investissement : la clé est ignorée même si elle atteint la
    // fabrique.
    const questionnaire = repondre({
      resultCategorie: CategoriePsfp.PROFESSIONNEL,
    } as unknown as ReponsesQuestionnaire);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });

  it("laisse la persistance attribuer l'identité de la ligne", () => {
    const questionnaire = repondre();

    expect(questionnaire.id).toBeUndefined();
    expect(questionnaire.createdAt).toBeUndefined();
  });
});

describe('AdequacyAssessment.repondre', () => {
  it('remplace les réponses et recalcule le classement', () => {
    const questionnaire = repondre(REPONSES_PROFESSIONNEL);

    questionnaire.repondre({ patrimoineNet: 40_000 });

    // Les critères du premier passage ne survivent pas : un questionnaire se
    // répond d'un bloc.
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.montantMaxConseille).toBe(2_000);
    expect(questionnaire.preQualification.criteresReunis()).toBe(0);
  });

  it('laisse le questionnaire intact quand une réponse est refusée', () => {
    const questionnaire = repondre(REPONSES_PROFESSIONNEL);

    expect(() =>
      questionnaire.repondre({ ...REPONSES_AVERTI, patrimoineNet: -1 }),
    ).toThrow(ChampProfilInvalideError);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.PROFESSIONNEL);
    expect(questionnaire.preQualification.criteresReunis()).toBe(2);
  });
});

describe('AdequacyAssessment.niveauRisque', () => {
  it('suit le professionnel au rythme le plus espacé', () => {
    expect(repondre(REPONSES_PROFESSIONNEL).niveauRisque()).toBe(
      NiveauRisque.QUALIFIE,
    );
  });

  it("suit l'averti à rythme modéré", () => {
    expect(repondre(REPONSES_AVERTI).niveauRisque()).toBe(NiveauRisque.MODERE);
  });

  it('distingue les non-avertis par leur patrimoine', () => {
    expect(repondre({ patrimoineNet: 150_000 }).niveauRisque()).toBe(
      NiveauRisque.MODERE,
    );
    expect(repondre({ patrimoineNet: 20_000 }).niveauRisque()).toBe(
      NiveauRisque.VULNERABLE,
    );
  });

  it('suit de près le titulaire qui ne déclare aucun patrimoine', () => {
    expect(repondre().niveauRisque()).toBe(NiveauRisque.VULNERABLE);
  });
});

describe('AdequacyAssessment — le parcours en trois étapes', () => {
  const commencer = () => QuestionnaireAdequationFactory.commencer();

  it("n'a franchi aucune étape à l'ouverture", () => {
    const questionnaire = commencer();

    expect(questionnaire.etapesRepondues()).toEqual([]);
    expect(questionnaire.etapeSuivante()).toBe(
      EtapeQuestionnaire.PRE_QUALIFICATION,
    );
  });

  it("distingue une étape répondue « non » d'une étape jamais ouverte", () => {
    // Le cœur du découpage : les trois critères valent `false` par défaut, donc
    // répondre « non » aux trois produit exactement l'état de départ. Seule la
    // date du passage les sépare.
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({
      workInFinancialSector: false,
      moreThan10TransactionsPerQuarter: false,
      portfolioOver500k: false,
    });

    expect(questionnaire.etapesRepondues()).toEqual([
      EtapeQuestionnaire.PRE_QUALIFICATION,
    ]);
    expect(questionnaire.etapeSuivante()).toBe(
      EtapeQuestionnaire.QUALIFICATION,
    );
  });

  it('clôt le questionnaire dès que le titulaire est professionnel', () => {
    // « S'il est considéré comme tel, alors il n'a pas besoin de compléter les
    // étapes suivantes. »
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification(REPONSES_PROFESSIONNEL);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.PROFESSIONNEL);
    expect(questionnaire.etapeSuivante()).toBeNull();
  });

  it("dispense l'averti de la simulation de perte", () => {
    // « Seuls les investisseurs non-avertis doivent compléter l'étape
    // suivante. »
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({});
    questionnaire.repondreALaQualification(REPONSES_AVERTI);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.AVERTI);
    expect(questionnaire.etapeSuivante()).toBeNull();
  });

  it("mène le non-averti jusqu'à la capacité de perte", () => {
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({});
    questionnaire.repondreALaQualification({});

    expect(questionnaire.etapeSuivante()).toBe(
      EtapeQuestionnaire.CAPACITE_DE_PERTE,
    );

    questionnaire.repondreALaCapaciteDePerte({ patrimoineNet: 40_000 });

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
    expect(questionnaire.montantMaxConseille).not.toBeNull();
    expect(questionnaire.etapeSuivante()).toBeNull();
  });

  it("n'efface pas les étapes voisines quand une seule est resoumise", () => {
    // C'est ce que ferait `repondre` avec un formulaire partiel : chaque bloc y
    // est reconstruit depuis le même objet plat, où une clé absente vaut
    // « non ». Les transitions par étape ne touchent que leur propre bloc.
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({});
    questionnaire.repondreALaQualification(REPONSES_AVERTI);
    questionnaire.repondreALaPreQualification({ workInFinancialSector: true });

    expect(questionnaire.qualification.criteresReunis()).toBe(4);
    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.AVERTI);
  });

  it('reclasse à chaque étape, sans attendre la dernière', () => {
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({});
    questionnaire.repondreALaQualification(REPONSES_AVERTI);

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.AVERTI);

    // Le titulaire se ravise : il perd sa qualification dans le même geste.
    questionnaire.repondreALaQualification({});

    expect(questionnaire.categoriePsfp).toBe(CategoriePsfp.NON_AVERTI);
  });

  it('ouvre les étapes attendues et celles déjà répondues, pas les autres', () => {
    const questionnaire = commencer();

    expect(
      questionnaire.etapeEstOuverte(EtapeQuestionnaire.PRE_QUALIFICATION),
    ).toBe(true);
    // Sauter la pré-qualification fonderait le classement sur une étape que
    // personne n'a passée.
    expect(
      questionnaire.etapeEstOuverte(EtapeQuestionnaire.QUALIFICATION),
    ).toBe(false);

    questionnaire.repondreALaPreQualification({});

    // Repasser une étape franchie reste permis : « re-compléter cette étape
    // ainsi que toutes les autres à n'importe quel moment ».
    expect(
      questionnaire.etapeEstOuverte(EtapeQuestionnaire.PRE_QUALIFICATION),
    ).toBe(true);
    expect(
      questionnaire.etapeEstOuverte(EtapeQuestionnaire.CAPACITE_DE_PERTE),
    ).toBe(false);
  });

  it('laisse le questionnaire intact quand un montant est refusé', () => {
    const questionnaire = commencer();
    questionnaire.repondreALaPreQualification({});
    questionnaire.repondreALaQualification({});

    expect(() =>
      questionnaire.repondreALaCapaciteDePerte({ patrimoineNet: -1 }),
    ).toThrow(ChampProfilInvalideError);

    // L'étape n'est pas datée : le titulaire la retrouve à passer.
    expect(questionnaire.etapeSuivante()).toBe(
      EtapeQuestionnaire.CAPACITE_DE_PERTE,
    );
  });

  it('tient le formulaire entier pour les trois étapes franchies', () => {
    // La route historique reste servie, et ne doit pas renvoyer son utilisateur
    // à l'étape 1 après coup.
    const questionnaire = repondre(REPONSES_AVERTI);

    expect(questionnaire.etapesRepondues()).toHaveLength(3);
    expect(questionnaire.etapeSuivante()).toBeNull();
  });
});

describe('AdequacyAssessment — sérialisation', () => {
  const LIGNE = {
    id: 'q-1',
    workInFinancialSector: true,
    moreThan10TransactionsPerQuarter: false,
    portfolioOver500k: true,
    previousUnlistedInvestments: false,
    investmentExperienceOver5Years: false,
    financialPatrimonyOver500k: false,
    understandsTotalLossRisk: true,
    financialSectorBackground: false,
    patrimoineNet: 800_000,
    revenuAnnuel: 90_000,
    budgetAnnuelInvestissement: 10_000,
    acceptsSimulatedLoss: true,
    preQualificationRepondueLe: new Date('2026-01-02T10:00:00.000Z'),
    qualificationRepondueLe: new Date('2026-01-02T10:00:00.000Z'),
    capaciteRepondueLe: new Date('2026-01-02T10:00:00.000Z'),
    resultCategorie: CategoriePsfp.PROFESSIONNEL,
    resultMontantMaxConseille: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
  };

  it('publie les clés de la table, sans ses blocs internes', () => {
    const questionnaire = QuestionnaireAdequationMapper.restore(LIGNE);

    expect(questionnaire.toJSON()).toEqual(LIGNE);
  });

  it('rend les montants en nombres, y compris relus en chaîne', () => {
    const questionnaire = QuestionnaireAdequationMapper.restore({
      ...LIGNE,
      patrimoineNet: '800000.00',
      resultMontantMaxConseille: '1000.00',
    });

    expect(questionnaire.toJSON().patrimoineNet).toBe(800_000);
    expect(questionnaire.toJSON().resultMontantMaxConseille).toBe(1_000);
  });
});
