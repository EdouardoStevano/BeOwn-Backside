import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';

/**
 * **Seule façon d'écrire le statut d'un dossier KYC.** La décision manuelle du
 * RCCI comme le webhook Stripe Identity passent par ici — c'est ce qui permet
 * d'y accrocher ce qui doit suivre toute validation, quel que soit le chemin
 * emprunté.
 *
 * **Le rôle du titulaire suit le dossier.** Une inscription ouvre un compte
 * `VISITEUR` ; c'est la validation du dossier qui en fait un `INVESTISSEUR`.
 * Promouvoir ici, et pas en réaction à `KycValideDomainEvent`, est délibéré :
 * cet événement ne couvre que la décision manuelle — le chemin automatique
 * n'annonce rien — et un compte validé par Stripe serait resté visiteur pour
 * toujours.
 *
 * La promotion est **non bloquante**. La validation d'un dossier est acquise
 * dès l'écriture du statut ; un rôle qui ne suivrait pas ne doit pas la faire
 * échouer, d'autant que ce qui autorise une opération financière reste
 * `KycValidatedGuard`, qui interroge le dossier et non le rôle. Un rôle en
 * retard ferme un accès, il n'en ouvre aucun — et l'incident est journalisé
 * pour être rattrapé.
 */
@Injectable()
export class UpdateKycStatusUseCase {
  private readonly logger = new Logger(UpdateKycStatusUseCase.name);

  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(
    userId: number,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<KycCase> {
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) throw new NotFoundException('KYC introuvable.');

    const misAJour = await this.kycRepository.updateStatus(
      kyc.id,
      status,
      motifRefus,
    );

    if (status === KycStatus.VALIDE) {
      await this.promouvoirEnInvestisseur(userId);
    }

    return misAJour;
  }

  /**
   * Le titulaire a mené son onboarding à son terme.
   *
   * `devenirInvestisseur()` ne promeut qu'un visiteur : un compte de
   * back-office qui ferait valider un dossier à son nom n'y perd pas ses
   * attributions, et rejouer la validation d'un dossier déjà validé n'écrit
   * rien.
   */
  private async promouvoirEnInvestisseur(userId: number): Promise<void> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.devenirInvestisseur()) return;

      await this.userRepository.save(user);
    } catch (err) {
      this.logger.error(
        `Dossier ${userId} validé, mais le compte n'a pas pu devenir investisseur — le rôle est à rattraper.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
