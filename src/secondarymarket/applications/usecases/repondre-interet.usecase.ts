import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InitiateBuyUseCase } from './initiate-buy.usecase';

/**
 * Réponse du vendeur à une marque d'intérêt — art. 25 du règlement
 * (UE) 2020/1503.
 *
 * C'est ici, et nulle part ailleurs, que naît le contrat. Tant que le vendeur
 * n'a pas accepté, l'acheteur n'a qu'exprimé un intérêt : la plateforme n'a
 * rapproché aucune volonté. L'acceptation déclenche la génération du contrat
 * de cession et le parcours de signature.
 *
 * Le refus remet l'annonce en circulation, sans que la plateforme reclasse ou
 * réattribue quoi que ce soit.
 */
@Injectable()
export class RepondreInteretUseCase {
  private readonly logger = new Logger(RepondreInteretUseCase.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    private readonly initiateBuy: InitiateBuyUseCase,
    private readonly notifications: NotificationService,
  ) {}

  async accepter(
    ordreId: string,
    vendeurId: number,
  ): Promise<{ signingUrl: string; signatureId: string }> {
    const ordre = await this.chargerPourVendeur(ordreId, vendeurId);
    const acheteurId = ordre.acheteurId;
    const nbFractions = ordre.interetNbFractions;

    if (!acheteurId || !nbFractions) {
      throw new BadRequestException(
        "Aucune marque d'intérêt exploitable sur cette annonce.",
      );
    }

    const claim = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({ statut: OrdreMarcheStatus.ACCEPTE })
      .where('id = :id AND statut = :enAttente', {
        id: ordreId,
        enAttente: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException('Cette marque d\'intérêt a déjà reçu une réponse.');
    }

    this.logger.log(
      `Annonce ${ordreId} acceptée par le vendeur ${vendeurId} au profit de ${acheteurId}`,
    );

    await this.notifications.push({
      utilisateurId: acheteurId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Le vendeur a accepté votre marque d\'intérêt',
      message:
        'Le contrat de cession est prêt à être signé. La cession sera effective ' +
        'une fois la signature recueillie.',
    });

    // La rencontre des volontés est acquise : le parcours contractuel peut
    // s'exécuter. `InitiateBuyUseCase` n'est jamais appelé en dehors d'ici.
    return this.initiateBuy.execute(ordreId, acheteurId, nbFractions);
  }

  async refuser(ordreId: string, vendeurId: number): Promise<{ statut: OrdreMarcheStatus }> {
    const ordre = await this.chargerPourVendeur(ordreId, vendeurId);
    const acheteurId = ordre.acheteurId;

    const claim = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({
        statut: OrdreMarcheStatus.EN_CARNET,
        acheteurId: null,
        interetNbFractions: null,
        interetExprimeLe: null,
      })
      .where('id = :id AND statut = :enAttente', {
        id: ordreId,
        enAttente: OrdreMarcheStatus.INTERET_EXPRIME,
      })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException('Cette marque d\'intérêt a déjà reçu une réponse.');
    }

    if (acheteurId) {
      await this.notifications.push({
        utilisateurId: acheteurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Votre marque d\'intérêt n\'a pas été retenue',
        message:
          "Le vendeur n'a pas donné suite. L'annonce reste consultable si vous " +
          'souhaitez vous manifester à nouveau.',
      });
    }

    return { statut: OrdreMarcheStatus.EN_CARNET };
  }

  private async chargerPourVendeur(
    ordreId: string,
    vendeurId: number,
  ): Promise<OrdreMarcheEntity> {
    const ordre = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ordre) throw new NotFoundException('Annonce introuvable');
    if (ordre.vendeurId !== vendeurId) {
      throw new ForbiddenException(
        'Seul le vendeur peut répondre à une marque d\'intérêt sur son annonce.',
      );
    }
    if (ordre.statut !== OrdreMarcheStatus.INTERET_EXPRIME) {
      throw new BadRequestException(
        "Cette annonce n'est pas en attente d'une réponse du vendeur.",
      );
    }
    return ordre;
  }
}
