import { Kyc, KycIdentiteExtrait } from 'src/kyc/domains/kyc';
import { KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';

export const KYC_REPOSITORY = Symbol('KYC_REPOSITORY');

/**
 * Accès en persistance au dossier de vérification d'identité.
 *
 * Le port par lequel tout le monde passe : les use cases de ce contexte, mais
 * aussi `GetOnboardingStatusUseCase` (Profiles) et `GetUserAccountUseCase`
 * (Account Overview), qui composent l'avancement du dossier avec ce que leur
 * propre contexte sait. Il vivait dans `profiles/domains/ports/` alors qu'aucun
 * profil n'en dépend — c'est ce qui a motivé le découpage.
 */
export interface KycRepository {
  save(kyc: Kyc): Promise<Kyc>;
  findByUserId(userId: number): Promise<Kyc | null>;
  findAll(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: Kyc[]; total: number }>;

  updateStatus(
    kycId: string,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<Kyc>;

  /** Rattache la session Stripe Identity ouverte pour ce dossier. */
  updateSession(
    kycId: string,
    sessionId: string,
    status: KycStatus,
  ): Promise<Kyc>;

  /** Enregistre le rapport de vérification et l'identité qu'il a extraite. */
  updateReportData(
    kycId: string,
    reportId: string,
    identiteExtrait: KycIdentiteExtrait,
  ): Promise<Kyc>;
}
