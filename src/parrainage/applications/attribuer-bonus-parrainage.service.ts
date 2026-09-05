import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { asUniqueViolation } from 'src/common/persistence/unique-violation';
import { ParrainageAttributionEntity } from '../infrastructure/persistences/entities/parrainage-attribution.entity';
import { StatutAttributionParrainage } from '../domains/enums/statut-attribution-parrainage.enum';
import { calculerBonusParrainage } from '../domains/bonus-parrainage';
import { lireParrainageConfig } from './parrainage-config';

/** Le strict nécessaire de l'investissement déclencheur. */
export interface InvestissementDefinitif {
  id: string;
  utilisateurId: number;
  montant: number;
}

/**
 * Attribue les bonus de parrainage quand le PREMIER investissement d'un
 * filleul devient DÉFINITIF.
 *
 * DEUX déclencheurs, un seul service : la confirmation différée
 * (ConfirmRetractationCronService, fin du délai de réflexion) et la
 * confirmation immédiate (CreateInvestmentUseCase, investisseur averti).
 * Dans les deux cas l'appel se fait APRÈS le commit de la confirmation et en
 * BEST-EFFORT : un bonus marketing ne doit jamais faire échouer, retarder ni
 * annuler une souscription — c'est le sens de `surInvestissementDefinitif`
 * qui attrape tout et se contente de journaliser.
 *
 * IDEMPOTENCE. « Premier investissement seulement » est porté par la
 * contrainte UNIQUE sur `parrainage_attribution.filleulId` : l'attribution
 * s'INSÈRE d'abord, dans la même transaction que les crédits — un rejeu
 * (double confirmation, deux réplicas, cron repassé) meurt en 23505 avant
 * d'avoir touché un wallet. Les clés d'idempotence des écritures ledger
 * doublent la ceinture.
 *
 * CONTREPARTIE EXTERNE ASSUMÉE. Les crédits sont des écritures `∅ → wallet` :
 * l'argent du bonus n'est prélevé sur aucun wallet interne, c'est un COÛT
 * MARKETING de la plateforme — même nature comptable qu'un dépôt entrant,
 * documentée ici pour que la réconciliation (`rapprocherGrandLivre`) le
 * traite comme telle via l'écriture présente des deux côtés (solde ET livre).
 */
