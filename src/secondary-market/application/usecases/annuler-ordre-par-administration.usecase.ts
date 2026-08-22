import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { OrdreMarcheOrmMapper } from 'src/secondary-market/infrastructure/persistence/mappers/ordre-marche.orm-mapper';
import {
  AnnulationMultiRemplissagesError,
  OrdreIntrouvableError,
} from 'src/secondary-market/domain/errors';
import { OrdreMarcheStatus } from 'src/secondary-market/domain/enums/ordre-marche.enum';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { SignatureStatus } from 'src/documents/domain/enums/signature-status.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { formatEur } from 'src/shared/money/format-eur';

/** Ce que la route rend au back-office — contrat inchangé. */
export interface ResultatAnnulationAdministration {
  success: true;
  statut: OrdreMarcheStatus;
  reversed: boolean;
  montantRembourse?: number;
}

/**
 * **L'administration annule un ordre**, y compris après exécution — et défait
 * alors le règlement.
 *
 * Le use case orchestre, il ne décide pas (§14). C'est
 * `SecondaryMarketOrder.annulerParAdministration()` qui refuse un ordre déjà
 * clos et qui répond à la seule question de domaine : **faut-il défaire un
 * règlement ?** Ces deux règles vivaient en quatre `if` en tête de
 * `AdminSecondaryMarketController.cancelOrder`.
 *
 * Ce qui reste ici est le contre-passage lui-même, qui ne peut pas être
 * ailleurs : il touche les positions des deux parties, leurs wallets, celui de
 * la plateforme et le ledger, dans une seule transaction.
 *
 * **La règle la plus délicate n'est pas dans l'agrégat, et c'est voulu.** Un
 * ordre peut avoir été rempli en plusieurs fois ; l'état courant
 * (`nbFractions`, `acheteurId`) ne reflète que le **dernier** remplissage.
 * Reverser la somme des frais de tous les remplissages rembourserait l'acheteur
 * en trop et sous-débiterait le vendeur. Identifier le remplissage en vigueur
 * demande de lire les signatures et le ledger — l'ordre, seul, ne peut pas le
 * savoir. Faute de pouvoir l'identifier, on refuse plutôt que de rendre un
 * montant faux.
 */
