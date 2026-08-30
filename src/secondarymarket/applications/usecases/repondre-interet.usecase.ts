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
import { estIndisponibiliteFournisseur } from 'src/common/yousign/signature-provider.error';

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
  ): Promise<{ ordreId: string; signingUrl: string; signatureId: string }> {
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

    // La rencontre des volontés est acquise : le parcours contractuel peut
    // s'exécuter. `InitiateBuyUseCase` n'est jamais appelé en dehors d'ici.
    //
    // Si l'initiation échoue (génération du contrat, stockage, prestataire de
    // signature), l'annonce ne doit pas rester coincée en ACCEPTE : ni le
    // vendeur ni l'acheteur n'auraient alors de porte de sortie. On la ramène à
    // l'état antérieur, qui laisse au vendeur le choix de réessayer ou de
    // refuser.
    let initiation: { signingUrl: string; signatureId: string };
    try {
      initiation = await this.initiateBuy.execute(
        ordreId,
        acheteurId,
        nbFractions,
      );
    } catch (err) {
      await this.ordreRepo
        .createQueryBuilder()
        .update(OrdreMarcheEntity)
        .set({ statut: OrdreMarcheStatus.INTERET_EXPRIME })
        .where('id = :id AND statut = :accepte', {
          id: ordreId,
          accepte: OrdreMarcheStatus.ACCEPTE,
        })
        .execute();
      this.logger.error(
        `Initiation de cession impossible sur l'annonce ${ordreId} : ` +
          `statut ramené à ${OrdreMarcheStatus.INTERET_EXPRIME}` +
          (estIndisponibiliteFournisseur(err)
            ? ` — prestataire de signature indisponible (${err.motif})`
            : ''),
      );
      // L'erreur repart telle quelle : c'est la couche HTTP qui décide du
      // statut, et elle sait distinguer une panne prestataire d'un bug.
      throw err;
    }

    // Prévenir l'acheteur APRÈS coup, et seulement là : une acceptation
    // compensée n'a RIEN produit, l'annoncer serait un mensonge — l'acheteur
    // recevrait « le vendeur a accepté » pour un contrat qui n'existe pas, sur
    // une annonce simplement revenue en attente de réponse.
    //
    // L'échec d'une notification, lui, ne remet pas en cause une cession déjà
    // initiée : il est journalisé, pas propagé.
    try {
      await this.notifications.push({
        utilisateurId: acheteurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "Le vendeur a accepté votre marque d'intérêt",
        message:
          'Le contrat de cession est prêt à être signé. La cession sera effective ' +
          'une fois la signature recueillie.',
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Notification d'acceptation non remise à l'acheteur ${acheteurId} ` +
          `sur l'annonce ${ordreId} : ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { ordreId, ...initiation };
  }

  async refuser(
    ordreId: string,
    vendeurId: number,
  ): Promise<{ ordreId: string; statut: OrdreMarcheStatus }> {
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

    return { ordreId, statut: OrdreMarcheStatus.EN_CARNET };
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
