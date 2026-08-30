import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { KycStatus } from 'src/onboarding/domain/enums/kyc-status.enum';
import { KycPasEnRevueManuelleError } from 'src/onboarding/domain/errors';
import { KycRefuseDomainEvent } from 'src/onboarding/domain/events/kyc-refuse.domain-event';
import { KycValideDomainEvent } from 'src/onboarding/domain/events/kyc-valide.domain-event';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';

/**
 * Entrée de la décision manuelle, exprimée par la couche applicative.
 *
 * Volontairement pas le `UpdateKycStatusDto` de `presenters/` : un use case ne
 * dépend pas d'un DTO HTTP (§12.5 pris à l'envers). Le contrôleur valide son
 * DTO, y ajoute l'identité de l'administrateur, et passe une structure nue.
 */
export interface DecisionKycManuelle {
  utilisateurId: number;
  decision: KycStatus;
  motifRefus?: string;
  /** Compte de l'administrateur qui tranche — tracé pour l'audit. */
  decidePar: number;
}

/**
 * Décision humaine sur un dossier en revue manuelle.
 *
 * Le pendant administrateur de `RequestKycManualReviewUseCase` : le titulaire
 * demande l'examen, la compliance tranche. Ce use case porte les deux choses
 * qui étaient dans `ProfileController.patchKycStatus` et n'y avaient pas leur
 * place (§12.5) :
 *
 * - la **règle d'accès au dossier** — seule une revue manuelle se décide à la
 *   main, voir {@link KycPasEnRevueManuelleError}. Elle était écrite en 409 au
 *   milieu du contrôleur, donc valable pour cette route HTTP et pour elle
 *   seule ;
 * - l'**annonce du fait** qui vient de se produire, à la place des deux blocs
 *   de notification qui suivaient l'appel. Valider et refuser sont deux faits
 *   distincts, donc deux événements : {@link KycValideDomainEvent} et
 *   {@link KycRefuseDomainEvent}, chacun avec son abonné (§8).
 *
 * L'écriture reste déléguée à {@link UpdateKycStatusUseCase} : une seule façon
 * de faire changer un dossier de statut, donc un seul endroit à reprendre
 * quand ces transitions rejoindront le domaine (`DecisionKyc`).
 *
 * **L'autorisation n'est pas ici.** Vérifier que l'appelant détient
 * `kyc:validate` reste l'affaire de la présentation — décorateur de permission
 * et contrôle de rôle en profondeur — parce que c'est une question d'identité,
 * pas de dossier.
 */
@Injectable()
export class DecideKycManualReviewUseCase {
  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    decision: DecisionKycManuelle,
  ): Promise<DossierDEntreeEnRelation> {
    const profil = await this.profils.parTitulaire(decision.utilisateurId);
    if (!profil.estEnRevueManuelle()) {
      throw new KycPasEnRevueManuelleError();
    }

    const kyc = await this.updateKycStatus.execute(
      decision.utilisateurId,
      decision.decision,
      decision.motifRefus,
    );

    this.annoncer(kyc, decision);

    return kyc;
  }

  /**
   * Publié après l'écriture uniquement — un abonné ne doit pas annoncer au
   * titulaire une validation qui n'a pas eu lieu.
   *
   * Les statuts autres que `VALIDE` et `REFUSE` ne lèvent rien : la route les
   * acceptait déjà sans notifier personne, et il n'y a pas de fait métier à
   * annoncer quand un admin repositionne un dossier en cours d'examen.
   */
  private annoncer(
    kyc: DossierDEntreeEnRelation,
    decision: DecisionKycManuelle,
  ): void {
    if (decision.decision === KycStatus.VALIDE) {
      this.eventBus.publish(
        new KycValideDomainEvent(
          kyc.dossierKycId as string,
          decision.utilisateurId,
          decision.decidePar,
        ),
      );
      return;
    }

    if (decision.decision === KycStatus.REFUSE) {
      this.eventBus.publish(
        new KycRefuseDomainEvent(
          kyc.dossierKycId as string,
          decision.utilisateurId,
          decision.motifRefus ?? null,
          decision.decidePar,
        ),
      );
    }
  }
}
