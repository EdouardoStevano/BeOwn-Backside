import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
  type VerificationSessionResult,
} from 'src/compliance/application/ports/identity-verification.port';

/**
 * Qui demande, et à quel titre.
 *
 * `peutConsulterToutDossier` est la **conclusion** du contrôle de permission,
 * pas la permission elle-même : la présentation traduit `kyc:validate` en
 * booléen, l'application n'a pas à connaître le nom d'une permission ni la
 * table des rôles. La règle qui reste ici est celle qui parle de dossiers —
 * une session appartient au dossier qui la référence.
 */
export interface DemandeurDeSession {
  utilisateurId: number;
  peutConsulterToutDossier: boolean;
}

/**
 * Consultation et annulation d'une session de vérification.
 *
 * Les deux gestes partagent exactement la même garde d'accès, d'où un seul use
 * case : les séparer dupliquerait `assertProprietaire` sans rien clarifier.
 *
 * Cette garde vivait dans `PaymentController.assertCanAccessKycSession`. Sans
 * elle, un identifiant `vs_xxx` deviné donnait accès au statut de vérification
 * d'un tiers — et à l'annulation de sa session.
 */
@Injectable()
export class ConsultKycSessionUseCase {
  constructor(
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
  ) {}

  async consulter(
    sessionId: string,
    demandeur: DemandeurDeSession,
  ): Promise<VerificationSessionResult> {
    await this.assertProprietaire(sessionId, demandeur);
    return this.identity.retrieveVerificationSession(sessionId);
  }

  async annuler(
    sessionId: string,
    demandeur: DemandeurDeSession,
  ): Promise<void> {
    await this.assertProprietaire(sessionId, demandeur);
    return this.identity.cancelVerificationSession(sessionId);
  }

  private async assertProprietaire(
    sessionId: string,
    demandeur: DemandeurDeSession,
  ): Promise<void> {
    if (demandeur.peutConsulterToutDossier) return;

    const profil = await this.profils.findByInvestorId(demandeur.utilisateurId);
    if (profil.sessionDeVerification === sessionId) return;

    throw new ForbiddenException('Acces refuse.');
  }
}