@Injectable()
export class AnnulerOrdreParAdministrationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordres: Repository<OrdreMarcheEntity>,
    private readonly notifications: NotificationService,
  ) {}

  async execute(ordreId: string): Promise<ResultatAnnulationAdministration> {
    const ligne = await this.ordres.findOne({
      where: { id: ordreId },
      relations: ['investissement'],
    });
    if (!ligne) throw new OrdreIntrouvableError(ordreId);

    const ordre = OrdreMarcheOrmMapper.toDomain(ligne);
    const { reverseNecessaire } = ordre.annulerParAdministration();

    if (!reverseNecessaire) {
      await this.ordres.save(OrdreMarcheOrmMapper.appliquerSur(ligne, ordre));
      this.annoncerAuVendeur(ordre.vendeurId, ordreId);
      return { success: true, statut: ordre.statut, reversed: false };
    }

    const nbFractions = ordre.nbFractions;
    const prixUnitaire = ordre.prixUnitaire;
    const montantTotal = ordre.montant;
    const projetId = ligne.investissement.projetId;
    const acheteurId = ordre.acheteurId!;
    const vendeurId = ordre.vendeurId;

    await this.dataSource.transaction(async (em) => {
      const commissionPrelevee = await this.commissionDuRemplissageEnVigueur(
        em,
        ordreId,
        acheteurId,
      );
      const montantNetVendeurInitial = montantTotal - commissionPrelevee;

      // 1. Restaurer les fractions sur l'investissement source du vendeur.
      const positionVendeur = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (positionVendeur) {
        positionVendeur.nbTitres =
          (Number(positionVendeur.nbTitres) ?? 0) + nbFractions;
        positionVendeur.montant =
          Number(positionVendeur.montant) + montantTotal;
        if (positionVendeur.statut === InvestmentStatus.ANNULE) {
          positionVendeur.statut = InvestmentStatus.CONFIRME;
        }
        await em.save(InvestmentEntity, positionVendeur);
      }

      // 2. Les retirer de la position de l'acheteur.
      const positionAcheteur = await em.findOne(InvestmentEntity, {
        where: {
          utilisateurId: acheteurId,
          projetId,
          statut: InvestmentStatus.CONFIRME,
        },
      });
      if (positionAcheteur) {
        const restant = Math.max(
          0,
          (Number(positionAcheteur.nbTitres) ?? 0) - nbFractions,
        );
        positionAcheteur.nbTitres = restant;
        positionAcheteur.montant = Math.max(
          0,
          Number(positionAcheteur.montant) - montantTotal,
        );
        if (restant === 0) positionAcheteur.statut = InvestmentStatus.ANNULE;
        await em.save(InvestmentEntity, positionAcheteur);
      }

      // 3. Wallets : rembourser l'acheteur, reprendre au vendeur son net, et
      //    à la plateforme la commission qu'elle avait perçue.
      const walletAcheteur = await em.findOne(WalletEntity, {
        where: {
          proprietaireUserId: acheteurId,
          type: WalletType.INVESTISSEUR,
        },
      });
      const walletVendeur = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: vendeurId, type: WalletType.INVESTISSEUR },
      });
      if (walletAcheteur) {
        walletAcheteur.solde = Number(walletAcheteur.solde) + montantTotal;
        await em.save(WalletEntity, walletAcheteur);
      }
      if (walletVendeur) {
        walletVendeur.solde = Math.max(
          0,
          Number(walletVendeur.solde) - montantNetVendeurInitial,
        );
        await em.save(WalletEntity, walletVendeur);
      }

      let walletPlateforme: WalletEntity | null = null;
      if (commissionPrelevee > 0) {
        walletPlateforme = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        if (walletPlateforme) {
          walletPlateforme.solde = Math.max(
            0,
            Number(walletPlateforme.solde) - commissionPrelevee,
          );
          await em.save(WalletEntity, walletPlateforme);
        }
      }

      // 4. Traces ledger du contre-passage.
      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          walletSource: walletVendeur?.id ?? null,
          walletDestination: walletAcheteur?.id ?? null,
          type: TransactionType.SOUSCRIPTION,
          montant: montantTotal,
          devise: walletAcheteur?.devise ?? walletVendeur?.devise ?? 'EUR',
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `admin-cancel-reverse:${ordreId}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
        }),
      );

      if (walletPlateforme && commissionPrelevee > 0) {
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: walletPlateforme.id,
            walletDestination: null,
            type: TransactionType.SOUSCRIPTION,
            montant: commissionPrelevee,
            devise: walletPlateforme.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: ordre.investissementId,
            projetId,
            idempotencyKey: `secmarket:commission-reverse:order:${ordreId}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
          }),
        );
      }

      // 5. L'ordre, dans l'état où la transition l'a laissé.
      await em.save(
        OrdreMarcheEntity,
        OrdreMarcheOrmMapper.appliquerSur(ligne, ordre),
      );
    });

    this.annoncerLeContrePassage({
      vendeurId,
      acheteurId,
      ordreId,
      nbFractions,
      prixUnitaire,
      montantTotal,
    });

    return {
      success: true,
      statut: ordre.statut,
      reversed: true,
      montantRembourse: montantTotal,
    };
  }

  /**
   * La commission réellement perçue sur le remplissage **en vigueur**.
   *
   * Deux formes coexistent : une transaction unique de commission (héritée) et,
   * depuis les frais configurables, une transaction par frais retrouvable par
   * `metadata.ordreId` + `metadata.source`. Un ordre très ancien n'en a aucune.
   */
  private async commissionDuRemplissageEnVigueur(
    em: EntityManager,
    ordreId: string,
    acheteurId: number,
  ): Promise<number> {
    const commissionHeritee = await em.findOne(TransactionEntity, {
      where: {
        idempotencyKey: `secmarket:commission:order:${ordreId}`,
        statut: TransactionStatus.REUSSI,
      },
    });
    const fraisDeLOrdre = await em
      .createQueryBuilder(TransactionEntity, 'tx')
      .where(`tx.metadata ->> 'ordreId' = :ordreId`, { ordreId })
      .andWhere(`tx.metadata ->> 'source' IN (:...sources)`, {
        sources: ['revente_transaction', 'gain_revente_actions'],
      })
      .andWhere('tx.statut = :statut', { statut: TransactionStatus.REUSSI })
      .getMany();

    // Chaque remplissage écrit ses frais avec sa propre signature YouSign ; un
    // remplissage forcé par l'administration n'en a pas et compte pour un
    // groupe à lui seul.
    const signatures = new Set(
      fraisDeLOrdre
        .map((t) => (t.metadata as Record<string, unknown> | null)?.signatureId)
        .filter((v): v is string => typeof v === 'string'),
    );
    const aDesFraisSansSignature = fraisDeLOrdre.some(
      (t) =>
        (t.metadata as Record<string, unknown> | null)?.signatureId == null,
    );
    const nbRemplissages = signatures.size + (aDesFraisSansSignature ? 1 : 0);

    let fraisEnVigueur = fraisDeLOrdre;
    if (nbRemplissages > 1) {
      const derniereSignature = await em.findOne(SignatureEntity, {
        where: {
          ordreId,
          userId: acheteurId,
          statut: SignatureStatus.SIGNED,
        },
        order: { signedAt: 'DESC' },
      });
      if (!derniereSignature || !signatures.has(derniereSignature.id)) {
        throw new AnnulationMultiRemplissagesError();
      }
      fraisEnVigueur = fraisDeLOrdre.filter(
        (t) =>
          (t.metadata as Record<string, unknown> | null)?.signatureId ===
          derniereSignature.id,
      );
    }

    return round2(
      (commissionHeritee ? Number(commissionHeritee.montant) : 0) +
        fraisEnVigueur.reduce((somme, t) => somme + Number(t.montant), 0),
    );
  }

  /** Annonces non bloquantes : l'annulation est acquise quoi qu'il arrive. */
  private annoncerAuVendeur(vendeurId: number, ordreId: string): void {
    this.notifications
      .push({
        utilisateurId: vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "Ordre annulé par l'administration",
        message:
          "Votre annonce sur le marché secondaire a été annulée par l'équipe BeOwn.",
        metadata: { ordreId, reverse: false },
      })
      .catch(() => {});
  }

  private annoncerLeContrePassage(faits: {
    vendeurId: number;
    acheteurId: number;
    ordreId: string;
    nbFractions: number;
    prixUnitaire: number;
    montantTotal: number;
  }): void {
    this.notifications
      .push({
        utilisateurId: faits.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: "Vente d'ordre refusée — fractions restaurées",
        message: `Votre vente de ${faits.nbFractions} fraction(s) à ${formatEur(faits.prixUnitaire)} a été annulée par l'administration. Les fractions ont été restaurées sur votre investissement.`,
        metadata: {
          ordreId: faits.ordreId,
          reverse: true,
          montantRestaure: faits.montantTotal,
        },
      })
      .catch(() => {});

    this.notifications
      .push({
        utilisateurId: faits.acheteurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Achat annulé — remboursement effectué',
        message: `L'achat de ${faits.nbFractions} fraction(s) a été annulé par l'administration. ${formatEur(faits.montantTotal)} ont été recrédités sur votre wallet.`,
        metadata: {
          ordreId: faits.ordreId,
          reverse: true,
          montantRembourse: faits.montantTotal,
        },
      })
      .catch(() => {});
  }
}

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
