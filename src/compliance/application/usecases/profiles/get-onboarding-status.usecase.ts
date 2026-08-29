import { Inject, Injectable } from '@nestjs/common';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { KycCaseSnapshot } from 'src/compliance/domain/entities/kyc-case';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/compliance/domain/repositories/profil-pm.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPP } from 'src/compliance/domain/aggregates/profil-pp';
import { ClassementPsfpSnapshot } from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { EtapeQuestionnaire } from 'src/compliance/domain/enums/etape-questionnaire.enum';

/** Type d'investisseur, tel que le dossier réellement ouvert le montre. */
export type TypeInvestisseur = 'PP' | 'PM';

export type EtatEtape = 'completed' | 'pending' | 'not_started' | 'error';

export interface EtapeOnboarding {
  id: string;
  label: string;
  status: EtatEtape;
  detail?: string;
}

/** Ce que le contexte Profiles sait de l'avancement d'un titulaire. */
export interface OnboardingStatus {
  /** Type effectif — déduit du dossier ouvert, `null` s'il n'y en a aucun. */
  userType: TypeInvestisseur | null;
  profilPP: ProfilPP | null;
  /** Les sociétés déclarées, vide si le compte n'en a aucune. */
  profilsPM: ProfilPM[];
  kyc: KycCaseSnapshot | null;
  /**
   * Le classement PSFP opposable — jamais `null` : qui n'a pas répondu **est**
   * non averti.
   *
   * Il est publié ici parce qu'il n'est plus publié ailleurs : catégorie,
   * patrimoine déclaré et montant conseillé vivaient sur `ProfilPP`, d'où
   * `GET /users/me` les rendait par ricochet. Ils appartiennent désormais à la
   * racine de conformité — pour les deux natures de titulaire, une société
   * n'ayant pas de profil PP où se ranger — et personne ne les avait repris.
   */
  classement: ClassementPsfpSnapshot;
  /**
   * L'étape du questionnaire qu'il reste à poser — `null` quand il est clos.
   *
   * Le questionnaire se répond désormais en trois temps, chacun pouvant clore
   * le parcours selon son propre résultat (un professionnel n'a pas de
   * qualification à passer). Seul le domaine connaît ces seuils : le front
   * n'a pas à les réappliquer pour deviner quel volet afficher.
   */
  etapeSuivanteQuestionnaire: EtapeQuestionnaire | null;
  /** Les étapes déjà franchies, dans l'ordre du parcours. */
  etapesQuestionnaireRepondues: EtapeQuestionnaire[];
  completionStep: number;
  completionSteps: EtapeOnboarding[];
  completionProgress: number;
  isProfileComplete: boolean;
}

export interface OnboardingStatusInput {
  utilisateurId: number;
  /**
   * Type **annoncé** au compte, que le contexte IAM détient. Fourni par
   * l'appelant plutôt que lu ici : le dossier d'investisseur ne connaît pas le
   * compte, et ce serait une dépendance de Profiles vers IAM pour une seule
   * valeur d'affichage.
   */
  typeDeclare?: TypeInvestisseur | null;
}

/**
 * Avancement du parcours d'entrée en relation.
 *
 * Ces quatre étapes — type de compte, profil investisseur, vérification
 * d'identité, questionnaire d'adéquation — sont **le dossier réglementaire**,
 * c'est-à-dire le métier de ce contexte. Elles étaient calculées dans
 * `UserController.getMe`, qui interrogeait cinq contextes et décidait tout seul
 * de ce que « profil complet » veut dire (§12.5). La route reste : elle
 * compose maintenant ce que chaque contexte sait de son côté.
 *
 * Les libellés voyagent avec les statuts, plutôt que d'être recomposés côté
 * présentation. C'est assumé : cette structure est une **projection destinée à
 * l'affichage**, son contrat est celui du front, et séparer le libellé de
 * l'état qu'il décrit obligerait à maintenir la correspondance à deux endroits.
 */
