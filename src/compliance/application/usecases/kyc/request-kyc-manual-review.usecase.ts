import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { KycRevueManuelleDemandeeDomainEvent } from 'src/compliance/domain/events/kyc-revue-manuelle-demandee.domain-event';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { UpdateKycStatusUseCase } from './update-kyc-status.usecase';

/**
 * Cause inscrite au dossier. Une constante plutôt qu'un littéral au fil du
 * code : c'est ce que la compliance lit dans `motifRefus` pour distinguer un
 * dossier arrivé là par dépôt manuel d'un dossier que Stripe Identity n'a pas
 * su valider.
 */
export const MOTIF_REVUE_MANUELLE = 'Dépôt manuel de documents — revue requise';

/**
 * Le titulaire demande l'examen manuel de son dossier.
 *
 * Recours quand la vérification automatique Stripe Identity n'aboutit pas :
 * l'utilisateur téléverse ses pièces, puis passe lui-même son dossier en
 * `EN_REVUE` pour qu'un humain tranche.
 *
 * Le use case ne fait que ça — passer le dossier en revue, puis lever
 * {@link KycRevueManuelleDemandeeDomainEvent}. La notification de la compliance
 * qui suivait immédiatement l'appel appartient à un abonné (§8), pas à ce
 * chemin : demander une revue réussit ou échoue sur la seule question de savoir
 * si le dossier a pu changer de statut. Le jour où cette demande doit aussi
 * ouvrir un ticket, alimenter un tableau de suivi ou relancer au bout de 48 h,
 * c'est un abonné de plus, sans rouvrir ce fichier.
 *
 * L'écriture reste déléguée à {@link UpdateKycStatusUseCase} plutôt que
 * réimplémentée ici : une seule façon de faire changer un dossier de statut,
 * que la décision vienne du titulaire, de l'admin ou d'un webhook — donc un
 * seul endroit à reprendre quand ces transitions rejoindront le domaine
 * (`DecisionKyc`).
 *
 * Ce chemin **n'éprouve pas le statut de départ** : un dossier déjà `VALIDE`
 * peut aujourd'hui retomber en revue manuelle à la demande de son titulaire,
 * ce qui lui coupe l'accès aux actions financières (`KycValidatedGuard`).
 * Comportement d'origine, conservé tel quel — la règle de transition manque, et
 * sa place est dans `DecisionKyc`, pas ici.
 */
@Injectable()
export class RequestKycManualReviewUseCase {
  constructor(
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly eventBus: EventBus,
  ) {}

  async execute(userId: number): Promise<InvestorComplianceProfile> {
    const kyc = await this.updateKycStatus.execute(
      userId,
      KycStatus.EN_REVUE,
      MOTIF_REVUE_MANUELLE,
    );

    // Le fait est annoncé, les réactions ne sont pas orchestrées ici : qui veut
    // être prévenu d'une demande de revue s'abonne (§8). Publié après
    // l'écriture uniquement — un abonné ne doit pas réagir à un passage en
    // revue qui n'a pas eu lieu.
    this.eventBus.publish(
      new KycRevueManuelleDemandeeDomainEvent(
        kyc.dossierKycId as string,
        userId,
        MOTIF_REVUE_MANUELLE,
      ),
    );

    return kyc;
  }
}
