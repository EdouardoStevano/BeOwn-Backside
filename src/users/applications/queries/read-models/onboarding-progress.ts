import { UserType } from 'src/users/domains/enums/user.enum';

export type OnboardingStepStatus =
  | 'completed'
  | 'pending'
  | 'not_started'
  | 'error';

export interface OnboardingStep {
  id: string;
  label: string;
  status: OnboardingStepStatus;
  detail?: string;
}

export interface OnboardingProgress {
  inferredType: UserType | null;
  completionStep: number;
  completionSteps: OnboardingStep[];
  completionProgress: number;
  isProfileComplete: boolean;
}

export interface OnboardingInput {
  userType: UserType | null;
  profilPP: {
    nationalite?: unknown;
    dateNaissance?: unknown;
    adresseLigne1?: unknown;
    categoriePsfp?: unknown;
  } | null;
  profilPM: { raisonSociale?: unknown } | null;
  kycStatut: string;
  kycMotifRefus?: string | null;
}

/**
 * Règle d'avancement du parcours d'inscription réglementaire (type de compte →
 * profil → KYC → questionnaire d'adéquation).
 *
 * Fonction pure, sans I/O : c'est une règle métier, elle est testable seule et
 * ne vit plus dans le contrôleur HTTP.
 */
export function buildOnboardingProgress(
  input: OnboardingInput,
): OnboardingProgress {
  const { profilPP, profilPM, kycStatut } = input;

  // Le type peut être déduit des profils déjà remplis quand la colonne
  // dédiée n'a jamais été renseignée (comptes créés avant son introduction).
  const inferredType: UserType | null =
    input.userType ?? (profilPP ? UserType.PP : profilPM ? UserType.PM : null);

  const hasUserType = !!inferredType;
  const hasProfilData = !!(
    profilPP?.nationalite ||
    profilPP?.dateNaissance ||
    profilPP?.adresseLigne1 ||
    profilPM?.raisonSociale
  );
  const questionnaireCompleted = !!(profilPP?.categoriePsfp || profilPM);

  const kycCompleted = kycStatut === 'valide';
  const kycPending = ['en_cours', 'en_revue'].includes(kycStatut);
  const kycRefused = kycStatut === 'refuse';

  const completionSteps: OnboardingStep[] = [
    {
      id: 'user_type',
      label:
        inferredType === UserType.PP
          ? 'Type de compte — Personne physique'
          : inferredType === UserType.PM
            ? 'Type de compte — Personne morale'
            : 'Type de compte (PP / PM)',
      status: hasUserType ? 'completed' : 'not_started',
      detail: !hasUserType
        ? 'Choisissez votre type de compte pour commencer'
        : undefined,
    },
    {
      id: 'profil_investisseur',
      label: 'Profil investisseur',
      status: hasProfilData
        ? 'completed'
        : hasUserType
          ? 'pending'
          : 'not_started',
      detail:
        hasUserType && !hasProfilData
          ? 'Complétez vos informations personnelles ou entreprise'
          : undefined,
    },
    {
      id: 'kyc',
      label: "Vérification d'identité (KYC)",
      status: kycCompleted
        ? 'completed'
        : kycRefused
          ? 'error'
          : kycPending
            ? 'pending'
            : 'not_started',
      detail: kycRefused
        ? (input.kycMotifRefus ?? 'KYC refusé — resoumettez vos documents')
        : kycPending
          ? 'Vérification en cours par notre équipe'
          : !kycCompleted
            ? "Soumettez vos documents d'identité"
            : undefined,
    },
    {
      id: 'questionnaire',
      label: "Questionnaire d'adéquation",
      status: questionnaireCompleted
        ? 'completed'
        : hasProfilData
          ? 'pending'
          : 'not_started',
      detail:
        !questionnaireCompleted && hasProfilData
          ? 'Répondez au questionnaire pour finaliser votre profil réglementaire'
          : undefined,
    },
  ];

  const completedCount = completionSteps.filter(
    (step) => step.status === 'completed',
  ).length;

  let completionStep = 0;
  if (hasUserType) completionStep = 1;
  if (hasProfilData) completionStep = 2;
  if (kycPending || kycCompleted) completionStep = 3;
  if (kycCompleted) completionStep = 4;

  return {
    inferredType,
    completionStep,
    completionSteps,
    completionProgress: Math.round(
      (completedCount / completionSteps.length) * 100,
    ),
    isProfileComplete: kycCompleted && questionnaireCompleted,
  };
}
