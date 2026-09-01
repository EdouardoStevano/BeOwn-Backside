import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';

export interface ApportPorteurInput {
  projetId: string;
  /** Identifiant du PaymentIntent encaissé — porte l'idempotence. */
  paymentIntentId: string;
  /** Montant encaissé, en EUR (unité majeure). */
  montantEur: number;
  /** Porteur à l'origine du paiement, tracé pour l'audit. */
  porteurUserId: number;
  /** Origine de l'appel, distinguée dans la métrique et la trace. */
  origine: 'confirm' | 'webhook';
}

export interface ApportPorteurResultat {
  /** `true` si le portefeuille vient d'être crédité, `false` si déjà traité. */
  credite: boolean;
  walletId: string;
  soldeApres: number;
}

/**
 * Crédite le portefeuille technique d'un projet d'un apport encaissé auprès du
 * porteur par carte.
 *
 * CE QUE CE CAS D'USAGE RÉPARE — les règlements d'échéance et les
 * distributions créditent les investisseurs. Jusqu'ici, RIEN ne créditait le
 * projet en regard : le service de la dette produisait des euros que la
 * trésorerie ne couvrait pas, et l'écart n'apparaissait qu'au rapprochement
 * PSP du lendemain matin. L'apport est la contrepartie entrante qui referme
 * cette boucle : le porteur réalimente son projet, puis le projet paie.
 *
 * DISCIPLINE D'ÉCRITURE — strictement celle du dépôt investisseur, et pour la
 * même raison : deux chemins peuvent traiter le même encaissement (la
 * confirmation synchrone du front ET le webhook du prestataire, parfois en
 * même temps). Dans UNE transaction :
 *  1. l'écriture du grand livre est insérée D'ABORD, sous clé unique
 *     `apport-porteur:<pi>` — un rejeu bute sur la contrainte d'unicité AVANT
 *     d'avoir touché au solde ;
 *  2. le crédit est un `UPDATE ... solde + :montant` atomique, jamais un
 *     read-modify-write.
 *
 * L'incrément ne peut donc pas s'exécuter deux fois pour un même encaissement,
 * quelles que soient la concurrence et les redélivrances.
 *
 * PÉRIMÈTRE — ce cas d'usage ne décide RIEN : ni qui a le droit de payer (la
 * frontière HTTP le tranche, avant même de créer l'intention), ni la devise
 * (contrôlée en amont, comme pour le dépôt). Il inscrit un encaissement déjà
 * acquis. C'est ce qui lui permet d'être appelé indifféremment par la
 * confirmation front et par le webhook, avec exactement le même effet.
 */
@Injectable()
export class CrediterApportPorteurUseCase {
  private readonly logger = new Logger(CrediterApportPorteurUseCase.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
  ) {}

  /** Clé d'idempotence d'un apport, dérivée de l'encaissement lui-même. */
  static cleIdempotence(paymentIntentId: string): string {
    return `apport-porteur:${paymentIntentId}`;
  }

  async execute(input: ApportPorteurInput): Promise<ApportPorteurResultat> {
    const idempotencyKey = CrediterApportPorteurUseCase.cleIdempotence(
      input.paymentIntentId,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Le portefeuille technique est résolu (créé au besoin) SOUS le verrou
        // de la ligne projet : c'est le point de rendez-vous unique de toutes
        // les écritures financières d'un projet, et la seule barrière qui
        // empêche deux apports concurrents de fabriquer deux portefeuilles.
        const wallet = await this.projectWalletResolver.executeInTransaction(
          manager,
          input.projetId,
        );

        // 1. Écriture D'ABORD : la contrainte d'unicité arrête tout rejeu.
        //    Contrepartie externe (la carte du porteur) → `walletSource` NULL,
        //    `walletDestination` = portefeuille du projet.
        await manager.insert(TransactionEntity, {
          walletSource: null,
          walletDestination: wallet.id,
          type: TransactionType.APPORT_PORTEUR,
          montant: input.montantEur,
          devise: 'EUR',
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.STRIPE,
          fournisseurRef: input.paymentIntentId,
          projetId: input.projetId,
          idempotencyKey,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: {
            porteurUserId: input.porteurUserId,
            paymentIntentId: input.paymentIntentId,
            origine: input.origine,
          },
        });

        // 2. Crédit atomique — atteint uniquement au premier traitement.
        await manager
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :montant' })
          .setParameter('montant', input.montantEur)
          .where('id = :id', { id: wallet.id })
          .execute();

        this.logger.log(
          `Apport porteur crédité : projet=${input.projetId} wallet=${wallet.id} ` +
          `montant=${input.montantEur} pi=${input.paymentIntentId} origine=${input.origine}`,
        );

        return {
          credite: true,
          walletId: wallet.id,
          soldeApres: Number(wallet.solde) + input.montantEur,
        };
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        // Apport déjà traité (violation d'unicité) → no-op idempotent. On
        // relit le portefeuille hors transaction pour rendre un résultat
        // exploitable par l'appelant, sans jamais retoucher au solde. Lecture
        // par le résolveur, donc filtrée sur le type TECHNIQUE_PROJET : un
        // projet peut porter d'autres portefeuilles (SPV), et rendre le
        // mauvais solde induirait l'appelant en erreur.
        const wallet = await this.projectWalletResolver.findInTransaction(
          this.dataSource.manager,
          input.projetId,
        );
        this.logger.debug(
          `Apport porteur déjà traité (idempotent) : pi=${input.paymentIntentId}`,
        );
        return {
          credite: false,
          walletId: wallet?.id ?? '',
          soldeApres: Number(wallet?.solde ?? 0),
        };
      }
      throw err;
    }
  }
}
