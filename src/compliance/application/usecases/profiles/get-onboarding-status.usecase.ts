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

    // Une seule société suffit à établir la nature du compte, et il ne peut
    // pas en exister en même temps qu'un dossier physique — voir
    // `NatureDeDossier`.
    const typeEffectif: TypeInvestisseur | null = profilPP
      ? 'PP'
      : profilsPM.length > 0
        ? 'PM'
        : null;

    // Le type est acquis dès qu'il est annoncé : l'étape 1 du parcours consiste
    // précisément à le choisir, avant qu'aucun profil n'existe. Elle ne pouvait
    // donc jamais s'afficher franchie tant qu'on la déduisait du dossier.
    const typeChoisi = typeEffectif ?? input.typeDeclare ?? null;

    // Le parcours est commencé dès qu'une société est nommée : celui qui en
    // déclare plusieurs n'a pas à toutes les remplir pour avancer.
    const aCommenceSonProfil = !!(
      profilPP?.aRenseigneSonProfil() ??
      profilsPM.some((pm) => pm.identiteLegale.raisonSociale)
    );

    // Le questionnaire est répondu quand il **existe**. La condition lisait
    // `profilPP?.categoriePsfp`, toujours vraie dès qu'un profil PP existe —
    // la catégorie vaut `non_averti` par défaut, jamais vide. L'étape
    // réglementaire s'affichait donc franchie sans qu'une seule question ait
    // été posée, et `isProfileComplete` avec elle.
    //
    // Le raccourci « une personne morale n'a pas à répondre » est conservé tel
    // quel : le corriger changerait l'affichage de tous les comptes PM, ce qui
    // est une décision métier, pas un correctif.
    const questionnaireRepondu =
      conformite.aReponduAuQuestionnaire() || profilsPM.length > 0;

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
          : kycEnCours
            ? 'Vérification en cours par notre équipe'
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
        detail:
          !questionnaireRepondu && aCommenceSonProfil
            ? 'Répondez au questionnaire pour finaliser votre profil réglementaire'
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