@Injectable()
export class GetOnboardingStatusUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
  ) {}

  async execute(input: OnboardingStatusInput): Promise<OnboardingStatus> {
    const { utilisateurId } = input;

    // Un dossier absent n'est pas une erreur : c'est l'état de départ. Les
    // quatre lectures sont indépendantes, donc menées de front.
    // Le dossier de conformité arrive d'un bloc : dossier de vérification et
    // questionnaire sont deux pièces d'une même racine, et se lisaient
    // auparavant par deux ports séparés — donc deux requêtes pour un seul
    // objet métier.
    const [profilPP, profilsPM, conformite] = await Promise.all([
      this.profilPPRepository.findByUserId(utilisateurId).catch(() => null),
      this.profilPMRepository
        .listerParUtilisateur(utilisateurId)
        // Le type de repli est explicite : un `[]` nu s'infère `never[]`, et
        // l'union avec `ProfilPM[]` prive `some` du type de son paramètre.
        .catch((): ProfilPM[] => []),
      this.profils.findByInvestorId(utilisateurId),
    ]);

    // Les deux coexistent désormais : un compte a son dossier physique **et**
    // ses sociétés. `userType` n'est donc plus une nature — c'est un raccourci
    // d'affichage, et la société l'emporte parce qu'elle est ce qui distingue
    // ce compte des autres : tout titulaire finit par avoir un dossier
    // physique, seul celui qui investit par une société en déclare une.
    //
    // L'ordre était l'inverse. Le laisser tel quel aurait fait afficher « PP »
    // à tout compte moral dès qu'il aurait renseigné son identité — c'est-à-dire
    // à tous, l'identité du représentant étant requise.
    const typeEffectif: TypeInvestisseur | null =
      profilsPM.length > 0 ? 'PM' : profilPP ? 'PP' : null;

    // Le type est acquis dès qu'il est annoncé : l'étape 1 du parcours consiste
    // précisément à le choisir, avant qu'aucun profil n'existe. Elle ne pouvait
    // donc jamais s'afficher franchie tant qu'on la déduisait du dossier.
    const typeChoisi = typeEffectif ?? input.typeDeclare ?? null;

    // Le parcours est commencé dès qu'une société est nommée : celui qui en
    // déclare plusieurs n'a pas à toutes les remplir pour avancer.
    //
    // `||`, et non `??` : ce dernier ne regardait les sociétés que si le
    // dossier physique était **absent**. Les deux coexistant maintenant, un
    // compte qui déclare sa société avant de saisir son adresse a un dossier
    // physique vide, `aRenseigneSonProfil()` rend `false`, et l'étape se serait
    // affichée non commencée alors qu'une société est nommée.
    const aCommenceSonProfil =
      (profilPP?.aRenseigneSonProfil() ?? false) ||
      profilsPM.some((pm) => pm.identiteLegale.raisonSociale);

    // Le questionnaire est répondu quand il est **clos**, c'est-à-dire quand il
    // ne reste aucune étape à poser. La condition lisait son seule existence
    // (`aReponduAuQuestionnaire`), ce qui était juste tant que le formulaire
    // arrivait d'un bloc : depuis qu'il se répond en trois temps, répondre à la
    // pré-qualification suffisait à faire naître le questionnaire — donc à
    // afficher l'étape réglementaire franchie, et `isProfileComplete` avec
    // elle, à qui n'avait passé qu'un tiers du parcours.
    //
    // Le raccourci « une personne morale n'a pas à répondre » est conservé tel
    // quel : le corriger changerait l'affichage de tous les comptes PM, ce qui
    // est une décision métier, pas un correctif.
    const etapeSuivanteQuestionnaire =
      conformite.etapeSuivanteDuQuestionnaire();
    const questionnaireRepondu =
      etapeSuivanteQuestionnaire === null || profilsPM.length > 0;

    const kycValide = conformite.statutKyc === KycStatus.VALIDE;
    const kycRefuse = conformite.statutKyc === KycStatus.REFUSE;
    const kycEnCours =
      conformite.statutKyc === KycStatus.EN_COURS ||
      conformite.statutKyc === KycStatus.EN_REVUE;

    const completionSteps: EtapeOnboarding[] = [
      {
        id: 'user_type',
        label:
          typeChoisi === 'PP'
            ? 'Type de compte — Personne physique'
            : typeChoisi === 'PM'
              ? 'Type de compte — Personne morale'
              : 'Type de compte (PP / PM)',
        status: typeChoisi ? 'completed' : 'not_started',
        detail: typeChoisi
          ? undefined
          : 'Choisissez votre type de compte pour commencer',
      },
      {
        id: 'profil_investisseur',
        label: 'Profil investisseur',
        status: aCommenceSonProfil
          ? 'completed'
          : typeChoisi
            ? 'pending'
            : 'not_started',
        detail:
          typeChoisi && !aCommenceSonProfil
            ? 'Complétez vos informations personnelles ou entreprise'
            : undefined,
      },
      {
        id: 'kyc',
        label: "Vérification d'identité (KYC)",
        status: kycValide
          ? 'completed'
          : kycRefuse
            ? 'error'
            : kycEnCours
              ? 'pending'
              : 'not_started',
        detail: kycRefuse
          ? (conformite.motifRefusKyc ??
            'KYC refusé — resoumettez vos documents')
          : // La revue manuelle est nommée à part : le titulaire qui vient de
            // déposer sa pièce à la main attend une **personne**, pas un
            // prestataire, et le délai n'est pas le même. Confondre les deux
            // le laissait rafraîchir une page en espérant une réponse
            // automatique qui ne viendra pas.
            conformite.estEnRevueManuelle()
            ? "Vos documents sont en cours d'examen par notre équipe conformité"
            : kycEnCours
              ? 'Vérification en cours chez notre prestataire'
              : kycValide
                ? undefined
                : "Soumettez vos documents d'identité",
      },
      {
        id: 'questionnaire',
        label: "Questionnaire d'adéquation",
        status: questionnaireRepondu
          ? 'completed'
          : aCommenceSonProfil
            ? 'pending'
            : 'not_started',
        // Le parcours étant en trois temps, le détail dit s'il est à commencer
        // ou à reprendre : « répondez au questionnaire » à qui en a déjà passé
        // deux tiers lui laisse croire que ses réponses sont perdues.
        detail:
          !questionnaireRepondu && aCommenceSonProfil
            ? conformite.etapesReponduesDuQuestionnaire().length > 0
              ? 'Reprenez votre questionnaire là où vous vous êtes arrêté'
              : 'Répondez au questionnaire pour finaliser votre profil réglementaire'
            : undefined,
      },
    ];

    const franchies = completionSteps.filter(
      (etape) => etape.status === 'completed',
    ).length;

    return {
      userType: typeEffectif,
      profilPP,
      profilsPM,
      kyc: conformite.dossierKycPublie,
      classement: conformite.classement.toSnapshot(),
      etapeSuivanteQuestionnaire,
      etapesQuestionnaireRepondues: conformite.etapesReponduesDuQuestionnaire(),
      completionStep: etapeCourante({
        typeChoisi: !!typeChoisi,
        aCommenceSonProfil,
        kycEnCoursOuValide: kycEnCours || kycValide,
        kycValide,
      }),
      completionSteps,
      completionProgress: Math.round(
        (franchies / completionSteps.length) * 100,
      ),
      isProfileComplete: kycValide && questionnaireRepondu,
    };
  }
}

/**
 * Rang de l'étape atteinte, de 0 à 4 — ce que le front affiche en fil
 * d'Ariane. Volontairement distinct du décompte des étapes franchies : le
 * parcours est séquentiel, on n'est pas « à l'étape 3 » parce qu'on a franchi
 * trois étapes quelconques.
 */
function etapeCourante(avancement: {
  typeChoisi: boolean;
  aCommenceSonProfil: boolean;
  kycEnCoursOuValide: boolean;
  kycValide: boolean;
}): number {
  if (avancement.kycValide) return 4;
  if (avancement.kycEnCoursOuValide) return 3;
  if (avancement.aCommenceSonProfil) return 2;
  if (avancement.typeChoisi) return 1;
  return 0;
}
