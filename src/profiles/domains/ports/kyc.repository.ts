import { Kyc, KycIdentiteExtrait } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

export const KYC_REPOSITORY = Symbol('KYC_REPOSITORY');

/**
 * Accès en persistance au dossier de vérification d'identité.
 *
 * C'est le port le plus sollicité hors du contexte Profiles : `PaymentController`
 * y branche les webhooks Stripe Identity. Le séparer lui évite de dépendre des
 * profils PP et PM, dont il n'a jamais eu besoin.
 *
 * Voir {@link ProfilPPRepository} pour le pourquoi du découpage par agrégat.
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
