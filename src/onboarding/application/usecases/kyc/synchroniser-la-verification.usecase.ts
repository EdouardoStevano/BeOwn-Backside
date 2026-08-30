import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import {
  IDENTITY_VERIFICATION_PORT,
  type IdentityVerificationPort,
} from 'src/onboarding/application/ports/identity-verification.port';
import { EvenementIdentiteTranslator } from 'src/onboarding/application/acl/evenement-identite.translator';
import {
  AppliquerUnVerdictUseCase,
  type IssueDuVerdict,
} from './appliquer-un-verdict.usecase';

/** Ce qu'a donné la relecture du dossier chez le fournisseur. */
export type IssueDeLaSynchronisation =
  | { issue: 'aucun-dossier' }
  | { issue: 'aucune-session' }
  /** La session existe mais son état ne porte aucun verdict — annulée. */
  | { issue: 'sans-verdict'; etat: string }
  | { issue: 'verdict-recu'; etat: string; suite: IssueDuVerdict };

/**
 * Va chercher chez le fournisseur le verdict qu'il n'a pas su nous annoncer.
 *
 * **Le webhook est un envoi, celui-ci est un retrait.** Le fournisseur pousse
 * ses verdicts vers une URL publique ; quand cette URL n'est pas joignable —
 * un poste de développement derrière un NAT — ou quand une livraison échoue en
 * production, le dossier reste figé sur un état que le fournisseur a pourtant
 * dépassé depuis longtemps. Relire la session lève ce blocage sans rien
 * inventer : la source de vérité reste le fournisseur.
 *
 * **Ce n'est pas un contournement, c'est de la réconciliation** — la capacité
 * que le cahier des charges range dans M7 aux côtés des mouvements de fonds
 * (§3.2). Elle a sa place en production, pas seulement sur un poste de
 * développement, et c'est pourquoi elle est un use case du contexte plutôt
 * qu'un script.
 *
 * **Aucune décision n'est prise ici.** Le verdict lu est présenté au dossier
 * exactement comme celui d'un webhook, et c'est le domaine qui décide s'il
 * s'applique — en particulier, il **écarte** un verdict qui contredirait une
 * décision déjà prise par le RCCI. Synchroniser ne peut donc pas servir à
 * repasser par-dessus un refus manuel.
 */
@Injectable()
export class SynchroniserLaVerificationUseCase {
  private readonly logger = new Logger(SynchroniserLaVerificationUseCase.name);

  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
    @Inject(IDENTITY_VERIFICATION_PORT)
    private readonly identity: IdentityVerificationPort,
    private readonly appliquer: AppliquerUnVerdictUseCase,
  ) {}

  async execute(utilisateurId: number): Promise<IssueDeLaSynchronisation> {
    const profil = await this.profils.parTitulaire(utilisateurId);

    if (!profil.aUnDossierKyc()) return { issue: 'aucun-dossier' };

    // La session est lue **sur le dossier**, jamais reçue de l'appelant : le
    // titulaire ne choisit pas quelle vérification s'applique à son compte, et
    // accepter un `vs_xxx` en paramètre reviendrait à laisser réclamer la
    // session d'un autre.
    const sessionId = profil.sessionDeVerification;
    if (!sessionId) return { issue: 'aucune-session' };

    const session = await this.identity.retrieveVerificationSession(sessionId);

    const fait = EvenementIdentiteTranslator.depuisLaSession(
      { ...session, sessionId },
      utilisateurId,
    );
    if (!fait) {
      this.logger.debug(
        `Réconciliation KYC : état « ${session.status} » sans verdict ` +
          `(userId=${utilisateurId}, session=${sessionId}) — no-op`,
      );
      return { issue: 'sans-verdict', etat: session.status };
    }

    this.logger.log(
      `Réconciliation KYC : verdict ${fait.verdict} lu chez le fournisseur ` +
        `(userId=${utilisateurId}, session=${sessionId})`,
    );

    return {
      issue: 'verdict-recu',
      etat: session.status,
      suite: await this.appliquer.execute(fait),
    };
  }
}
