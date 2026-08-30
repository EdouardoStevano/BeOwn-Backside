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
import type { EvenementDeVerification } from 'src/compliance/application/acl/evenement-identite.translator';
import { AnnoncesKycService } from 'src/compliance/application/services/annonces-kyc.service';
import { ArchivageRapportKycService } from 'src/compliance/application/services/archivage-rapport-kyc.service';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';

/** Ce qu'il est advenu du verdict présenté au dossier. */
export type IssueDuVerdict =
  | { issue: 'applique'; statut: string }
  | { issue: 'deja-applique' }
  | { issue: 'ecarte'; statutActuel: string | null }
  | { issue: 'aucun-dossier' };

/**
 * Applique au dossier un verdict de vérification d'identité, d'où qu'il vienne.
 *
 * **Un seul chemin pour deux sources.** Le fournisseur annonce ses verdicts par
 * webhook ; la réconciliation va les chercher quand l'annonce n'arrive pas —
 * un poste de développement n'est pas joignable depuis l'extérieur, et une
 * livraison peut échouer en production. Les deux aboutissent ici, et cela n'est
 * pas un détail d'organisation : ce sont les transitions d'un dossier
 * réglementaire, et deux implémentations finiraient par diverger sur le cas qui
 * compte — celui où le dossier a déjà bougé.
 *
 * Ce use case **n'a pas de règle métier à lui** : il charge le dossier, lui
 * demande quoi faire du verdict, obéit, puis laisse les services annoncer et
 * archiver (§14). La règle — quel verdict s'applique à quel statut — vit dans
 * `InvestorComplianceProfile.accueillirVerdict`.
 */
@Injectable()
export class AppliquerUnVerdictUseCase {
  private readonly logger = new Logger(AppliquerUnVerdictUseCase.name);

  constructor(
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    private readonly annonces: AnnoncesKycService,
    private readonly archivage: ArchivageRapportKycService,
  ) {}

  /**
   * **Aucun chemin ne lève.** Un dossier absent ou un verdict écarté est un
   * no-op journalisé : le fournisseur traite une exception comme un échec de
   * livraison et rejoue l'événement, indéfiniment pour une donnée qui ne
   * deviendra jamais valide.
   */
  async execute(fait: EvenementDeVerification): Promise<IssueDuVerdict> {
    const profil = await this.profils.findByInvestorId(fait.utilisateurId);
    if (!profil.aUnDossierKyc()) {
      this.logger.warn(
        `Vérification d'identité : dossier introuvable pour userId=${fait.utilisateurId} ` +
          `(session=${fait.sessionId}) — no-op`,
      );
      return { issue: 'aucun-dossier' };
    }

    switch (profil.accueillirVerdict(fait.verdict, fait.sessionId)) {
      case SuiteDuVerdict.DEJA_APPLIQUE:
        this.logger.debug(
          `Verdict ${fait.verdict} déjà appliqué (redélivrance) : userId=${fait.utilisateurId}`,
        );
        return { issue: 'deja-applique' };

      case SuiteDuVerdict.ECARTE:
        // Le cas qui mérite d'être vu : le dossier a évolué autrement depuis,
        // typiquement par une décision du RCCI que ce verdict aurait écrasée.
        this.logger.warn(
          `Verdict ${fait.verdict} écarté — statut actuel « ${profil.statutKyc} » ` +
            `(event=${fait.evenementId} userId=${fait.utilisateurId}). ` +
            'Probable verdict arrivé après une décision manuelle — no-op.',
        );
        return { issue: 'ecarte', statutActuel: profil.statutKyc };

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
  ): Promise<IssueDuVerdict> {
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
      return { issue: 'applique', statut };
    }

    if (fait.verdict === VerdictIdentite.REVUE_REQUISE) {
      this.annonces.annoncerRevueManuelleRequise(contexte, fait.motif);
    }

    // `EN_TRAITEMENT` n'annonce rien : c'est un état transitoire de quelques
    // secondes, dont notifier le titulaire n'apprendrait rien à personne.
    return { issue: 'applique', statut };
  }
}
