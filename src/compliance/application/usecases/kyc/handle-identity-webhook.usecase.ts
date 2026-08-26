import { Inject, Injectable, Logger } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  statutPourVerdict,
  SuiteDuVerdict,
  VerdictIdentite,
} from 'src/compliance/domain/value-objects/verdict-identite';
import {
  EvenementIdentiteTranslator,
  type EvenementDeVerification,
} from 'src/compliance/application/acl/evenement-identite.translator';
import { AnnoncesKycService } from 'src/compliance/application/services/annonces-kyc.service';
import { ArchivageRapportKycService } from 'src/compliance/application/services/archivage-rapport-kyc.service';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';

/**
 * Traitement des événements de vérification d'identité.
 *
 * Ce use case **n'a plus de règle métier à lui**, et c'est le but : il traduit,
 * charge le dossier, lui demande quoi faire du verdict, obéit, puis laisse les
 * services annoncer et archiver (§14). Il portait auparavant trois tables de
 * transition statiques, une garde recopiée trois fois, le parsing du JSON
 * Stripe, deux blocs de notifications et le téléchargement des pièces — 426
 * lignes où la machine à états du KYC était noyée.
 *
 * Ce qui est parti, et où :
 *
 * - **quel verdict s'applique à quel statut** → le domaine, par
 *   `InvestorComplianceProfile.accueillirVerdict` et l'entité qu'elle
 *   médiatise, où la règle est testable sans mock ;
 * - **la forme JSON du fournisseur** → {@link EvenementIdentiteTranslator}, une
 *   ACL (§20) ;
 * - **notifications et journal d'audit** → {@link AnnoncesKycService} ;
 * - **rapport et pièces justificatives** → {@link ArchivageRapportKycService}.
 *
 * **La vérification de signature reste chez Payments.** L'endpoint Stripe est
 * partagé entre paiements et vérification d'identité : `PaymentController`
 * authentifie l'événement, puis passe les `identity.*` ici. Ce contexte ne
 * reçoit que des événements déjà prouvés authentiques, et ne dépend d'aucun
 * module de paiement pour autant — la flèche va de Payments vers KYC, jamais
 * l'inverse.
 */
@Injectable()
export class HandleIdentityWebhookUseCase {
  private readonly logger = new Logger(HandleIdentityWebhookUseCase.name);

  constructor(
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    private readonly annonces: AnnoncesKycService,
    private readonly archivage: ArchivageRapportKycService,
  ) {}

  /** Vrai si cet événement relève de la vérification d'identité. */
  static concerne(eventType: string): boolean {
    return EvenementIdentiteTranslator.concerne(eventType);
  }

  /**
   * Point d'entrée unique.
   *
   * **Aucun chemin ne lève.** Un événement illisible, orphelin ou écarté est un
   * no-op journalisé : le fournisseur traite une exception comme un échec de
   * livraison et rejoue l'événement, indéfiniment pour une donnée qui ne
   * deviendra jamais valide.
   */
  async handle(event: unknown): Promise<void> {
    const fait = EvenementIdentiteTranslator.traduire(event);
    if (!fait) return;

    const profil = await this.profils.findByInvestorId(fait.utilisateurId);
    if (!profil.aUnDossierKyc()) {
      this.logger.warn(
        `Vérification d'identité : dossier introuvable pour userId=${fait.utilisateurId} ` +
          `(session=${fait.sessionId}) — no-op`,
      );
      return;
    }

    switch (profil.accueillirVerdict(fait.verdict, fait.sessionId)) {
      case SuiteDuVerdict.DEJA_APPLIQUE:
        this.logger.debug(
          `Verdict ${fait.verdict} déjà appliqué (redélivrance) : userId=${fait.utilisateurId}`,
        );
        return;

      case SuiteDuVerdict.ECARTE:
        // Le cas qui mérite d'être vu : le dossier a évolué autrement depuis,
        // typiquement par une décision du RCCI que ce verdict aurait écrasée.
        this.logger.warn(
          `Verdict ${fait.verdict} écarté — statut actuel « ${profil.statutKyc} » ` +
            `(event=${fait.evenementId} userId=${fait.utilisateurId}). ` +
            'Probable événement redélivré après une décision manuelle — no-op.',
        );
        return;

      case SuiteDuVerdict.A_APPLIQUER:
        return this.appliquer(fait, profil);
    }
  }

  /**
   * Le statut d'abord, le reste ensuite.
   *
   * L'ordre n'est pas indifférent : l'écriture du statut est ce qui compte
   * réglementairement, les annonces et l'archivage n'en sont que les suites.
   * Les faire passer avant exposerait à notifier une validation qui n'a pas
   * été enregistrée.
   */
  private async appliquer(
    fait: EvenementDeVerification,
    profil: InvestorComplianceProfile,
  ): Promise<void> {
    const statut = statutPourVerdict(fait.verdict);
    const motif =
      fait.verdict === VerdictIdentite.REVUE_REQUISE ? fait.motif : undefined;

    await this.updateKycStatus.execute(fait.utilisateurId, statut, motif);
    this.logger.log(
      `Dossier KYC → ${statut} sur verdict ${fait.verdict} : userId=${fait.utilisateurId}` +
        (motif ? ` motif=${motif}` : ''),
    );

    const contexte = {
      utilisateurId: fait.utilisateurId,
      kycId: profil.dossierKycId as string,
      sessionId: fait.sessionId,
      evenementId: fait.evenementId,
    };

    if (fait.verdict === VerdictIdentite.VERIFIEE) {
      this.annonces.annoncerVerificationAutomatique(contexte);
      // Après l'annonce : le titulaire n'a pas à attendre le téléchargement de
      // ses pièces pour apprendre que son identité est établie.
      await this.archivage.archiver(fait.sessionId, fait.utilisateurId);
      return;
    }

    if (fait.verdict === VerdictIdentite.REVUE_REQUISE) {
      this.annonces.annoncerRevueManuelleRequise(contexte, fait.motif);
    }

    // `EN_TRAITEMENT` n'annonce rien : c'est un état transitoire de quelques
    // secondes, dont notifier le titulaire n'apprendrait rien à personne.
  }
}