@Injectable()
export class AttribuerBonusParrainageService {
  private readonly logger = new Logger(AttribuerBonusParrainageService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  /** Point d'entrée best-effort : n'échoue JAMAIS chez l'appelant. */
  async surInvestissementDefinitif(inv: InvestissementDefinitif): Promise<void> {
    try {
      await this.attribuer(inv);
    } catch (err) {
      if (asUniqueViolation(err)) {
        // Rejeu : ce filleul a déjà consommé son parrainage. Silence en debug,
        // c'est le fonctionnement nominal de l'idempotence.
        this.logger.debug(
          `Parrainage déjà attribué pour le filleul ${inv.utilisateurId} — rejeu ignoré.`,
        );
        return;
      }
      this.logger.error(
        `Attribution du bonus de parrainage échouée (filleul ${inv.utilisateurId}, ` +
          `investissement ${inv.id}) — la souscription n'est PAS affectée : ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
  }

  private async attribuer(inv: InvestissementDefinitif): Promise<void> {
    const filleul = await this.dataSource.getRepository(UserEntity).findOne({
      where: { userId: inv.utilisateurId },
      select: ['userId', 'parrainePar'],
    });
    // Pas de parrain déclaré à l'inscription : la grande majorité des cas,
    // sortie immédiate sans transaction.
    if (!filleul?.parrainePar) return;
    const parrainId = filleul.parrainePar;
    // Ceinture : l'auto-parrainage est déjà refusé à l'inscription, mais un
    // rang de données corrompu ne doit pas créditer deux fois le même compte.
    if (parrainId === inv.utilisateurId) return;

    const config = lireParrainageConfig();
    const montantBase = Number(inv.montant);

    const resultat = await this.dataSource.transaction(async (em) => {
      const [percuParrain, percuFilleul] = await Promise.all([
        this.dejaPercuCetteAnnee(em, parrainId),
        this.dejaPercuCetteAnnee(em, inv.utilisateurId),
      ]);

      const bonusParrain = calculerBonusParrainage(
        montantBase,
        config.tauxPct,
        percuParrain,
        config.plafondAnnuelEur,
      );
      const bonusFilleul = calculerBonusParrainage(
        montantBase,
        config.tauxPct,
        percuFilleul,
        config.plafondAnnuelEur,
      );

      // INSERT d'abord : c'est lui qui porte « premier investissement
      // seulement » (UNIQUE filleulId). Toute la suite vit dans la même
      // transaction — un 23505 ici annule tout, aucun wallet touché.
      const attribution = await em.save(
        ParrainageAttributionEntity,
        em.create(ParrainageAttributionEntity, {
          parrainId,
          filleulId: inv.utilisateurId,
          investissementId: inv.id,
          montantBase,
          bonusParrainEur: bonusParrain.montantEur,
          bonusFilleulEur: bonusFilleul.montantEur,
          statut:
            bonusParrain.plafonne || bonusFilleul.plafonne
              ? StatutAttributionParrainage.PLAFONNEE
              : StatutAttributionParrainage.CREDITEE,
        }),
      );

      if (bonusParrain.montantEur > 0) {
        await this.crediter(em, parrainId, bonusParrain.montantEur, attribution.id, 'parrain');
      }
      if (bonusFilleul.montantEur > 0) {
        await this.crediter(em, inv.utilisateurId, bonusFilleul.montantEur, attribution.id, 'filleul');
      }

      return { attribution, bonusParrain, bonusFilleul };
    });

    // Notifications APRÈS commit : un échec de push ne doit pas annuler des
    // crédits déjà acquis.
    await this.notifierSansEchouer(parrainId, resultat.bonusParrain.montantEur, 'parrain');
    await this.notifierSansEchouer(
      inv.utilisateurId,
      resultat.bonusFilleul.montantEur,
      'filleul',
    );

    this.logger.log(
      `Bonus de parrainage attribué : parrain ${parrainId} +${resultat.bonusParrain.montantEur} €, ` +
        `filleul ${inv.utilisateurId} +${resultat.bonusFilleul.montantEur} € ` +
        `(base ${montantBase} €, attribution ${resultat.attribution.id})`,
    );
  }

  /**
   * Bonus déjà crédités à CE bénéficiaire sur l'année civile, tous rôles
   * confondus (il peut être parrain de plusieurs filleuls ET filleul lui-même)
   * — c'est l'assiette du plafond annuel, relue depuis les montants FIGÉS des
   * attributions, jamais recalculée depuis le taux courant.
   */
  private async dejaPercuCetteAnnee(
    em: EntityManager,
    userId: number,
  ): Promise<number> {
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const brut = await em
      .createQueryBuilder(ParrainageAttributionEntity, 'a')
      .select(
        `COALESCE(SUM(CASE WHEN a."parrainId" = :userId THEN a."bonusParrainEur" ELSE 0 END), 0)
         + COALESCE(SUM(CASE WHEN a."filleulId" = :userId THEN a."bonusFilleulEur" ELSE 0 END), 0)`,
        'total',
      )
      .where('(a."parrainId" = :userId OR a."filleulId" = :userId)')
      .andWhere('a."creeLe" >= :debutAnnee', { debutAnnee })
      .setParameter('userId', userId)
      .getRawOne<{ total: string }>();
    return Number(brut?.total ?? 0);
  }

  /** Crédit atomique du wallet (créé à 0 s'il n'existe pas encore) + écriture ledger. */
  private async crediter(
    em: EntityManager,
    userId: number,
    montantEur: number,
    attributionId: string,
    role: 'parrain' | 'filleul',
  ): Promise<void> {
    let wallet = await em.findOne(WalletEntity, {
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) {
      // Un parrain peut n'avoir jamais déposé : son wallet naît ici, à zéro,
      // pour recevoir le bonus — même patron que les wallets plateforme créés
      // à la demande par la distribution.
      wallet = await em.save(
        WalletEntity,
        em.create(WalletEntity, {
          proprietaireUserId: userId,
          type: WalletType.INVESTISSEUR,
          devise: 'EUR',
          solde: 0,
          soldeBloque: 0,
        }),
      );
    }

    // CONTREPARTIE DU BONUS — le portefeuille de frais de la plateforme.
    //
    // L'écriture portait `walletSource: null`, c'est-à-dire une contrepartie
    // EXTERNE : la convention du registre réserve cette forme aux mouvements
    // qui franchissent réellement la frontière de la plateforme (dépôt par
    // carte, retrait bancaire). Un bonus de parrainage ne franchit rien : il
    // est offert PAR la plateforme, sur ses propres deniers. En le déclarant
    // externe, le registre créait des euros — « Σ crédits − Σ débits » ne se
    // rapprochait plus, et le passif né du bonus n'avait aucune contrepartie.
    //
    // Le portefeuille FRAIS_PLATEFORME est la poche qui l'assume : c'est là
    // que la plateforme encaisse ses commissions, donc là qu'elle finance ce
    // qu'elle offre. Son solde peut passer en négatif si les bonus dépassent
    // les commissions encaissées — c'est une information de gestion, pas une
    // erreur, et elle devient enfin visible.
    const walletPlateforme = await this.resoudreWalletFraisPlateforme(em);

    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde - :montant' })
      .where('id = :id', { id: walletPlateforme.id })
      .setParameter('montant', montantEur)
      .execute();

    // Crédit ATOMIQUE (jamais lire-modifier-écrire : un retrait concurrent ne
    // doit pas être écrasé). Montant paramétré, jamais interpolé dans le SQL.
    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde + :montant' })
      .where('id = :id', { id: wallet.id })
      .setParameter('montant', montantEur)
      .execute();

    await em.save(
      TransactionEntity,
      em.create(TransactionEntity, {
        walletSource: walletPlateforme.id,
        walletDestination: wallet.id,
        type: TransactionType.INTERNE,
        montant: montantEur,
        devise: 'EUR',
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        idempotencyKey: `parrainage:${role}:${attributionId}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
        metadata: { kind: 'bonus_parrainage', attributionId, role },
      }),
    );
  }

