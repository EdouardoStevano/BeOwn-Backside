import { KycCase, KycIdentiteExtrait } from 'src/compliance/domain/entities/kyc-case';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';

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
  save(kyc: KycCase): Promise<KycCase>;
  findByUserId(userId: number): Promise<KycCase | null>;
  findAll(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: KycCase[]; total: number }>;

  updateStatus(
    kycId: string,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<KycCase>;

  /** Rattache la session Stripe Identity ouverte pour ce dossier. */
  updateSession(
    kycId: string,
    sessionId: string,
    status: KycStatus,
  ): Promise<KycCase>;

  /** Enregistre le rapport de vérification et l'identité qu'il a extraite. */
  updateReportData(
    kycId: string,
    reportId: string,
    identiteExtrait: KycIdentiteExtrait,
  ): Promise<KycCase>;
}
