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
import { formatEur } from 'src/shared/money/format-eur';
import {
  CODE_ANNONCE_EXPIREE,
  MENTION_NON_SYSTEME_DE_NEGOCIATION,
  estAnnonceEchue,
  finDeValidite,
  verifierInteret,
} from 'src/secondarymarket/domains/tableau-affichage';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import {
  DevisCession,
  DevisCessionService,
} from 'src/secondarymarket/applications/devis-cession.service';
import { GelDesAvoirsPort } from 'src/common/aml/gel-des-avoirs.port';

export interface ResultatExpressionInteret {
  ordreId: string;
  statut: OrdreMarcheStatus;
  nbFractions: number;
  montantIndicatif: number;
  mention: string;
  /**
   * Frais que supporterait le vendeur si la cession se formait. Exposés à
   * l'acheteur aussi : le coût réel de l'opération doit être connu des deux
   * parties AVANT qu'un engagement soit pris.
   */
  devis: DevisCession;
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
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    private readonly notifications: NotificationService,
    private readonly devisCession: DevisCessionService,
    // Gel des avoirs (L. 562-4 CMF) — port DIP, en dernière position (les
    // specs construisent ce usecase à la main).
    private readonly gelDesAvoirs: GelDesAvoirsPort,
  ) {}

  async execute(
    ordreId: string,
    acheteurId: number,
    nbFractions: number,
  ): Promise<ResultatExpressionInteret> {
    // ── Gel des avoirs — AVANT toute sollicitation du vendeur ────────────────
    // Un compte gelé n'engage aucun achat au marché secondaire. Refus 403
    // AVOIRS_GELES, message neutre unique (docs/adr/ADR-gel-des-avoirs.md).
    await this.gelDesAvoirs.assertAvoirsNonGeles(acheteurId);

    const ordre = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ordre) throw new NotFoundException('Annonce introuvable');
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      throw new BadRequestException(
        "Cette annonce n'est plus ouverte aux marques d'intérêt.",
      );
    }

    // Une annonce échue n'est plus cessible — la règle vit dans le domaine et
    // s'applique ici même si l'ordre n'a pas encore été balayé par le cron
    // d'expiration : le statut EN_CARNET ne suffit pas à rendre une annonce
    // périmée sollicitable, sans quoi le vendeur pourrait être engagé sur une
    // offre qu'il a lui-même bornée dans le temps.
    if (estAnnonceEchue(ordre.valideJusquAu, new Date())) {
      throw new BadRequestException({
        code: CODE_ANNONCE_EXPIREE,
        message:
          'Cette annonce a dépassé sa date de validité et ne peut plus faire ' +
          "l'objet d'une marque d'intérêt.",
        expireeLe: finDeValidite(ordre.valideJusquAu!).toISOString(),
      });
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
      devis: await this.calculerDevis(ordre.investissementId, nbFractions, ordre.prixUnitaire),
    };
  }

  /**
   * Devis de frais de la cession envisagée.
   *
   * Le prix de revient du vendeur vient de son investissement d'origine ;
   * inconnu, la plus-value est réputée nulle plutôt que devinée.
   */
  private async calculerDevis(
    investissementId: string,
    nbFractions: number,
    prixUnitaire: number | string,
  ): Promise<DevisCession> {
    const investissement = await this.investRepo.findOne({
      where: { id: investissementId },
    });

    let prixRevientUnitaire: number | null = null;
    if (investissement?.valeurTitre != null) {
      prixRevientUnitaire = Number(investissement.valeurTitre);
    } else if (investissement && Number(investissement.nbTitres ?? 0) > 0) {
      prixRevientUnitaire =
        Number(investissement.montant) / Number(investissement.nbTitres);
    }

    return this.devisCession.calculer({
      nbFractions,
      prixUnitaire: Number(prixUnitaire),
      prixRevientUnitaire,
    });
  }
}