  /**
   * Portefeuille de frais de la plateforme, créé s'il n'existe pas encore.
   * Même patron que les portefeuilles techniques créés à la demande par la
   * distribution et par la sortie de projet.
   */
  private async resoudreWalletFraisPlateforme(
    em: EntityManager,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, {
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    if (existant) return existant;

    return em.save(
      WalletEntity,
      em.create(WalletEntity, {
        type: WalletType.FRAIS_PLATEFORME,
        proprietaireUserId: null,
        fournisseurRef: 'PLAT-FEES-001',
        devise: 'EUR',
        solde: 0,
        soldeBloque: 0,
      }),
    );
  }

  private async notifierSansEchouer(
    userId: number,
    montantEur: number,
    role: 'parrain' | 'filleul',
  ): Promise<void> {
    if (montantEur <= 0) return;
    try {
      await this.notifications.push({
        utilisateurId: userId,
        // Pas de type dédié dans l'énumération : AUTRE + metadata.kind, plutôt
        // qu'étendre un enum persisté pour une seule notification.
        type: NotificationType.AUTRE,
        titre: 'Bonus de parrainage crédité',
        message:
          role === 'parrain'
            ? `Votre filleul a réalisé son premier investissement : ${montantEur.toFixed(2)} € viennent d'être crédités sur votre portefeuille.`
            : `Bienvenue chez BeOwn : votre bonus de parrainage de ${montantEur.toFixed(2)} € vient d'être crédité sur votre portefeuille.`,
        metadata: { kind: 'bonus_parrainage', role },
      });
    } catch (err) {
      this.logger.warn(
        `Notification de bonus non envoyée (user ${userId}) : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
