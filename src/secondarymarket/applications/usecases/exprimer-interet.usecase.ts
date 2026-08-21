import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { formatEur } from 'src/common/money/format-eur';
import {
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  verifierInteret,
} from 'src/secondarymarket/domains/tableau-affichage';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

export interface ResultatExpressionInteret {
  ordreId: string;
  statut: OrdreMarcheStatus;
  nbFractions: number;
  montantIndicatif: number;
  mention: string;
}

/**
 * Enregistre l'intérêt d'un acheteur pour une annonce — art. 25 du règlement
 * (UE) 2020/1503.
 *
 * Ce use case s'arrête volontairement là où un carnet d'ordres continuerait :
 * il n'apparie pas, ne réserve pas, ne débite pas et ne génère aucun contrat.
 * Il transmet une sollicitation au vendeur. Sans acceptation explicite de
 * celui-ci, rien ne se passe — c'est ce qui distingue un tableau d'affichage
 * d'un système multilatéral de négociation.
 */
@Injectable()
export class ExprimerInteretUseCase {
  private readonly logger = new Logger(ExprimerInteretUseCase.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly notifications: NotificationService,
  ) {}

  async execute(
    ordreId: string,
    acheteurId: number,
    nbFractions: number,
  ): Promise<ResultatExpressionInteret> {
    const ordre = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ordre) throw new NotFoundException('Annonce introuvable');
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      throw new BadRequestException(
        "Cette annonce n'est plus ouverte aux marques d'intérêt.",
      );
    }

    const verdict = verifierInteret({
      acheteurId,
      vendeurId: ordre.vendeurId,
      nbFractionsDemandees: nbFractions,
      nbFractionsDisponibles: ordre.nbFractions,
    });
    if (!verdict.recevable) {
      throw new BadRequestException(verdict.motif ?? 'Marque d\'intérêt irrecevable.');
    }

    // Contrôle de solvabilité SANS débit ni blocage : on évite de solliciter le
    // vendeur pour un acheteur qui ne pourrait pas payer, sans pour autant
    // réserver quoi que ce soit avant son accord.
    const montantIndicatif = nbFractions * Number(ordre.prixUnitaire);
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: acheteurId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet || Number(wallet.solde) < montantIndicatif) {
      throw new BadRequestException(
        `Solde insuffisant pour cette marque d'intérêt. ` +
          `Disponible : ${formatEur(Number(wallet?.solde ?? 0))} — ` +
          `Requis : ${formatEur(montantIndicatif)}`,
      );
    }

    // Transition conditionnelle : deux acheteurs simultanés, un seul passe.
    // Le second est invité à revenir si le vendeur décline — la plateforme ne
    // constitue pas de file d'attente et n'arbitre pas entre les intérêts.
    const claim = await this.ordreRepo
      .createQueryBuilder()
      .update(OrdreMarcheEntity)
      .set({
        statut: OrdreMarcheStatus.INTERET_EXPRIME,
        acheteurId,
        interetNbFractions: nbFractions,
        interetExprimeLe: new Date(),
      })
      .where('id = :id AND statut = :ouverte', {
        id: ordreId,
        ouverte: OrdreMarcheStatus.EN_CARNET,
      })
      .execute();

    if (!claim.affected) {
      throw new BadRequestException(
        "Un autre investisseur s'est manifesté sur cette annonce entre-temps. " +
          'Elle redeviendra disponible si le vendeur décline.',
      );
    }

    this.logger.log(
      `Marque d'intérêt sur annonce ${ordreId} par userId=${acheteurId} ` +
        `(${nbFractions} fraction(s), ${formatEur(montantIndicatif)} indicatif)`,
    );

    await this.notifications.push({
      utilisateurId: ordre.vendeurId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Un investisseur est intéressé par votre annonce',
      message:
        `Un investisseur souhaite acquérir ${nbFractions} fraction(s) au prix ` +
        `que vous avez indiqué (${formatEur(montantIndicatif)} au total). ` +
        `La cession n'aura lieu que si vous l'acceptez.`,
    });

    return {
      ordreId,
      statut: OrdreMarcheStatus.INTERET_EXPRIME,
      nbFractions,
      montantIndicatif,
      mention: MENTION_NON_SYSTEME_DE_NEGOCIATION,
    };
  }
}
