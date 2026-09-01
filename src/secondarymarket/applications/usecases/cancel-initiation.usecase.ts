import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { CessionCompensationService } from 'src/secondarymarket/applications/cession-compensation.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';

/**
 * Renoncement de l'acheteur avant signature.
 *
 * Annuler la signature ne suffisait pas : l'annonce restait en `accepte`,
 * c'est-à-dire hors du carnet ET sans signataire, et les fonds de l'acheteur
 * restaient bloqués. L'annulation défait donc les trois choses posées par
 * l'acceptation — la signature, la réservation de fonds et le verrouillage de
 * l'annonce — et prévient le vendeur, qui retrouve la main.
 */
@Injectable()
export class CancelInitiationUseCase {
  private readonly logger = new Logger(CancelInitiationUseCase.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly youSignService: YouSignService,
    private readonly compensation: CessionCompensationService,
    private readonly notifications: NotificationService,
  ) {}

  async execute(signatureId: string, userId: number): Promise<void> {
    const signature = await this.signatureRepo.findOne({
      where: { id: signatureId },
    });
    if (!signature) throw new NotFoundException('Signature introuvable');
    if (signature.userId !== userId) throw new ForbiddenException('Non autorisé');

    // Transition CONDITIONNELLE : c'est elle qui rend la compensation
    // single-shot. Un second appel (ou une course avec le webhook d'expiration)
    // ne trouve plus la signature PENDING et ne libère donc rien deux fois.
    const annulation = await this.signatureRepo
      .createQueryBuilder()
      .update(SignatureEntity)
      .set({ statut: SignatureStatus.CANCELLED })
      .where('id = :id AND statut = :pending', {
        id: signatureId,
        pending: SignatureStatus.PENDING,
      })
      .execute();
    if (!annulation.affected) return; // idempotent

    // Annuler la procédure YouSign de manière non-bloquante
    this.youSignService
      .cancelSignatureRequest(signature.youSignRequestId)
      .catch((err) =>
        this.logger.warn(
          `Could not cancel YouSign ${signature.youSignRequestId}: ${err?.message}`,
        ),
      );

    if (!signature.ordreId) return; // souscription initiale : rien à libérer

    const { statutOrdre } = await this.compensation.compenserCessionInaboutie({
      ordreId: signature.ordreId,
      acheteurId: signature.userId,
      nbFractions: signature.nbFractions,
    });

    await this.prevenirVendeur(signature.ordreId, statutOrdre);
  }

  /**
   * Le vendeur s'était engagé : il doit savoir que l'acheteur a renoncé et
   * dans quel état son annonce lui revient. Sans cette notification, il
   * attendrait une signature qui n'arrivera jamais.
   */
  private async prevenirVendeur(
    ordreId: string,
    statutOrdre: OrdreMarcheStatus | null,
  ): Promise<void> {
    if (!statutOrdre) return;
    const ordre = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ordre) return;

    const retourEnCarnet = statutOrdre === OrdreMarcheStatus.EN_CARNET;
    try {
      await this.notifications.push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "L'acheteur a renoncé avant signature",
        message: retourEnCarnet
          ? "L'acheteur a annulé sa signature. Votre annonce est republiée sur le tableau d'affichage."
          : "L'acheteur a annulé sa signature. Sa marque d'intérêt vous est de nouveau soumise : " +
            'vous pouvez l\'accepter à nouveau ou la refuser.',
        metadata: { ordreId, statut: statutOrdre },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Notification d'annulation non remise au vendeur ${ordre.vendeurId} ` +
          `sur l'annonce ${ordreId} : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
