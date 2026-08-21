import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { Kyc } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

export const PROFIL_REPOSITORY = Symbol('PROFIL_REPOSITORY');

export interface ProfilRepository {
  saveProfilPP(profil: ProfilPP): Promise<ProfilPP>;
  findProfilPPByUserId(userId: number): Promise<ProfilPP | null>;
  updateProfilPP(profil: ProfilPP): Promise<ProfilPP>;

  saveProfilPM(profil: ProfilPM): Promise<ProfilPM>;
  findProfilPMByUserId(userId: number): Promise<ProfilPM | null>;

  saveKyc(kyc: Kyc): Promise<Kyc>;
  findKycByUserId(userId: number): Promise<Kyc | null>;
  findAllKyc(params?: { page?: number; limit?: number }): Promise<{ items: Kyc[]; total: number }>;
  countKycByStatus(status: KycStatus): Promise<number>;
  updateKycStatus(
    kycId: string,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<Kyc>;

  updateKycSession(
    kycId: string,
    sessionId: string,
    status: KycStatus,
  ): Promise<Kyc>;

  updateKycReportData(
    kycId: string,
    reportId: string,
    identiteExtrait: import('src/profiles/domains/kyc').KycIdentiteExtrait,
  ): Promise<Kyc>;
}
